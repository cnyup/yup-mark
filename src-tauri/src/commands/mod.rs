/**
 * Tauri 命令面：与 src/shared/ipc.ts 的 IPC.invoke.* 一一对应。
 * - Rust fn 名用 snake_case（通道名含冒号不能做 fn 名），映射表在
 *   src/renderer/lib/tauriApi.ts 的 RUST_CMD，两处需同步增删
 * - 返回 Result<T, String>：Err 字符串经 invoke reject → 前端包回 Result 协议；
 *   对话框取消统一 Err("canceled")
 * - 参数键为 camelCase（Tauri 自动换算 snake_case 形参）
 * - 全部声明为 async：文件 IO 不阻塞主线程（同步命令在 Tauri 2 默认跑主线程）
 */
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::fsops::{self, FileEntry};
use crate::state::AppState;
use crate::watcher;

/// 渲染进程 OpenFileData 契约
#[derive(Serialize)]
pub struct OpenFileData {
    pub path: String,
    pub content: String,
}

/// 渲染进程 createFile/createFolder/rename 的返回
#[derive(Serialize)]
pub struct PathData {
    pub path: String,
}

fn markdown_filters() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("Markdown", vec!["md", "markdown", "mkd", "mdown"]),
        ("All Files", vec!["*"]),
    ]
}

fn state(app: &AppHandle) -> &AppState {
    app.state::<AppState>().inner()
}

fn open_dialog_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let mut builder = app.dialog().file();
    for (name, exts) in markdown_filters() {
        builder = builder.add_filter(name, &exts);
    }
    builder.blocking_pick_file()?.into_path().ok()
}

#[tauri::command]
pub async fn open_dialog(app: AppHandle) -> Result<OpenFileData, String> {
    let Some(path) = open_dialog_file(&app) else {
        return Err("canceled".into());
    };
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let path = path.to_string_lossy().into_owned();
    state(&app).push_recent(&path);
    // 最近文件入菜单（Open Recent 子菜单）
    let _ = crate::menu::rebuild(&app);
    Ok(OpenFileData { path, content })
}

#[tauri::command]
pub async fn save_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    state(&app).push_recent(&path);
    let _ = crate::menu::rebuild(&app);
    Ok(())
}

#[tauri::command]
pub async fn save_as_dialog(app: AppHandle, content: String) -> Result<OpenFileData, String> {
    let mut builder = app.dialog().file().set_file_name("untitled.md");
    for (name, exts) in markdown_filters() {
        builder = builder.add_filter(name, &exts);
    }
    let Some(path) = builder
        .blocking_save_file()
        .and_then(|f| f.into_path().ok())
    else {
        return Err("canceled".into());
    };
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    let path = path.to_string_lossy().into_owned();
    state(&app).push_recent(&path);
    let _ = crate::menu::rebuild(&app);
    Ok(OpenFileData { path, content })
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_workspace_dialog(app: AppHandle) -> Result<Option<String>, String> {
    // 取消返回 Ok(None)——渲染端约定 ok:true + null（区别于文件对话框的 'canceled'）
    let Some(dir) = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok())
    else {
        return Ok(None);
    };
    let dir = dir.to_string_lossy().into_owned();
    state(&app).push_recent_dir(&dir);
    Ok(Some(dir))
}

#[tauri::command]
pub async fn read_tree(root: String) -> Result<Vec<FileEntry>, String> {
    let mut budget = 0usize;
    fsops::build_tree(std::path::Path::new(&root), &mut budget).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_workspace() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn create_file(parent_dir: String, name: String) -> Result<PathData, String> {
    let file_name = if name.ends_with(".md") {
        name
    } else {
        format!("{name}.md")
    };
    let path = std::path::Path::new(&parent_dir).join(file_name);
    // create_new 等价 node writeFile 的 'wx'：已存在即失败，绝不截断旧文件
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    Ok(PathData {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn create_folder(parent_dir: String, name: String) -> Result<PathData, String> {
    let path = std::path::Path::new(&parent_dir).join(name);
    std::fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(PathData {
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn rename_entry(path: String, new_name: String) -> Result<PathData, String> {
    let new_path = std::path::Path::new(&path)
        .parent()
        .map(|p| p.join(&new_name))
        .ok_or("rename: no parent dir")?;
    std::fs::rename(&path, &new_path).map_err(|e| e.to_string())?;
    Ok(PathData {
        path: new_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn trash_entry(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_in_file_manager(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn watch_dir(app: AppHandle, dir: String, workspace: bool) -> Result<(), String> {
    watcher::watch_dir(&app, &dir, workspace);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_dir(app: AppHandle, dir: String, workspace: bool) -> Result<(), String> {
    watcher::unwatch_dir(&app, &dir, workspace);
    Ok(())
}

#[tauri::command]
pub fn recent_list(app: AppHandle) -> Vec<String> {
    state(&app).persisted.lock().unwrap().recent.clone()
}

#[tauri::command]
pub fn recent_dirs(app: AppHandle) -> Vec<String> {
    state(&app).persisted.lock().unwrap().recent_dirs.clone()
}

#[tauri::command]
pub async fn clipboard_read_text(app: AppHandle) -> Result<String, String> {
    app.clipboard().read_text().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// 菜单语言切换（menu:action 推送链路见 menu.rs）
#[tauri::command]
pub async fn set_language(app: AppHandle, lang: String) -> Result<(), String> {
    crate::menu::set_language(&app, &lang)
}

/// ⌘点击外链 → 系统浏览器（渲染层 window.open 补丁的落点；只放行 http/https）
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("open_external: scheme not allowed".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_load(app: AppHandle) -> Option<Value> {
    state(&app).persisted.lock().unwrap().session.clone()
}

/// 形参名 session（而非 state）：避免与 Tauri 的 State 注入混淆；前端适配层以 { session } 键传入
#[tauri::command]
pub async fn session_save(app: AppHandle, session: Value) -> Result<(), String> {
    state(&app).set_session(session);
    Ok(())
}
