/**
 * 原生菜单（src/main/menu.ts 的 Rust 对应物）。
 * - 自定义项文案双语（LABELS）；role 系（编辑/窗口/预定义项）由系统提供
 * - 点击经 menu:action 事件推送渲染进程（App.tsx 的 switch 分发不动）
 * - 缩放/全屏/About 在宿主侧直接处理（Electron role 的等价物），不走渲染进程
 * - mac 的 appMenu 用 #[cfg(target_os)] 分支（Go 风格平台文件在此只有一小段，不值得拆模块）
 */
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::state::AppState;

/// webview 缩放百分比（Electron zoom role 语义：±10%，重置回 100%）
static ZOOM_PERCENT: AtomicU32 = AtomicU32::new(100);

type ItemRef<'a> = &'a dyn IsMenuItem<Wry>;

struct Labels {
    file: &'static str,
    new: &'static str,
    open: &'static str,
    open_folder: &'static str,
    open_recent: &'static str,
    no_recent: &'static str,
    save: &'static str,
    save_as: &'static str,
    edit: &'static str,
    view: &'static str,
    toggle_sidebar: &'static str,
    next_doc: &'static str,
    prev_doc: &'static str,
    source_mode: &'static str,
    focus_mode: &'static str,
    typewriter_mode: &'static str,
    zoom_in: &'static str,
    zoom_out: &'static str,
    reset_zoom: &'static str,
    fullscreen: &'static str,
    reload: &'static str,
    devtools: &'static str,
    window: &'static str,
    preferences: &'static str,
    help: &'static str,
    about: &'static str,
}

const EN: Labels = Labels {
    file: "File",
    new: "New",
    open: "Open…",
    open_folder: "Open Folder…",
    open_recent: "Open Recent",
    no_recent: "No Recent Files",
    save: "Save",
    save_as: "Save As…",
    edit: "Edit",
    view: "View",
    toggle_sidebar: "Toggle Sidebar",
    next_doc: "Next Document",
    prev_doc: "Previous Document",
    source_mode: "Source Code Mode",
    focus_mode: "Focus Mode",
    typewriter_mode: "Typewriter Mode",
    zoom_in: "Zoom In",
    zoom_out: "Zoom Out",
    reset_zoom: "Actual Size",
    fullscreen: "Toggle Full Screen",
    reload: "Reload",
    devtools: "Toggle Developer Tools",
    window: "Window",
    preferences: "Preferences…",
    help: "Help",
    about: "About YupMark",
};

const ZH: Labels = Labels {
    file: "文件",
    new: "新建",
    open: "打开…",
    open_folder: "打开文件夹…",
    open_recent: "最近打开",
    no_recent: "暂无最近文件",
    save: "保存",
    save_as: "另存为…",
    edit: "编辑",
    view: "视图",
    toggle_sidebar: "切换侧栏",
    next_doc: "下一个文档",
    prev_doc: "上一个文档",
    source_mode: "源码模式",
    focus_mode: "专注模式",
    typewriter_mode: "打字机模式",
    zoom_in: "放大",
    zoom_out: "缩小",
    reset_zoom: "实际大小",
    fullscreen: "切换全屏",
    reload: "重新加载",
    devtools: "切换开发者工具",
    window: "窗口",
    preferences: "偏好设置…",
    help: "帮助",
    about: "关于 YupMark",
};

fn labels(lang: &str) -> &'static Labels {
    if lang == "zh" {
        &ZH
    } else {
        &EN
    }
}

/// 菜单事件 → menu:action 推送（App.tsx 消费的 MenuAction 契约）
fn broadcast(app: &AppHandle, action: &str) {
    let _ = app.emit("menu:action", json!({ "action": action }));
}

fn show_about(app: &AppHandle) {
    use tauri_plugin_dialog::DialogExt;
    let version = app.package_info().version.to_string();
    app.dialog()
        .message(format!(
            "Version {version}\nAn open-source, Typora-like WYSIWYG Markdown editor.\nMIT License"
        ))
        .title("YupMark")
        .blocking_show();
}

fn apply_zoom(app: &AppHandle) {
    let percent = ZOOM_PERCENT.load(Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_zoom(percent as f64 / 100.0);
    }
}

fn zoom_by(app: &AppHandle, delta: i32) {
    let cur = ZOOM_PERCENT.load(Ordering::Relaxed) as i32;
    let next = (cur + delta).clamp(25, 500);
    ZOOM_PERCENT.store(next as u32, Ordering::Relaxed);
    apply_zoom(app);
}

fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

/// 组装并挂载菜单（语言/最近文件变化时整体重建——对齐 Electron setApplicationMenu）
pub fn rebuild(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<AppState>();
    let lang = st.menu_lang.lock().unwrap().clone();
    let l = labels(&lang);

    let recent: Vec<String> = st.persisted.lock().unwrap().recent.clone();
    let recent_items: Vec<MenuItem<Wry>> = if recent.is_empty() {
        vec![mitem(app, "recent:none", l.no_recent, None, false)?]
    } else {
        recent
            .iter()
            .map(|p| {
                let path = std::path::Path::new(p);
                let base = path
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| p.clone());
                let dir = path
                    .parent()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                mitem(
                    app,
                    &format!("recent:{p}"),
                    &format!("{base} — {dir}"),
                    None,
                    true,
                )
            })
            .collect::<Result<_, String>>()?
    };
    let recent_refs: Vec<ItemRef> = recent_items.iter().map(|i| i as ItemRef).collect();

    let is_mac = cfg!(target_os = "macos");
    let (next_accel, prev_accel): (&str, &str) = if is_mac {
        ("Command+Backquote", "Command+Shift+Backquote")
    } else {
        ("Control+Tab", "Control+Shift+Tab")
    };

    let new = mitem(app, "file:new", l.new, Some("CmdOrCtrl+N"), true)?;
    let open = mitem(app, "file:open", l.open, Some("CmdOrCtrl+O"), true)?;
    let open_folder = mitem(
        app,
        "workspace:open",
        l.open_folder,
        Some("CmdOrCtrl+Shift+O"),
        true,
    )?;
    let open_recent_sub =
        Submenu::with_items(app, l.open_recent, true, &recent_refs).map_err(|e| e.to_string())?;
    let save = mitem(app, "file:save", l.save, Some("CmdOrCtrl+S"), true)?;
    let save_as = mitem(
        app,
        "file:save-as",
        l.save_as,
        Some("CmdOrCtrl+Shift+S"),
        true,
    )?;
    let preferences = mitem(
        app,
        "app:settings",
        l.preferences,
        Some("CmdOrCtrl+Comma"),
        true,
    )?;
    let close_or_quit: PredefinedMenuItem<Wry> = if is_mac {
        PredefinedMenuItem::close_window(app, None).map_err(|e| e.to_string())?
    } else {
        PredefinedMenuItem::quit(app, None).map_err(|e| e.to_string())?
    };
    let file_menu = Submenu::with_items(
        app,
        l.file,
        true,
        &[
            &new,
            &open,
            &open_folder,
            &open_recent_sub,
            &sep(app)?,
            &save,
            &save_as,
            &sep(app)?,
            &preferences,
            &sep(app)?,
            &close_or_quit,
        ],
    )
    .map_err(|e| e.to_string())?;

    // role:editMenu（预定义项，系统本地化标签 + 各自默认加速键）
    let undo = PredefinedMenuItem::undo(app, None).map_err(|e| e.to_string())?;
    let redo = PredefinedMenuItem::redo(app, None).map_err(|e| e.to_string())?;
    let cut = PredefinedMenuItem::cut(app, None).map_err(|e| e.to_string())?;
    let copy = PredefinedMenuItem::copy(app, None).map_err(|e| e.to_string())?;
    let paste = PredefinedMenuItem::paste(app, None).map_err(|e| e.to_string())?;
    let select_all = PredefinedMenuItem::select_all(app, None).map_err(|e| e.to_string())?;
    let edit_menu = Submenu::with_items(
        app,
        l.edit,
        true,
        &[&undo, &redo, &sep(app)?, &cut, &copy, &paste, &select_all],
    )
    .map_err(|e| e.to_string())?;

    let toggle_sidebar = mitem(
        app,
        "view:toggle-sidebar",
        l.toggle_sidebar,
        Some("CmdOrCtrl+Shift+L"),
        true,
    )?;
    let next_doc = mitem(app, "view:next-doc", l.next_doc, Some(next_accel), true)?;
    let prev_doc = mitem(app, "view:prev-doc", l.prev_doc, Some(prev_accel), true)?;
    let source_mode = mitem(
        app,
        "view:source-mode",
        l.source_mode,
        Some("CmdOrCtrl+Slash"),
        true,
    )?;
    let focus_mode = mitem(app, "view:focus-mode", l.focus_mode, Some("F8"), true)?;
    let typewriter_mode = mitem(
        app,
        "view:typewriter-mode",
        l.typewriter_mode,
        Some("F9"),
        true,
    )?;
    // Typora：缩放让出 ⌘=/⌘-/⌘0（那是标题升降级与正文），用 Ctrl+Shift±=（Electron role 同款）
    let zoom_in = mitem(
        app,
        "view:zoom-in",
        l.zoom_in,
        Some("CmdOrCtrl+Shift+Equal"),
        true,
    )?;
    let zoom_out = mitem(
        app,
        "view:zoom-out",
        l.zoom_out,
        Some("CmdOrCtrl+Shift+Minus"),
        true,
    )?;
    let reset_zoom = mitem(
        app,
        "view:zoom-reset",
        l.reset_zoom,
        Some("CmdOrCtrl+Shift+Digit0"),
        true,
    )?;
    let fullscreen = mitem(app, "view:toggle-fullscreen", l.fullscreen, None, true)?;
    let reload = mitem(app, "view:reload", l.reload, None, true)?;
    let devtools = mitem(app, "view:devtools", l.devtools, None, true)?;
    // vec 绑定会超出语句存活期，分隔符必须先落具名变量
    let vsep1 = sep(app)?;
    let vsep2 = sep(app)?;
    let vsep3 = sep(app)?;
    let view_items: Vec<ItemRef> = if cfg!(debug_assertions) {
        vec![
            &toggle_sidebar,
            &next_doc,
            &prev_doc,
            &vsep1,
            &source_mode,
            &focus_mode,
            &typewriter_mode,
            &vsep2,
            &zoom_in,
            &zoom_out,
            &reset_zoom,
            &fullscreen,
            &vsep3,
            &reload,
            &devtools,
        ]
    } else {
        vec![
            &toggle_sidebar,
            &next_doc,
            &prev_doc,
            &vsep1,
            &source_mode,
            &focus_mode,
            &typewriter_mode,
            &vsep2,
            &zoom_in,
            &zoom_out,
            &reset_zoom,
            &fullscreen,
            &vsep3,
            &reload,
        ]
    };
    let view_menu =
        Submenu::with_items(app, l.view, true, &view_items).map_err(|e| e.to_string())?;

    // role:windowMenu
    let minimize = PredefinedMenuItem::minimize(app, None).map_err(|e| e.to_string())?;
    let maximize = PredefinedMenuItem::maximize(app, None).map_err(|e| e.to_string())?;
    let close_w = PredefinedMenuItem::close_window(app, None).map_err(|e| e.to_string())?;
    let window_menu = Submenu::with_items(
        app,
        l.window,
        true,
        &[&minimize, &maximize, &sep(app)?, &close_w],
    )
    .map_err(|e| e.to_string())?;

    let about = mitem(app, "help:about", l.about, None, true)?;
    let help_menu = Submenu::with_items(app, l.help, true, &[&about]).map_err(|e| e.to_string())?;

    let menus: Vec<Submenu<Wry>> = vec![file_menu, edit_menu, view_menu, window_menu, help_menu];
    #[cfg(target_os = "macos")]
    {
        // role:appMenu（mac 专属：关于/服务/隐藏/退出）
        let app_about = PredefinedMenuItem::about(app, Some(tauri::menu::AboutMetadata::default()))
            .map_err(|e| e.to_string())?;
        let services = PredefinedMenuItem::services(app, None).map_err(|e| e.to_string())?;
        let hide = PredefinedMenuItem::hide(app, None).map_err(|e| e.to_string())?;
        let hide_others = PredefinedMenuItem::hide_others(app, None).map_err(|e| e.to_string())?;
        let show_all = PredefinedMenuItem::show_all(app, None).map_err(|e| e.to_string())?;
        let quit = PredefinedMenuItem::quit(app, None).map_err(|e| e.to_string())?;
        let app_menu = Submenu::with_items(
            app,
            "YupMark",
            true,
            &[
                &app_about,
                &sep(app)?,
                &services,
                &sep(app)?,
                &hide,
                &hide_others,
                &show_all,
                &sep(app)?,
                &quit,
            ],
        )
        .map_err(|e| e.to_string())?;
        menus.insert(0, app_menu);
    }
    let menu_refs: Vec<ItemRef> = menus.iter().map(|m| m as ItemRef).collect();

    let menu = Menu::with_items(app, &menu_refs).map_err(|e| e.to_string())?;
    let window = main_window(app).ok_or("main window missing")?;
    // set_menu 按值接收并返回旧菜单（此处丢弃）
    window.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

fn mitem(
    app: &AppHandle,
    id: &str,
    label: &str,
    accel: Option<&str>,
    enabled: bool,
) -> Result<MenuItem<Wry>, String> {
    MenuItem::with_id(app, id, label, enabled, accel).map_err(|e| e.to_string())
}

fn sep(app: &AppHandle) -> Result<PredefinedMenuItem<Wry>, String> {
    PredefinedMenuItem::separator(app).map_err(|e| e.to_string())
}

/// 菜单语言切换（渲染进程 setLanguage 命令落地处）
pub fn set_language(app: &AppHandle, lang: &str) -> Result<(), String> {
    {
        let st = app.state::<AppState>();
        let mut cur = st.menu_lang.lock().unwrap();
        if *cur == lang {
            return Ok(());
        }
        *cur = lang.to_string();
    }
    rebuild(app)
}

/// setup 阶段注册一次性事件路由（菜单点击 → menu:action / 宿主侧动作）
pub fn install_event_handler(app: &AppHandle) {
    app.on_menu_event(move |app, event| {
        let id = event.id().0.clone();
        if let Some(path) = id.strip_prefix("recent:") {
            let _ = app.emit(
                "menu:action",
                json!({ "action": { "action": "file:open-path", "path": path } }),
            );
            return;
        }
        match id.as_str() {
            "file:new"
            | "file:open"
            | "file:save"
            | "file:save-as"
            | "workspace:open"
            | "app:settings"
            | "view:toggle-sidebar"
            | "view:next-doc"
            | "view:prev-doc"
            | "view:source-mode"
            | "view:focus-mode"
            | "view:typewriter-mode" => broadcast(app, &id),
            "help:about" => show_about(app),
            "view:zoom-in" => zoom_by(app, 10),
            "view:zoom-out" => zoom_by(app, -10),
            "view:zoom-reset" => {
                ZOOM_PERCENT.store(100, Ordering::Relaxed);
                apply_zoom(app);
            }
            "view:toggle-fullscreen" => {
                if let Some(w) = main_window(app) {
                    let fs = w.is_fullscreen().unwrap_or(false);
                    let _ = w.set_fullscreen(!fs);
                }
            }
            "view:reload" => {
                if let Some(w) = main_window(app) {
                    let _ = w.eval("location.reload()");
                }
            }
            // devtools 仅 debug 编译存在（release 无此方法）
            #[cfg(debug_assertions)]
            "view:devtools" => {
                if let Some(w) = main_window(app) {
                    w.open_devtools();
                }
            }
            _ => {}
        }
    });
}
