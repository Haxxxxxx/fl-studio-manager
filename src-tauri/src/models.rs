use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
    pub root: String,
    pub genre: Option<String>,
    pub artist: Option<String>,
    pub tempo_bpm: Option<f64>,
    pub time_sig_num: Option<u8>,
    pub time_sig_denom: Option<u8>,
    pub fl_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub watched_folders: Vec<String>,
    pub fl_studio_path: Option<String>,
    pub output_folder: Option<String>,
    pub render_format: String,
    #[serde(default)]
    pub favorites: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            watched_folders: Vec::new(),
            fl_studio_path: None,
            output_folder: None,
            render_format: "wav".to_string(),
            favorites: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RenderStatus {
    Queued,
    Rendering,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderEvent {
    pub project_path: String,
    pub project_name: String,
    pub status: RenderStatus,
    pub message: Option<String>,
    pub output_path: Option<String>,
}
