use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

// Event IDs verified against PyFLP (demberto/PyFLP) source: pyflp/project.py
// (ProjectID enum) and pyflp/arrangement.py (ArrangementsID enum).
const ID_TIME_SIG_NUM: u8 = 17; // ArrangementsID.TimeSigNum (byte range)
const ID_TIME_SIG_BEAT: u8 = 18; // ArrangementsID.TimeSigBeat (byte range)
const ID_TEMPO_COARSE: u8 = 66; // ProjectID._TempoCoarse (word range, legacy)
const ID_TEMPO_FINE: u8 = 93; // ProjectID._TempoFine (word range, legacy)
const ID_TEMPO: u8 = 156; // ProjectID.Tempo (dword range) = BPM * 1000
const ID_TITLE: u8 = 194; // ProjectID.Title
const ID_COMMENTS: u8 = 195; // ProjectID.Comments
const ID_URL: u8 = 197; // ProjectID.Url
const ID_RTF_COMMENTS: u8 = 198; // ProjectID._RTFComments (legacy)
const ID_FL_VERSION: u8 = 199; // ProjectID.FLVersion (always ASCII)
const ID_GENRE: u8 = 206; // ProjectID.Genre
const ID_ARTISTS: u8 = 207; // ProjectID.Artists

// If we haven't found genre/artist by this many bytes into the event
// stream, stop looking — bounds worst-case read for huge projects packed
// with automation/audio-clip events we don't care about.
const EARLY_EXIT_SOFT_CAP: u64 = 256 * 1024;

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlpMetadata {
    pub title: Option<String>,
    pub genre: Option<String>,
    pub artist: Option<String>,
    pub comment: Option<String>,
    pub url: Option<String>,
    pub fl_version: Option<String>,
    pub tempo_bpm: Option<f64>,
    pub time_sig_num: Option<u8>,
    pub time_sig_denom: Option<u8>,
    pub ppq: Option<u16>,
}

/// Best-effort metadata reader for FL Studio's undocumented `.flp` binary
/// format. Layout reverse-engineered by the PyFLP project; see comments
/// above for the exact event IDs this pulls from.
pub fn parse_flp_metadata(path: &Path) -> Result<FlpMetadata, String> {
    let file = File::open(path).map_err(|e| format!("could not open file: {e}"))?;
    let mut reader = BufReader::new(file);
    parse_from_reader(&mut reader)
}

fn parse_from_reader<R: Read>(reader: &mut R) -> Result<FlpMetadata, String> {
    let mut header = [0u8; 14];
    reader
        .read_exact(&mut header)
        .map_err(|e| format!("could not read header: {e}"))?;
    if &header[0..4] != b"FLhd" {
        return Err("not a valid FLP file (missing FLhd header)".to_string());
    }
    let ppq = u16::from_le_bytes([header[12], header[13]]);

    let mut data_header = [0u8; 8];
    reader
        .read_exact(&mut data_header)
        .map_err(|e| format!("could not read data chunk header: {e}"))?;
    if &data_header[0..4] != b"FLdt" {
        return Err("not a valid FLP file (missing FLdt chunk)".to_string());
    }
    let data_size = u32::from_le_bytes([
        data_header[4],
        data_header[5],
        data_header[6],
        data_header[7],
    ]) as u64;

    let mut meta = FlpMetadata {
        ppq: Some(ppq),
        ..Default::default()
    };
    let mut tempo_coarse: Option<u16> = None;
    let mut tempo_fine: Option<u16> = None;
    // FL < 11.5 stored strings as ASCII/Latin-1; FL >= 11.5 stores UTF-16LE.
    // The FLVersion event (always ASCII) tells us which, and per PyFLP it
    // precedes other text events in a well-formed file.
    let mut is_unicode = false;
    let mut version_seen = false;
    let mut consumed: u64 = 0;

    while consumed < data_size {
        let mut id_buf = [0u8; 1];
        if reader.read_exact(&mut id_buf).is_err() {
            break;
        }
        consumed += 1;
        let id = id_buf[0];

        if id < 64 {
            let mut buf = [0u8; 1];
            if reader.read_exact(&mut buf).is_err() {
                break;
            }
            consumed += 1;
            match id {
                ID_TIME_SIG_NUM => meta.time_sig_num = Some(buf[0]),
                ID_TIME_SIG_BEAT => meta.time_sig_denom = Some(buf[0]),
                _ => {}
            }
        } else if id < 128 {
            let mut buf = [0u8; 2];
            if reader.read_exact(&mut buf).is_err() {
                break;
            }
            consumed += 2;
            let value = u16::from_le_bytes(buf);
            match id {
                ID_TEMPO_COARSE => tempo_coarse = Some(value),
                ID_TEMPO_FINE => tempo_fine = Some(value),
                _ => {}
            }
        } else if id < 192 {
            let mut buf = [0u8; 4];
            if reader.read_exact(&mut buf).is_err() {
                break;
            }
            consumed += 4;
            if id == ID_TEMPO {
                let value = u32::from_le_bytes(buf);
                meta.tempo_bpm = Some(value as f64 / 1000.0);
            }
        } else {
            // IDs >= 192: VarInt (LEB128-style, least-significant group
            // first, high bit = continuation) length prefix, then payload.
            let mut len: u64 = 0;
            let mut shift = 0u32;
            loop {
                let mut b = [0u8; 1];
                if reader.read_exact(&mut b).is_err() {
                    return Ok(meta);
                }
                consumed += 1;
                len |= ((b[0] & 0x7f) as u64) << shift;
                if b[0] & 0x80 == 0 {
                    break;
                }
                shift += 7;
            }

            let is_needed_text = matches!(
                id,
                ID_TITLE
                    | ID_COMMENTS
                    | ID_URL
                    | ID_RTF_COMMENTS
                    | ID_FL_VERSION
                    | ID_GENRE
                    | ID_ARTISTS
            );

            if is_needed_text && len > 0 && len < 10_000_000 {
                let mut payload = vec![0u8; len as usize];
                if reader.read_exact(&mut payload).is_err() {
                    return Ok(meta);
                }
                consumed += len;

                if id == ID_FL_VERSION {
                    // Always ASCII regardless of file version.
                    let text = decode_flp_text(&payload, false);
                    if let Some((major, minor)) = parse_major_minor(&text) {
                        is_unicode = (major, minor) >= (11, 5);
                    }
                    version_seen = true;
                    meta.fl_version = Some(text);
                } else {
                    let text = decode_flp_text(&payload, is_unicode);
                    match id {
                        ID_TITLE => meta.title = Some(text),
                        ID_COMMENTS | ID_RTF_COMMENTS => {
                            if meta.comment.is_none() {
                                meta.comment = Some(text);
                            }
                        }
                        ID_URL => meta.url = Some(text),
                        ID_GENRE => meta.genre = Some(text),
                        ID_ARTISTS => meta.artist = Some(text),
                        _ => {}
                    }
                }
            } else {
                if skip_bytes(reader, len).is_err() {
                    return Ok(meta);
                }
                consumed += len;
            }
        }

        let core_done = meta.title.is_some()
            && meta.tempo_bpm.is_some()
            && meta.time_sig_num.is_some()
            && meta.time_sig_denom.is_some()
            && version_seen;
        if core_done
            && (meta.genre.is_some() || meta.artist.is_some() || consumed > EARLY_EXIT_SOFT_CAP)
        {
            break;
        }
    }

    if meta.tempo_bpm.is_none() && tempo_coarse.is_some() {
        let coarse = tempo_coarse.unwrap_or(0) as f64;
        let fine = tempo_fine.unwrap_or(0) as f64 / 1000.0;
        meta.tempo_bpm = Some(coarse + fine);
    }

    Ok(meta)
}

fn skip_bytes<R: Read>(reader: &mut R, mut remaining: u64) -> std::io::Result<()> {
    let mut buf = [0u8; 4096];
    while remaining > 0 {
        let chunk = remaining.min(buf.len() as u64) as usize;
        reader.read_exact(&mut buf[..chunk])?;
        remaining -= chunk as u64;
    }
    Ok(())
}

fn decode_flp_text(bytes: &[u8], unicode: bool) -> String {
    if unicode {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
            .trim_end_matches('\u{0}')
            .to_string()
    } else {
        // FL Studio's own encoder writes Latin-1/ASCII for pre-11.5 files;
        // mapping each byte straight to a char covers ASCII and degrades
        // gracefully rather than panicking on stray high-bit bytes.
        bytes
            .iter()
            .map(|&b| b as char)
            .collect::<String>()
            .trim_end_matches('\u{0}')
            .to_string()
    }
}

fn parse_major_minor(version: &str) -> Option<(u32, u32)> {
    let mut parts = version.trim_end_matches('\u{0}').split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    Some((major, minor))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn push_varint(buf: &mut Vec<u8>, mut value: usize) {
        loop {
            let mut byte = (value & 0x7f) as u8;
            value >>= 7;
            if value != 0 {
                byte |= 0x80;
            }
            buf.push(byte);
            if value == 0 {
                break;
            }
        }
    }

    fn push_text_event(buf: &mut Vec<u8>, id: u8, payload: &[u8]) {
        buf.push(id);
        push_varint(buf, payload.len());
        buf.extend_from_slice(payload);
    }

    fn utf16le_with_nul(s: &str) -> Vec<u8> {
        let mut out = Vec::new();
        for unit in format!("{s}\0").encode_utf16() {
            out.extend_from_slice(&unit.to_le_bytes());
        }
        out
    }

    fn ascii_with_nul(s: &str) -> Vec<u8> {
        let mut out = s.as_bytes().to_vec();
        out.push(0);
        out
    }

    /// Builds a minimal, spec-shaped .flp byte buffer (FLhd header + FLdt
    /// event stream) to verify the parser against a known-correct layout,
    /// independent of needing a real FL Studio install to test with.
    fn build_synthetic_flp() -> Vec<u8> {
        let mut events = Vec::new();

        // FLVersion (id 199) precedes other text events, as in real files.
        // 20.9 >= 11.5, so every other text event below is UTF-16LE.
        push_text_event(&mut events, 199, &ascii_with_nul("20.9.1.1234"));
        push_text_event(&mut events, 194, &utf16le_with_nul("Midnight Drift"));
        push_text_event(&mut events, 206, &utf16le_with_nul("Trap"));
        push_text_event(&mut events, 207, &utf16le_with_nul("DJ Sample"));

        // Tempo (id 156, dword range) = BPM * 1000 -> 140.5 BPM.
        events.push(156);
        events.extend_from_slice(&140_500u32.to_le_bytes());

        // Time signature: 3/4 (byte range).
        events.push(17);
        events.push(3);
        events.push(18);
        events.push(4);

        let mut file = Vec::new();
        file.extend_from_slice(b"FLhd");
        file.extend_from_slice(&6u32.to_le_bytes());
        file.extend_from_slice(&0i16.to_le_bytes()); // format = Project
        file.extend_from_slice(&4u16.to_le_bytes()); // num_channels
        file.extend_from_slice(&96u16.to_le_bytes()); // ppq

        file.extend_from_slice(b"FLdt");
        file.extend_from_slice(&(events.len() as u32).to_le_bytes());
        file.extend_from_slice(&events);
        file
    }

    #[test]
    fn parses_synthetic_flp_metadata() {
        let bytes = build_synthetic_flp();
        let mut cursor = Cursor::new(bytes);
        let meta = parse_from_reader(&mut cursor).expect("parse should succeed");

        assert_eq!(meta.ppq, Some(96));
        assert_eq!(meta.fl_version.as_deref(), Some("20.9.1.1234"));
        assert_eq!(meta.title.as_deref(), Some("Midnight Drift"));
        assert_eq!(meta.genre.as_deref(), Some("Trap"));
        assert_eq!(meta.artist.as_deref(), Some("DJ Sample"));
        assert_eq!(meta.tempo_bpm, Some(140.5));
        assert_eq!(meta.time_sig_num, Some(3));
        assert_eq!(meta.time_sig_denom, Some(4));
    }

    #[test]
    fn legacy_ascii_and_tempo_fallback() {
        let mut events = Vec::new();
        // 8.0 < 11.5 -> ASCII text events.
        push_text_event(&mut events, 199, &ascii_with_nul("8.0.0.0"));
        push_text_event(&mut events, 194, &ascii_with_nul("Old School Loop"));

        // Legacy tempo: coarse (word, id 66) + fine (word, id 93).
        events.push(66);
        events.extend_from_slice(&128u16.to_le_bytes());
        events.push(93);
        events.extend_from_slice(&250u16.to_le_bytes());

        events.push(17);
        events.push(4);
        events.push(18);
        events.push(4);

        let mut file = Vec::new();
        file.extend_from_slice(b"FLhd");
        file.extend_from_slice(&6u32.to_le_bytes());
        file.extend_from_slice(&0i16.to_le_bytes());
        file.extend_from_slice(&2u16.to_le_bytes());
        file.extend_from_slice(&96u16.to_le_bytes());
        file.extend_from_slice(b"FLdt");
        file.extend_from_slice(&(events.len() as u32).to_le_bytes());
        file.extend_from_slice(&events);

        let mut cursor = Cursor::new(file);
        let meta = parse_from_reader(&mut cursor).expect("parse should succeed");

        assert_eq!(meta.title.as_deref(), Some("Old School Loop"));
        assert_eq!(meta.tempo_bpm, Some(128.25));
        assert_eq!(meta.genre, None);
    }

    #[test]
    fn rejects_non_flp_bytes() {
        let mut cursor = Cursor::new(b"not an flp file".to_vec());
        assert!(parse_from_reader(&mut cursor).is_err());
    }
}
