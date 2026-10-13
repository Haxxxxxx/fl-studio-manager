//! The AI layer's transport: Gemini (Gemini API free tier) with JSON-schema
//! output. Prompts and schemas live in the frontend (src/lib/ai.ts) next to
//! the kit logic; this side only holds the key and talks to the API, so the
//! key never reaches the webview.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const DEFAULT_MODEL: &str = "gemini-3.8-flash";
const ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY_ENV: &str = "GEMINI_API_KEY";

#[derive(Default, Serialize, Deserialize)]
struct AiSecrets {
    #[serde(default)]
    gemini_api_key: Option<String>,
}

fn secrets_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| format!("could not resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config dir: {e}"))?;
    Ok(dir.join("ai.json"))
}

fn read_secrets(app: &AppHandle) -> AiSecrets {
    secrets_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// The environment wins (dev machines), else the key saved from Settings.
fn api_key(app: &AppHandle) -> Option<(String, &'static str)> {
    if let Some(k) = std::env::var(KEY_ENV).ok().filter(|k| !k.trim().is_empty()) {
        return Some((k.trim().to_string(), "env"));
    }
    read_secrets(app)
        .gemini_api_key
        .filter(|k| !k.trim().is_empty())
        .map(|k| (k.trim().to_string(), "settings"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub configured: bool,
    /// "env" or "settings".
    pub source: Option<String>,
    pub default_model: String,
}

#[tauri::command]
pub fn ai_status(app: AppHandle) -> AiStatus {
    let key = api_key(&app);
    AiStatus {
        configured: key.is_some(),
        source: key.map(|(_, s)| s.to_string()),
        default_model: DEFAULT_MODEL.to_string(),
    }
}

/// Saves (or, with None/empty, removes) the key. Never returned to the UI.
#[tauri::command]
pub fn set_ai_key(app: AppHandle, key: Option<String>) -> Result<(), String> {
    let path = secrets_path(&app)?;
    let key = key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty());
    if key.is_none() {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("could not remove the key: {e}")),
        };
    }
    let raw = serde_json::to_string_pretty(&AiSecrets { gemini_api_key: key }).map_err(|e| e.to_string())?;
    // Owner-only from the moment it exists (no world-readable window).
    // On Windows the per-user %APPDATA% ACL is what protects it.
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        options.mode(0o600);
        // An older file may have been created with wider permissions.
        if path.exists() {
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| format!("could not secure the key file: {e}"))?;
        }
    }
    let mut file = options.open(&path).map_err(|e| format!("could not save the key: {e}"))?;
    std::io::Write::write_all(&mut file, raw.as_bytes()).map_err(|e| format!("could not save the key: {e}"))
}

/// Model ids go into the URL path: letters, digits, `.`, `-`, `_` only.
fn valid_model(model: &str) -> bool {
    !model.is_empty() && model.len() <= 64 && model.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// All text parts of the first candidate (skipping thought summaries).
fn extract_text(v: &Value) -> Option<String> {
    let parts = v.pointer("/candidates/0/content/parts")?.as_array()?;
    let text: String = parts
        .iter()
        .filter(|p| !p.get("thought").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|p| p.get("text").and_then(Value::as_str))
        .collect();
    (!text.trim().is_empty()).then_some(text)
}

/// Why there's no answer when the response was 200 but empty.
fn empty_reason(v: &Value) -> String {
    if let Some(r) = v.pointer("/promptFeedback/blockReason").and_then(Value::as_str) {
        return format!("Gemini declined the request (blocked: {r}).");
    }
    match v.pointer("/candidates/0/finishReason").and_then(Value::as_str) {
        Some("SAFETY") => "Gemini stopped for safety reasons. Try again, or edit the text by hand.".to_string(),
        Some("MAX_TOKENS") => "Gemini's answer was cut off. Try again.".to_string(),
        Some(r) => format!("Gemini returned no text (finish reason: {r})."),
        None => "Gemini returned no text.".to_string(),
    }
}

/// HTTP errors in words the crew can act on.
fn explain_error(status: u16, v: &Value, model: &str) -> String {
    let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("");
    match status {
        400 if msg.to_lowercase().contains("api key") => "The Gemini API key was rejected. Check it in Settings → AI.".to_string(),
        401 | 403 => "This Gemini API key isn't allowed to use the API. Check it in Settings → AI.".to_string(),
        404 => format!("Gemini model \"{model}\" wasn't found. Pick another one in Settings → AI."),
        429 => "Free-tier limit reached, even after waiting. Try again in a minute (daily limits reset at midnight Pacific).".to_string(),
        500..=599 => format!(
            "Gemini is overloaded right now ({status}), even after several retries and the backup model {FALLBACK_MODEL}. This is on Google's side: try again in a few minutes."
        ),
        _ if !msg.is_empty() => format!("Gemini error: {msg}"),
        _ => format!("Gemini error (HTTP {status})."),
    }
}

/// Tried once when the chosen model stays overloaded after its retries.
pub const FALLBACK_MODEL: &str = "gemini-3.5-flash-lite";
/// Retries after the first attempt (Google's own SDKs default to 4).
const MAX_RETRIES: u32 = 4;
const FALLBACK_RETRIES: u32 = 2;
/// Longest server-suggested wait we sit through; longer (daily quota) fails fast.
const MAX_WAIT: Duration = Duration::from_secs(20);

/// Transient per Google's guidance: rate limits, timeouts, server errors.
fn retryable(status: u16) -> bool {
    matches!(status, 408 | 429 | 500..=599)
}

/// Exponential backoff with jitter: ~1 s, 2 s, 4 s, 8 s, plus 0–400 ms so
/// many clients don't retry in lockstep.
fn backoff(attempt: u32) -> Duration {
    let jitter = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_millis() as u64 % (BACKOFF_BASE_MS * 2 / 5))
        .unwrap_or(0);
    Duration::from_millis(BACKOFF_BASE_MS * 2u64.pow(attempt.min(5)) + jitter)
}

/// Milliseconds before the first retry (tiny in tests so they stay fast).
const BACKOFF_BASE_MS: u64 = if cfg!(test) { 10 } else { 1000 };

/// Google's own hint in an error body (`"retryDelay": "17s"`), if any.
fn retry_delay_hint(v: &Value) -> Option<Duration> {
    v.pointer("/error/details")?
        .as_array()?
        .iter()
        .find_map(|d| d.get("retryDelay")?.as_str())
        .and_then(|s| s.trim().trim_end_matches('s').parse::<f64>().ok())
        .filter(|s| s.is_finite() && *s >= 0.0)
        .map(Duration::from_secs_f64)
}

enum Failure {
    Http(u16, Value),
    Other(String),
}

/// One model, retrying transient failures with backoff.
async fn generate(client: &reqwest::Client, endpoint: &str, key: &str, model: &str, body: &Value, retries: u32) -> Result<Value, Failure> {
    let mut attempt = 0;
    loop {
        let sent = client
            .post(format!("{endpoint}/{model}:generateContent"))
            .header("x-goog-api-key", key)
            .json(body)
            .send()
            .await;
        let (status, v) = match sent {
            Ok(res) => {
                let status = res.status().as_u16();
                (status, res.json().await.unwrap_or(Value::Null))
            }
            Err(e) if e.is_timeout() => return Err(Failure::Other("Gemini took too long to answer. Try again.".to_string())),
            Err(e) if e.is_connect() && attempt < retries => {
                tokio::time::sleep(backoff(attempt)).await;
                attempt += 1;
                continue;
            }
            Err(e) => return Err(Failure::Other(format!("Couldn't reach Gemini. Are you online? ({e})"))),
        };
        if (200..300).contains(&status) {
            return Ok(v);
        }
        if retryable(status) && attempt < retries {
            let wait = retry_delay_hint(&v).unwrap_or_else(|| backoff(attempt));
            if wait <= MAX_WAIT {
                tokio::time::sleep(wait).await;
                attempt += 1;
                continue;
            }
        }
        return Err(Failure::Http(status, v));
    }
}

/// The chosen model with retries; if it stays overloaded (5xx), one go on
/// the other free model. Returns the model that answered.
async fn generate_with_fallback(client: &reqwest::Client, endpoint: &str, key: &str, model: &str, body: &Value) -> (String, Result<Value, Failure>) {
    let result = generate(client, endpoint, key, model, body, MAX_RETRIES).await;
    if matches!(&result, Err(Failure::Http(s, _)) if *s >= 500) && model != FALLBACK_MODEL {
        if let ok @ Ok(_) = generate(client, endpoint, key, FALLBACK_MODEL, body, FALLBACK_RETRIES).await {
            return (FALLBACK_MODEL.to_string(), ok);
        }
    }
    (model.to_string(), result)
}

#[derive(Serialize)]
pub struct AiAnswer {
    /// The model that actually answered (the fallback, if it had to be).
    pub model: String,
    pub data: Value,
}

/// One structured call: system + prompt in, JSON matching `schema` out.
#[tauri::command]
pub async fn ai_generate_json(
    app: AppHandle,
    model: Option<String>,
    system: String,
    prompt: String,
    schema: Value,
    temperature: Option<f32>,
) -> Result<AiAnswer, String> {
    let (key, _) = api_key(&app).ok_or("No Gemini API key yet. Add a free one in Settings → AI.")?;
    let model = model.map(|m| m.trim().to_string()).filter(|m| !m.is_empty()).unwrap_or_else(|| DEFAULT_MODEL.to_string());
    if !valid_model(&model) {
        return Err(format!("\"{model}\" isn't a valid model name."));
    }
    let body = json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": temperature.unwrap_or(0.4),
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("could not start the HTTP client: {e}"))?;

    let (used, result) = generate_with_fallback(&client, ENDPOINT, &key, &model, &body).await;
    let v = result.map_err(|f| match f {
        Failure::Http(status, v) => explain_error(status, &v, &model),
        Failure::Other(message) => message,
    })?;
    let text = extract_text(&v).ok_or_else(|| empty_reason(&v))?;
    let data = serde_json::from_str(&text).map_err(|e| format!("Gemini's answer wasn't valid JSON ({e}). Try again."))?;
    Ok(AiAnswer { model: used, data })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_text_skipping_thoughts() {
        let v = json!({ "candidates": [{ "content": { "parts": [
            { "text": "thinking…", "thought": true },
            { "text": "{\"a\":" },
            { "text": "1}" }
        ] } }] });
        assert_eq!(extract_text(&v).as_deref(), Some("{\"a\":1}"));
        assert_eq!(extract_text(&json!({ "candidates": [] })), None);
    }

    #[test]
    fn explains_empty_answers() {
        assert!(empty_reason(&json!({ "promptFeedback": { "blockReason": "SAFETY" } })).contains("blocked: SAFETY"));
        assert!(empty_reason(&json!({ "candidates": [{ "finishReason": "MAX_TOKENS" }] })).contains("cut off"));
    }

    #[test]
    fn explains_http_errors() {
        let bad_key = json!({ "error": { "message": "API key not valid. Please pass a valid API key." } });
        assert!(explain_error(400, &bad_key, "m").contains("rejected"));
        assert!(explain_error(429, &Value::Null, "m").contains("Free-tier limit"));
        assert!(explain_error(404, &Value::Null, "gemini-x").contains("gemini-x"));
        assert!(explain_error(503, &Value::Null, "m").contains("503"));
    }

    #[test]
    fn retries_only_transient_errors() {
        for s in [408, 429, 500, 502, 503, 504] {
            assert!(retryable(s), "{s} should be retried");
        }
        for s in [400, 401, 403, 404] {
            assert!(!retryable(s), "{s} should not be retried");
        }
    }

    #[test]
    fn backoff_grows_exponentially() {
        let base = BACKOFF_BASE_MS as u128;
        for a in 0..4 {
            let m = backoff(a).as_millis();
            let floor = base * 2u128.pow(a);
            assert!((floor..floor + base * 2 / 5).contains(&m), "attempt {a}: {m} ms");
        }
    }

    /// A local HTTP server that answers each request with the next canned
    /// response and counts requests per model.
    fn mock_gemini(responses: Vec<(u16, Value)>) -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for (status, body) in responses {
                let Ok((mut stream, _)) = listener.accept() else { return };
                let mut buf = Vec::new();
                let mut chunk = [0u8; 4096];
                // Read headers, then the body by Content-Length.
                let (head_end, length) = loop {
                    let n = stream.read(&mut chunk).unwrap();
                    buf.extend_from_slice(&chunk[..n]);
                    if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&buf[..i]).to_lowercase();
                        let len = head
                            .lines()
                            .find_map(|l| l.strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                            .unwrap_or(0);
                        break (i + 4, len);
                    }
                };
                while buf.len() < head_end + length {
                    let n = stream.read(&mut chunk).unwrap();
                    buf.extend_from_slice(&chunk[..n]);
                }
                let request_line = String::from_utf8_lossy(&buf).lines().next().unwrap_or("").to_string();
                log.lock().unwrap().push(request_line);
                let body = body.to_string();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    fn answer(text: &str) -> Value {
        json!({ "candidates": [{ "content": { "parts": [{ "text": text }] } }] })
    }

    #[test]
    fn retries_503_until_it_works() {
        let busy = json!({ "error": { "code": 503, "message": "The model is overloaded." } });
        let (base, seen) = mock_gemini(vec![(503, busy.clone()), (503, busy), (200, answer("{\"ok\":true}"))]);
        let client = reqwest::Client::new();
        let (model, result) = tauri::async_runtime::block_on(generate_with_fallback(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(result.is_ok(), "should succeed on the third try");
        assert_eq!(model, DEFAULT_MODEL);
        assert_eq!(seen.lock().unwrap().len(), 3);
    }

    #[test]
    fn does_not_retry_a_bad_key() {
        let bad = json!({ "error": { "code": 400, "message": "API key not valid." } });
        let (base, seen) = mock_gemini(vec![(400, bad)]);
        let client = reqwest::Client::new();
        let (_, result) = tauri::async_runtime::block_on(generate_with_fallback(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(matches!(result, Err(Failure::Http(400, _))));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[test]
    fn falls_back_when_the_model_stays_overloaded() {
        let busy = json!({ "error": { "code": 503 } });
        // 1 try + 4 retries on the default model, then the fallback answers.
        let mut responses = vec![(503, busy); 1 + MAX_RETRIES as usize];
        responses.push((200, answer("{\"ok\":true}")));
        let (base, seen) = mock_gemini(responses);
        let client = reqwest::Client::new();
        let (model, result) = tauri::async_runtime::block_on(generate_with_fallback(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(result.is_ok());
        assert_eq!(model, FALLBACK_MODEL);
        let seen = seen.lock().unwrap();
        assert!(seen.last().unwrap().contains(FALLBACK_MODEL), "last call: {}", seen.last().unwrap());
        assert_eq!(seen.len(), 2 + MAX_RETRIES as usize);
    }

    #[test]
    fn reads_googles_retry_hint() {
        let v = json!({ "error": { "code": 429, "details": [
            { "@type": "type.googleapis.com/google.rpc.QuotaFailure" },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "17s" }
        ] } });
        assert_eq!(retry_delay_hint(&v), Some(Duration::from_secs(17)));
        assert_eq!(retry_delay_hint(&json!({ "error": {} })), None);
    }

    #[test]
    fn validates_model_names() {
        assert!(valid_model("gemini-3.8-flash"));
        assert!(!valid_model("../../etc"));
        assert!(!valid_model("a b"));
        assert!(!valid_model(""));
    }
}
