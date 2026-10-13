mod actions;
mod ai;
mod audio;
mod daws;
mod cover;
mod files;
mod key;
mod flp_metadata;
mod models;
mod package;
mod paths;
mod render;
mod resolve;
mod scanner;
mod scope;
mod sections;
mod settings;
mod shorts;
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
            settings::detect_projects_folder,
            settings::pick_watched_folder,
            settings::link_detected_projects_folder,
            settings::remove_watched_folder,
            settings::pick_output_folder,
            settings::pick_fl_studio,
            settings::use_detected_fl_studio,
            settings::pick_ffmpeg,
            settings::clear_path_setting,
            render::render_projects,
            workspace::get_workspace,
            workspace::save_workspace,
            actions::list_templates,
            actions::default_template,
            actions::create_project,
            actions::duplicate_project,
            actions::restore_backup,
            actions::trash_backups,
            actions::backups_on_risky_volumes,
            package::package_preview,
            package::package_projects,
            files::kit_files,
            audio::analyze_audio,
            audio::export_launch_kit,
            ai::ai_status,
            ai::set_ai_key,
            ai::ai_kit,
            shorts::shorts_status,
            shorts::render_shorts,
            cover::cover_status,
            cover::set_cover_credentials,
            cover::generate_cover,
            cover::save_cover,
            paths::open_project,
            paths::reveal_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
