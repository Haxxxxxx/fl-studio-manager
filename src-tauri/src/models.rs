use serde::{Deserialize, Serialize};

/// A file on disk related to a project (a backup .flp, a rendered mixdown…).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
}

/// A song's exported stems: a `Stems` folder next to the project, or FL's
/// split-mixer export (`<project>_<track>.wav`, two or more) beside the .flp.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StemsInfo {
    /// The folder holding them (the stems folder, or the project folder).
    pub folder: String,
    pub count: u32,
    pub bytes: u64,
    pub newest_ms: i64,
}

/// One song: the main .flp plus everything FL Studio keeps around it.
/// Backups (FL's `Backup/<name> (overwritten at 16h12).flp` files) are
/// grouped under their project instead of being listed as projects.
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
    /// Lives under a `Templates` folder — FL's user-template location.
    pub is_template: bool,
    /// Newest first.
    pub backups: Vec<FileEntry>,
    /// Audio files next to the .flp whose name starts with the project name
    /// (e.g. `Envy.wav` beside `Envy.flp`). Newest first.
    pub renders: Vec<FileEntry>,
    /// Recorded takes in the sibling `Audio/` folder (FL names them
    /// `<project>_<date>_<track>.wav`).
    pub recordings_count: u32,
    pub recordings_bytes: u64,
    /// Title and comment from FL Studio's project info, if filled in.
    pub flp_title: Option<String>,
    pub comment: Option<String>,
    pub stems: Option<StemsInfo>,
    pub plugins: Vec<PluginInfo>,
    pub samples: Vec<SampleInfo>,
    /// Named mixer tracks and recorded-take labels ("Lead Voices - Nova"),
    /// minus generic ones. Collaborator names usually live here.
    pub track_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub vendor: Option<String>,
    /// Third-party plugins only: whether it's installed on this machine.
    /// `None` for FL's native plugins (always available).
    pub installed: Option<bool>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SampleStatus {
    /// At the path the project stores.
    Ok,
    /// Not there, but a file with the same name is inside the song's folder
    /// (the project was moved) — FL can usually find it.
    Relocated,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleInfo {
    /// Resolved path (%FLStudioUserData% etc. expanded).
    pub path: String,
    pub status: SampleStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub name: String,
    pub category: String,
    pub path: String,
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
    /// Gemini model id; None = the default (ai::DEFAULT_MODEL).
    #[serde(default)]
    pub ai_model: Option<String>,
    /// Language for AI-written captions and briefs ("English", "French"…).
    #[serde(default)]
    pub ai_language: Option<String>,
    /// ffmpeg for shorts; None = found automatically.
    #[serde(default)]
    pub ffmpeg_path: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            watched_folders: Vec::new(),
            fl_studio_path: None,
            output_folder: None,
            render_format: "wav".to_string(),
            favorites: Vec::new(),
            ai_model: None,
            ai_language: None,
            ffmpeg_path: None,
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
