//! The AI layer's transport. Two providers behind one structured-JSON call:
//! Gemini (Gemini API free tier) for release builds, and Claude (Anthropic
//! Messages API) for development builds (`npm run tauri dev`), so dev
//! sessions don't burn the free Gemini quota.
//!
//! Prompts and schemas live in the frontend (src/lib/ai.ts) next to the kit
//! logic; this side holds the keys and talks to the APIs, so keys never reach
//! the webview.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const DEFAULT_MODEL: &str = "gemini-3.8-flash";
/// Tried once when the chosen Gemini model stays overloaded after its retries.
pub const FALLBACK_MODEL: &str = "gemini-3.5-flash-lite";
pub const DEFAULT_CLAUDE_MODEL: &str = "claude-opus-5-5";
const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const CLAUDE_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const GEMINI_KEY_ENV: &str = "GEMINI_API_KEY";
const CLAUDE_KEY_ENV: &str = "ANTHROPIC_API_KEY";
/// Server-side refusal fallbacks (Claude): re-runs a declined request on a
/// fallback model inside the same call.
const CLAUDE_FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
/// Hard cap on one AI action, retries included: it never spins forever.
const DEADLINE: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    Claude,
}

impl Provider {
    fn name(self) -> &'static str {
        match self {
            Provider::Gemini => "Gemini",
            Provider::Claude => "Claude",
        }
    }
}

// ---- Keys ----

#[derive(Default, Serialize, Deserialize)]
struct AiSecrets {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gemini_api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anthropic_api_key: Option<String>,
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
fn key_for(app: &AppHandle, provider: Provider) -> Option<(String, &'static str)> {
    let env = match provider {
        Provider::Gemini => GEMINI_KEY_ENV,
        Provider::Claude => CLAUDE_KEY_ENV,
    };
    if let Some(k) = std::env::var(env).ok().filter(|k| !k.trim().is_empty()) {
        return Some((k.trim().to_string(), "env"));
    }
    let s = read_secrets(app);
    match provider {
        Provider::Gemini => s.gemini_api_key,
        Provider::Claude => s.anthropic_api_key,
    }
    .filter(|k| !k.trim().is_empty())
    .map(|k| (k.trim().to_string(), "settings"))
}

/// Which provider answers. An explicit "gemini"/"claude" choice wins; "auto"
/// (or nothing) prefers Claude in development builds and Gemini in release
/// builds, falling back to whichever one has a key.
pub fn resolve_provider(choice: Option<&str>, dev_build: bool, has_gemini: bool, has_claude: bool) -> Option<Provider> {
    match choice.map(str::trim) {
        Some("gemini") => return Some(Provider::Gemini),
        Some("claude") => return Some(Provider::Claude),
        _ => {}
    }
    let preferred = if dev_build { Provider::Claude } else { Provider::Gemini };
    let has = |p: Provider| if p == Provider::Gemini { has_gemini } else { has_claude };
    [preferred, if preferred == Provider::Claude { Provider::Gemini } else { Provider::Claude }]
        .into_iter()
        .find(|p| has(*p))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub configured: bool,
    /// "env" or "settings".
    pub source: Option<String>,
    pub default_model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    /// The active provider has a key (AI features can run).
    pub configured: bool,
    /// The provider that will answer, given the choice and the keys.
    pub provider: Option<Provider>,
    /// `npm run tauri dev` (true) vs a release build.
    pub dev_build: bool,
    pub gemini: ProviderStatus,
    pub claude: ProviderStatus,
    // Kept for older callers: the active provider's key source and model.
    pub source: Option<String>,
    pub default_model: String,
}

#[tauri::command]
pub fn ai_status(app: AppHandle, provider: Option<String>) -> AiStatus {
    let g = key_for(&app, Provider::Gemini);
    let c = key_for(&app, Provider::Claude);
    let dev_build = cfg!(debug_assertions);
    let active = resolve_provider(provider.as_deref(), dev_build, g.is_some(), c.is_some());
    let (source, default_model, configured) = match active {
        Some(Provider::Gemini) => (g.as_ref().map(|k| k.1.to_string()), DEFAULT_MODEL, g.is_some()),
        Some(Provider::Claude) => (c.as_ref().map(|k| k.1.to_string()), DEFAULT_CLAUDE_MODEL, c.is_some()),
        None => (None, DEFAULT_MODEL, false),
    };
    AiStatus {
        configured,
        provider: active,
        dev_build,
        gemini: ProviderStatus { configured: g.is_some(), source: g.map(|k| k.1.to_string()), default_model: DEFAULT_MODEL.into() },
        claude: ProviderStatus { configured: c.is_some(), source: c.map(|k| k.1.to_string()), default_model: DEFAULT_CLAUDE_MODEL.into() },
        source,
        default_model: default_model.into(),
    }
}

/// Saves (or, with None/empty, removes) one provider's key ("gemini" by
/// default, or "claude"). Never returned to the UI.
#[tauri::command]
pub fn set_ai_key(app: AppHandle, key: Option<String>, provider: Option<String>) -> Result<(), String> {
    let path = secrets_path(&app)?;
    let key = key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty());
    let mut secrets = read_secrets(&app);
    match provider.as_deref() {
        Some("claude") => secrets.anthropic_api_key = key,
        _ => secrets.gemini_api_key = key,
    }
    if secrets.gemini_api_key.is_none() && secrets.anthropic_api_key.is_none() {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("could not remove the key: {e}")),
        };
    }
    let raw = serde_json::to_string_pretty(&secrets).map_err(|e| e.to_string())?;
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

/// Model ids go into the URL path or body: letters, digits, `.`, `-`, `_` only.
fn valid_model(model: &str) -> bool {
    !model.is_empty() && model.len() <= 64 && model.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

// ---- Request bodies ----

fn gemini_body(system: &str, prompt: &str, schema: &Value, temperature: Option<f32>) -> Value {
    json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": temperature.unwrap_or(0.4),
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    })
}

/// The frontend writes schemas Gemini-style (`"type": "OBJECT"`). Claude's
/// structured outputs take standard JSON Schema, with
/// `additionalProperties: false` on every object.
pub fn to_json_schema(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, val) in map {
                let converted = if k == "type" {
                    val.as_str().map(|t| Value::String(t.to_lowercase())).unwrap_or_else(|| val.clone())
                } else {
                    to_json_schema(val)
                };
                out.insert(k.clone(), converted);
            }
            if out.get("type").and_then(Value::as_str) == Some("object") {
                out.insert("additionalProperties".into(), Value::Bool(false));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(to_json_schema).collect()),
        other => other.clone(),
    }
}

/// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
fn claude_supports_fallbacks(model: &str) -> bool {
    matches!(model, "claude-opus-5-5" | "claude-opus-5" | "claude-fable-5-1" | "claude-sonnet-5-5")
}

/// No `temperature`: current Claude models reject sampling parameters.
/// Effort `low`: short structured tasks, and it keeps the buttons fast.
fn claude_body(model: &str, system: &str, prompt: &str, schema: &Value) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": 16000,
        "system": system,
        "messages": [{ "role": "user", "content": prompt }],
        "output_config": {
            "effort": "low",
            "format": { "type": "json_schema", "schema": to_json_schema(schema) },
        },
    });
    if claude_supports_fallbacks(model) {
        body["fallbacks"] = json!("default");
    }
    body
}

// ---- Responses ----

/// Gemini: all text parts of the first candidate (skipping thought summaries).
fn extract_text(v: &Value) -> Option<String> {
    let parts = v.pointer("/candidates/0/content/parts")?.as_array()?;
    let text: String = parts
        .iter()
        .filter(|p| !p.get("thought").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|p| p.get("text").and_then(Value::as_str))
        .collect();
    (!text.trim().is_empty()).then_some(text)
}

/// Gemini: why there's no answer when the response was 200 but empty.
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

/// Claude: the text blocks of the message, after checking why it stopped.
fn claude_text(v: &Value) -> Result<String, String> {
    match v.get("stop_reason").and_then(Value::as_str) {
        Some("refusal") => return Err("Claude declined this request. Edit the text by hand, or try again.".to_string()),
        Some("max_tokens") => return Err("Claude's answer was cut off. Try again.".to_string()),
        _ => {}
    }
    let text: String = v
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    if text.trim().is_empty() {
        Err("Claude returned no text. Try again.".to_string())
    } else {
        Ok(text)
    }
}

/// HTTP errors in words the crew can act on.
fn explain_error(provider: Provider, status: u16, v: &Value, model: &str) -> String {
    let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("");
    match provider {
        Provider::Gemini => match status {
            400 if msg.to_lowercase().contains("api key") => "The Gemini API key was rejected. Check it in Settings → AI.".to_string(),
            401 | 403 => "This Gemini API key isn't allowed to use the API. Check it in Settings → AI.".to_string(),
            404 => format!("Gemini model \"{model}\" wasn't found. Pick another one in Settings → AI."),
            429 => "Free-tier limit reached, even after waiting. Try again in a minute (daily limits reset at midnight Pacific).".to_string(),
            500..=599 => format!(
                "Gemini is overloaded right now ({status}), even after several retries and the backup model {FALLBACK_MODEL}. This is on Google's side: try again in a few minutes."
            ),
            _ if !msg.is_empty() => format!("Gemini error: {msg}"),
            _ => format!("Gemini error (HTTP {status})."),
        },
        Provider::Claude => match status {
            401 => "The Anthropic API key was rejected. Check it in Settings → AI.".to_string(),
            402 => "Your Anthropic account is out of credit. Add billing at console.anthropic.com, or switch the AI provider to Gemini.".to_string(),
            403 => "This Anthropic API key isn't allowed to do that. Check it in Settings → AI.".to_string(),
            404 => format!("Claude model \"{model}\" wasn't found or isn't available to your account. Pick another one in Settings → AI."),
            429 => "Anthropic rate limit reached, even after waiting. Try again in a minute.".to_string(),
            // 529 = overloaded_error.
            500..=599 => format!("Claude is overloaded right now ({status}), even after several retries. Try again in a few minutes."),
            _ if !msg.is_empty() => format!("Claude error: {msg}"),
            _ => format!("Claude error (HTTP {status})."),
        },
    }
}

// ---- Transport with retries ----

/// Retries after the first attempt (Google's and Anthropic's SDKs retry too).
const MAX_RETRIES: u32 = 4;
const FALLBACK_RETRIES: u32 = 2;
/// Longest server-suggested wait we sit through; longer (daily quota) fails fast.
const MAX_WAIT: Duration = Duration::from_secs(20);

/// Transient: rate limits, timeouts, server errors (529 = Claude overloaded).
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

/// Anthropic's `retry-after` header (seconds), if any.
fn retry_after_header(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    headers
        .get("retry-after")?
        .to_str()
        .ok()?
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|s| s.is_finite() && *s >= 0.0)
        .map(Duration::from_secs_f64)
}

enum Failure {
    Http(u16, Value),
    Other(String),
}

/// Where one request goes and how it authenticates.
struct Target<'a> {
    provider: Provider,
    url: String,
    key: &'a str,
}

impl Target<'_> {
    fn request(&self, client: &reqwest::Client, body: &Value) -> reqwest::RequestBuilder {
        let req = client.post(&self.url).json(body);
        match self.provider {
            Provider::Gemini => req.header("x-goog-api-key", self.key),
            Provider::Claude => {
                let req = req.header("x-api-key", self.key).header("anthropic-version", "2023-06-01");
                if body.get("fallbacks").is_some() {
                    req.header("anthropic-beta", CLAUDE_FALLBACK_BETA)
                } else {
                    req
                }
            }
        }
    }
}

/// One target, retrying transient failures with backoff.
async fn generate(client: &reqwest::Client, target: &Target<'_>, body: &Value, retries: u32) -> Result<Value, Failure> {
    let mut attempt = 0;
    loop {
        let (status, header_hint, v) = match target.request(client, body).send().await {
            Ok(res) => {
                let status = res.status().as_u16();
                let hint = retry_after_header(res.headers());
                (status, hint, res.json().await.unwrap_or(Value::Null))
            }
            Err(e) if e.is_timeout() => {
                return Err(Failure::Other(format!("{} took too long to answer. Try again.", target.provider.name())))
            }
            Err(e) if e.is_connect() && attempt < retries => {
                tokio::time::sleep(backoff(attempt)).await;
                attempt += 1;
                continue;
            }
            Err(e) => {
                return Err(Failure::Other(format!(
                    "Couldn't reach {}. Are you online? ({})",
                    target.provider.name(),
                    e.without_url()
                )))
            }
        };
        if (200..300).contains(&status) {
            return Ok(v);
        }
        if retryable(status) && attempt < retries {
            let wait = header_hint.or_else(|| retry_delay_hint(&v)).unwrap_or_else(|| backoff(attempt));
            if wait <= MAX_WAIT {
                tokio::time::sleep(wait).await;
                attempt += 1;
                continue;
            }
        }
        return Err(Failure::Http(status, v));
    }
}

fn gemini_target<'a>(endpoint: &str, key: &'a str, model: &str) -> Target<'a> {
    Target { provider: Provider::Gemini, url: format!("{endpoint}/{model}:generateContent"), key }
}

/// Gemini with retries; if it stays overloaded (5xx), one go on the other
/// free model. Returns the model that answered.
async fn generate_gemini(client: &reqwest::Client, endpoint: &str, key: &str, model: &str, body: &Value) -> (String, Result<Value, Failure>) {
    let result = generate(client, &gemini_target(endpoint, key, model), body, MAX_RETRIES).await;
    if matches!(&result, Err(Failure::Http(s, _)) if *s >= 500) && model != FALLBACK_MODEL {
        if let ok @ Ok(_) = generate(client, &gemini_target(endpoint, key, FALLBACK_MODEL), body, FALLBACK_RETRIES).await {
            return (FALLBACK_MODEL.to_string(), ok);
        }
    }
    (model.to_string(), result)
}

/// Claude with retries. Refusal fallbacks happen server-side; the response's
/// `model` names the model that actually answered.
async fn generate_claude(client: &reqwest::Client, endpoint: &str, key: &str, model: &str, body: &Value) -> (String, Result<Value, Failure>) {
    let target = Target { provider: Provider::Claude, url: endpoint.to_string(), key };
    let result = generate(client, &target, body, MAX_RETRIES).await;
    let used = result
        .as_ref()
        .ok()
        .and_then(|v| v.get("model").and_then(Value::as_str))
        .unwrap_or(model)
        .to_string();
    (used, result)
}

#[derive(Serialize)]
pub struct AiAnswer {
    /// The model that actually answered (a fallback, if it had to be).
    pub model: String,
    pub provider: Provider,
    pub data: Value,
}

/// One structured call: system + prompt in, JSON matching `schema` out.
/// `provider` is the user's choice ("auto", "gemini", "claude"); `model` is the
/// Gemini model and `claude_model` the Claude one (defaults when empty).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_generate_json(
    app: AppHandle,
    provider: Option<String>,
    model: Option<String>,
    claude_model: Option<String>,
    system: String,
    prompt: String,
    schema: Value,
    temperature: Option<f32>,
) -> Result<AiAnswer, String> {
    let has_gemini = key_for(&app, Provider::Gemini).is_some();
    let has_claude = key_for(&app, Provider::Claude).is_some();
    let provider = resolve_provider(provider.as_deref(), cfg!(debug_assertions), has_gemini, has_claude)
        .ok_or("No AI key yet. Add a free Gemini key (or an Anthropic key for development) in Settings → AI.")?;
    let (key, _) = key_for(&app, provider).ok_or(match provider {
        Provider::Gemini => "No Gemini API key yet. Add a free one in Settings → AI.",
        Provider::Claude => "No Anthropic API key yet. Add one in Settings → AI, or switch the provider to Gemini.",
    })?;
    let clean = |m: Option<String>| m.map(|m| m.trim().to_string()).filter(|m| !m.is_empty());
    let model = match provider {
        Provider::Gemini => clean(model).unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        Provider::Claude => clean(claude_model).unwrap_or_else(|| DEFAULT_CLAUDE_MODEL.to_string()),
    };
    if !valid_model(&model) {
        return Err(format!("\"{model}\" isn't a valid model name."));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("could not start the HTTP client: {e}"))?;

    let call = async {
        match provider {
            Provider::Gemini => generate_gemini(&client, GEMINI_ENDPOINT, &key, &model, &gemini_body(&system, &prompt, &schema, temperature)).await,
            Provider::Claude => generate_claude(&client, CLAUDE_ENDPOINT, &key, &model, &claude_body(&model, &system, &prompt, &schema)).await,
        }
    };
    let (used, result) = tokio::time::timeout(DEADLINE, call).await.map_err(|_| {
        format!("{} didn't answer within 2 minutes (busy or rate-limited). Try again later.", provider.name())
    })?;
    let v = result.map_err(|f| match f {
        Failure::Http(status, v) => explain_error(provider, status, &v, &model),
        Failure::Other(message) => message,
    })?;
    let text = match provider {
        Provider::Gemini => extract_text(&v).ok_or_else(|| empty_reason(&v))?,
        Provider::Claude => claude_text(&v)?,
    };
    let data = serde_json::from_str(&text)
        .map_err(|e| format!("{}'s answer wasn't valid JSON ({e}). Try again.", provider.name()))?;
    Ok(AiAnswer { model: used, provider, data })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_prefers_claude_in_dev_and_gemini_in_release() {
        use Provider::*;
        assert_eq!(resolve_provider(Some("auto"), true, true, true), Some(Claude));
        assert_eq!(resolve_provider(None, false, true, true), Some(Gemini));
        // Falls back to whichever has a key.
        assert_eq!(resolve_provider(None, true, true, false), Some(Gemini));
        assert_eq!(resolve_provider(None, false, false, true), Some(Claude));
        assert_eq!(resolve_provider(None, true, false, false), None);
        // An explicit choice wins, key or not (the error then names the key).
        assert_eq!(resolve_provider(Some("gemini"), true, false, true), Some(Gemini));
        assert_eq!(resolve_provider(Some("claude"), false, true, false), Some(Claude));
    }

    #[test]
    fn converts_gemini_schemas_to_json_schema() {
        let gemini = json!({
            "type": "OBJECT",
            "properties": {
                "fields": { "type": "ARRAY", "items": { "type": "OBJECT", "properties": {
                    "id": { "type": "STRING", "enum": ["title", "bpm"] },
                    "confidence": { "type": "NUMBER" }
                }, "required": ["id", "confidence"] } }
            },
            "required": ["fields"]
        });
        let s = to_json_schema(&gemini);
        assert_eq!(s["type"], "object");
        assert_eq!(s["additionalProperties"], false);
        let item = &s["properties"]["fields"]["items"];
        assert_eq!(s["properties"]["fields"]["type"], "array");
        assert_eq!(item["type"], "object");
        assert_eq!(item["additionalProperties"], false);
        assert_eq!(item["properties"]["id"]["type"], "string");
        assert_eq!(item["properties"]["id"]["enum"], json!(["title", "bpm"]));
        assert_eq!(item["properties"]["confidence"]["type"], "number");
        assert!(item["properties"]["id"].get("additionalProperties").is_none());
    }

    #[test]
    fn builds_a_claude_request() {
        let schema = json!({ "type": "OBJECT", "properties": { "a": { "type": "STRING" } }, "required": ["a"] });
        let b = claude_body("claude-opus-5-5", "sys", "hi", &schema);
        assert_eq!(b["model"], "claude-opus-5-5");
        assert_eq!(b["system"], "sys");
        assert_eq!(b["messages"][0]["content"], "hi");
        assert!(b.get("temperature").is_none(), "Claude rejects sampling parameters");
        assert_eq!(b["output_config"]["effort"], "low");
        assert_eq!(b["output_config"]["format"]["type"], "json_schema");
        assert_eq!(b["output_config"]["format"]["schema"]["type"], "object");
        assert_eq!(b["fallbacks"], "default");
        // Haiku has no server-side fallbacks.
        assert!(claude_body("claude-haiku-5-5", "s", "p", &schema).get("fallbacks").is_none());
    }

    #[test]
    fn reads_claude_responses() {
        let ok = json!({ "stop_reason": "end_turn", "content": [
            { "type": "thinking", "thinking": "" },
            { "type": "text", "text": "{\"a\":" },
            { "type": "text", "text": "1}" }
        ] });
        assert_eq!(claude_text(&ok).unwrap(), "{\"a\":1}");
        assert!(claude_text(&json!({ "stop_reason": "refusal", "content": [] })).unwrap_err().contains("declined"));
        assert!(claude_text(&json!({ "stop_reason": "max_tokens", "content": [] })).unwrap_err().contains("cut off"));
    }

    #[test]
    fn explains_claude_errors() {
        assert!(explain_error(Provider::Claude, 401, &Value::Null, "m").contains("Anthropic API key was rejected"));
        assert!(explain_error(Provider::Claude, 402, &Value::Null, "m").contains("out of credit"));
        assert!(explain_error(Provider::Claude, 529, &Value::Null, "m").contains("overloaded"));
        assert!(explain_error(Provider::Claude, 404, &Value::Null, "claude-x").contains("claude-x"));
    }

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
        assert!(explain_error(Provider::Gemini, 400, &bad_key, "m").contains("rejected"));
        assert!(explain_error(Provider::Gemini, 429, &Value::Null, "m").contains("Free-tier limit"));
        assert!(explain_error(Provider::Gemini, 404, &Value::Null, "gemini-x").contains("gemini-x"));
        assert!(explain_error(Provider::Gemini, 503, &Value::Null, "m").contains("503"));
    }

    #[test]
    fn retries_only_transient_errors() {
        for s in [408, 429, 500, 502, 503, 504, 529] {
            assert!(retryable(s), "{s} should be retried");
        }
        for s in [400, 401, 402, 403, 404] {
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
        assert!(valid_model("claude-opus-5-5"));
        assert!(!valid_model("../../etc"));
        assert!(!valid_model("a b"));
        assert!(!valid_model(""));
    }

    /// A local HTTP server answering each request with the next canned
    /// response (non-2xx replies carry `retry-after: 0`); records each full
    /// request (request line, headers, body).
    fn mock_server(responses: Vec<(u16, Value)>) -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
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
                log.lock().unwrap().push(String::from_utf8_lossy(&buf).to_string());
                let body = body.to_string();
                let extra = if (200..300).contains(&status) { "" } else { "retry-after: 0\r\n" };
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    fn gemini_answer(text: &str) -> Value {
        json!({ "candidates": [{ "content": { "parts": [{ "text": text }] } }] })
    }

    #[test]
    fn retries_503_until_it_works() {
        let busy = json!({ "error": { "code": 503, "message": "The model is overloaded." } });
        let (base, seen) = mock_server(vec![(503, busy.clone()), (503, busy), (200, gemini_answer("{\"ok\":true}"))]);
        let client = reqwest::Client::new();
        let (model, result) = tauri::async_runtime::block_on(generate_gemini(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(result.is_ok(), "should succeed on the third try");
        assert_eq!(model, DEFAULT_MODEL);
        assert_eq!(seen.lock().unwrap().len(), 3);
    }

    #[test]
    fn does_not_retry_a_bad_key() {
        let bad = json!({ "error": { "code": 400, "message": "API key not valid." } });
        let (base, seen) = mock_server(vec![(400, bad)]);
        let client = reqwest::Client::new();
        let (_, result) = tauri::async_runtime::block_on(generate_gemini(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(matches!(result, Err(Failure::Http(400, _))));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[test]
    fn falls_back_when_the_model_stays_overloaded() {
        let busy = json!({ "error": { "code": 503 } });
        // 1 try + 4 retries on the default model, then the fallback answers.
        let mut responses = vec![(503, busy); 1 + MAX_RETRIES as usize];
        responses.push((200, gemini_answer("{\"ok\":true}")));
        let (base, seen) = mock_server(responses);
        let client = reqwest::Client::new();
        let (model, result) = tauri::async_runtime::block_on(generate_gemini(&client, &base, "k", DEFAULT_MODEL, &json!({})));
        assert!(result.is_ok());
        assert_eq!(model, FALLBACK_MODEL);
        let seen = seen.lock().unwrap();
        assert!(seen.last().unwrap().contains(FALLBACK_MODEL));
        assert_eq!(seen.len(), 2 + MAX_RETRIES as usize);
    }

    #[test]
    fn claude_sends_auth_headers_and_retries_overload() {
        let overloaded = json!({ "type": "error", "error": { "type": "overloaded_error", "message": "Overloaded" } });
        let ok = json!({ "model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{ "type": "text", "text": "{\"ok\":true}" }] });
        let (base, seen) = mock_server(vec![(529, overloaded), (200, ok)]);
        let client = reqwest::Client::new();
        let body = claude_body("claude-opus-5-5", "s", "p", &json!({ "type": "OBJECT", "properties": {} }));
        let (model, result) = tauri::async_runtime::block_on(generate_claude(&client, &base, "sk-test", "claude-opus-5-5", &body));
        let v = result.ok().expect("should succeed after the 529");
        assert_eq!(claude_text(&v).unwrap(), "{\"ok\":true}");
        assert_eq!(model, "claude-opus-5-5");
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        let req = seen[0].to_lowercase();
        assert!(req.contains("x-api-key: sk-test"), "{req}");
        assert!(req.contains("anthropic-version: 2023-06-01"));
        assert!(req.contains(&format!("anthropic-beta: {CLAUDE_FALLBACK_BETA}")));
        assert!(!req.contains("x-goog-api-key"));
    }

    #[test]
    fn claude_does_not_retry_billing_errors() {
        let billing = json!({ "type": "error", "error": { "type": "billing_error", "message": "credit balance too low" } });
        let (base, seen) = mock_server(vec![(402, billing)]);
        let client = reqwest::Client::new();
        let body = claude_body("claude-haiku-5-5", "s", "p", &json!({ "type": "OBJECT", "properties": {} }));
        let (_, result) = tauri::async_runtime::block_on(generate_claude(&client, &base, "k", "claude-haiku-5-5", &body));
        assert!(matches!(result, Err(Failure::Http(402, _))));
        assert_eq!(seen.lock().unwrap().len(), 1);
        // Haiku body: no fallbacks, so no beta header either.
        assert!(!seen.lock().unwrap()[0].to_lowercase().contains("anthropic-beta"));
    }
}
