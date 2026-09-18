/**
 * YupMark 桌面宿主（Tauri 2）。
 * 命令面见 commands/（对齐 src/shared/ipc.ts 的 IPC.invoke.*）；
 * 持久化状态在 setup 阶段装载（appData/state.json）。
 */
mod commands;
mod fsops;
mod menu;
mod state;
mod watcher;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let state_path = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app data dir unavailable: {e}"))?
                .join("state.json");
            app.manage(AppState::load(state_path));
            menu::install_event_handler(app.handle());
            menu::rebuild(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_dialog,
            commands::save_file,
            commands::save_as_dialog,
            commands::read_file,
            commands::open_workspace_dialog,
            commands::read_tree,
            commands::close_workspace,
            commands::create_file,
            commands::create_folder,
            commands::rename_entry,
            commands::trash_entry,
            commands::reveal_in_file_manager,
            commands::watch_dir,
            commands::unwatch_dir,
            commands::recent_list,
            commands::recent_dirs,
            commands::clipboard_read_text,
            commands::clipboard_write_text,
            commands::set_language,
            commands::open_external,
            commands::session_load,
            commands::session_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
