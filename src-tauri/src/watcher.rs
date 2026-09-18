/**
 * 目录监听（引用计数）：notify 后端，语义对齐 Electron fs.watch——
 * 工作区递归、单文件目录非递归；事件以「被监听目录 + 相对文件名」推送，
 * 渲染端以 dir + '/' + file 拼全路径匹配打开的标签（workspaceStore.handleFsEvent）。
 */
use notify::{RecommendedWatcher, RecursiveMode, Watcher as _};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// 渲染进程 FsEventData 契约（src/shared/ipc.ts）
#[derive(Clone, Serialize)]
pub struct FsEventData {
    pub dir: String,
    pub file: String,
}

pub struct WatchRecord {
    watcher: RecommendedWatcher,
    pub refs: u32,
}

fn watch_key(dir: &str, recursive: bool) -> String {
    format!("{}:{dir}", if recursive { "r" } else { "s" })
}

pub fn watch_dir(app: &AppHandle, dir: &str, recursive: bool) {
    let st = app.state::<crate::state::AppState>();
    let mut watchers = st.watchers.lock().unwrap();
    let key = watch_key(dir, recursive);
    if let Some(rec) = watchers.get_mut(&key) {
        rec.refs += 1;
        return;
    }
    let emit_app = app.clone();
    let emit_dir = dir.to_string();
    let dir_path = PathBuf::from(dir);
    let prefix_for_closure = dir_path.clone();
    let Ok(mut watcher) = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        // 对齐 Electron「无文件名不推送」；notify 给绝对路径，换算成相对被监听目录
        let Some(absolute) = ev.paths.last() else {
            return;
        };
        let rel = absolute
            .strip_prefix(&prefix_for_closure)
            .unwrap_or(absolute);
        let file = rel.to_string_lossy().into_owned();
        if file.is_empty() {
            return;
        }
        let _ = emit_app.emit(
            "fs:event",
            FsEventData {
                dir: emit_dir.clone(),
                file,
            },
        );
    }) else {
        return;
    };
    let mode = if recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    // 目录可能刚被删除；watch 失败静默忽略（对齐 Electron try/catch）
    if watcher.watch(&dir_path, mode).is_err() {
        return;
    }
    watchers.insert(key, WatchRecord { watcher, refs: 1 });
}

pub fn unwatch_dir(app: &AppHandle, dir: &str, recursive: bool) {
    let st = app.state::<crate::state::AppState>();
    let mut watchers = st.watchers.lock().unwrap();
    let key = watch_key(dir, recursive);
    let remove = {
        let Some(rec) = watchers.get_mut(&key) else {
            return;
        };
        rec.refs = rec.refs.saturating_sub(1);
        rec.refs == 0
    };
    if remove {
        // 移出 map 即丢弃记录；显式 drop watcher，停监听的动作可见
        if let Some(rec) = watchers.remove(&key) {
            drop(rec.watcher);
        }
    }
}
