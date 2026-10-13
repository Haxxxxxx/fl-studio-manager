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
        429 => "Free-tier limit reached. Wait a minute (daily limits reset at midnight Pacific) and try again.".to_string(),
        500..=599 => format!("Gemini is having trouble right now ({status}). Try again in a moment."),
        _ if !msg.is_empty() => format!("Gemini error: {msg}"),
        _ => format!("Gemini error (HTTP {status})."),
    }
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
) -> Result<Value, String> {
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
    let res = client
        .post(format!("{ENDPOINT}/{model}:generateContent"))
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "Gemini took too long to answer. Try again.".to_string() } else { format!("Couldn't reach Gemini. Are you online? ({e})") })?;
    let status = res.status().as_u16();
    let v: Value = res.json().await.unwrap_or(Value::Null);
    if !(200..300).contains(&status) {
        return Err(explain_error(status, &v, &model));
    }
    let text = extract_text(&v).ok_or_else(|| empty_reason(&v))?;
    serde_json::from_str(&text).map_err(|e| format!("Gemini's answer wasn't valid JSON ({e}). Try again."))
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
    fn validates_model_names() {
        assert!(valid_model("gemini-3.8-flash"));
        assert!(!valid_model("../../etc"));
        assert!(!valid_model("a b"));
        assert!(!valid_model(""));
    }
}
