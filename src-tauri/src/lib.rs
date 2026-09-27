mod flp_metadata;
mod models;
mod render;
mod scanner;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scanner::scan_projects,
            settings::get_settings,
            settings::save_settings,
            settings::detect_fl_studio,
            render::render_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
