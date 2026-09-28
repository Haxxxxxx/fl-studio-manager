mod actions;
mod flp_metadata;
mod models;
mod package;
mod render;
mod resolve;
mod scanner;
mod settings;
mod workspace;

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
            workspace::get_workspace,
            workspace::save_workspace,
            actions::list_templates,
            actions::default_template,
            actions::create_project,
            actions::duplicate_project,
            actions::restore_backup,
            actions::trash_backups,
            package::package_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
