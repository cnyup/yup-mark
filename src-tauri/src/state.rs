/**
 * 宿主持久化状态（appData/state.json）：最近文件、最近工作区目录、会话。
 * 与 Electron 版 state.json 同构（recent/recentDirs/session 三键，camelCase）。
 * session 走 serde_json::Value 透传——与 Electron 主进程一样不做形状校验，
 * 契约由 src/shared/ipc.ts 的 SessionState 单方面定义。
 */
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::watcher::WatchRecord;

pub const RECENT_FILES_MAX: usize = 12;
pub const RECENT_DIRS_MAX: usize = 8;

#[derive(Default)]
pub struct Persisted {
    pub recent: Vec<String>,
    pub recent_dirs: Vec<String>,
    pub session: Option<Value>,
}

/// state.json 的磁盘形状（字段缺失时取默认，坏文件整体回退空态——对齐 Electron loadPersisted）
#[derive(Serialize, Deserialize, Default)]
struct PersistedFile {
    #[serde(default)]
    recent: Vec<String>,
    #[serde(default, rename = "recentDirs")]
    recent_dirs: Vec<String>,
    #[serde(default)]
    session: Option<Value>,
}

pub struct AppState {
    state_path: PathBuf,
    pub persisted: Mutex<Persisted>,
    /// 目录监听（引用计数）：key = "r:<dir>"（递归）或 "s:<dir>"
    pub watchers: Mutex<std::collections::HashMap<String, WatchRecord>>,
    /// 原生菜单语言（"zh" | "en"；默认 en——对齐 Electron menuLang 初值）
    pub menu_lang: Mutex<String>,
}

impl AppState {
    pub fn load(state_path: PathBuf) -> Self {
        let persisted = fs::read_to_string(&state_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistedFile>(&raw).ok())
            .map(|f| Persisted {
                recent: f.recent,
                recent_dirs: f.recent_dirs,
                session: f.session,
            })
            .unwrap_or_default();
        Self {
            state_path,
            persisted: Mutex::new(persisted),
            watchers: Mutex::new(std::collections::HashMap::new()),
            menu_lang: Mutex::new("en".to_string()),
        }
    }

    fn flush(&self) {
        let p = self.persisted.lock().unwrap();
        let file = PersistedFile {
            recent: p.recent.clone(),
            recent_dirs: p.recent_dirs.clone(),
            session: p.session.clone(),
        };
        // 持久化失败不打断主流程（对齐 Electron flushPersisted）
        let _ = fs::write(
            &self.state_path,
            serde_json::to_vec(&file).unwrap_or_default(),
        );
    }

    fn push_unique_front(&self, list_recent: bool, path: &str, max: usize) {
        let mut p = self.persisted.lock().unwrap();
        let list = if list_recent {
            &mut p.recent
        } else {
            &mut p.recent_dirs
        };
        list.retain(|x| x != path);
        list.insert(0, path.to_string());
        list.truncate(max);
        drop(p);
        self.flush();
    }

    /// 最近文件：去重、最新在前、最多 12 个
    pub fn push_recent(&self, path: &str) {
        self.push_unique_front(true, path, RECENT_FILES_MAX);
    }

    /// 最近工作区目录：去重、最新在前、最多 8 个
    pub fn push_recent_dir(&self, dir: &str) {
        self.push_unique_front(false, dir, RECENT_DIRS_MAX);
    }

    pub fn set_session(&self, session: Value) {
        {
            let mut p = self.persisted.lock().unwrap();
            p.session = Some(session);
        }
        self.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_state_path(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("yupmark-state-test-{}-{}", tag, std::process::id()));
        let _ = fs::remove_file(&p);
        p
    }

    #[test]
    fn push_recent_dedup_and_cap() {
        let path = temp_state_path("recent");
        let st = AppState::load(path.clone());
        for i in 0..15 {
            st.push_recent(&format!("/tmp/f{i}.md"));
        }
        st.push_recent("/tmp/f3.md");
        let p = st.persisted.lock().unwrap();
        assert_eq!(p.recent.len(), RECENT_FILES_MAX);
        assert_eq!(p.recent[0], "/tmp/f3.md");
        // f0–f2 是被容量挤出的最旧三条（f14 仍在保留窗口内）
        assert!(!p.recent.contains(&"/tmp/f0.md".to_string()));
        drop(p);
        // flush 后磁盘可读回（recentDirs 键名 camelCase）
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"recentDirs\""));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn push_recent_dir_cap() {
        let path = temp_state_path("dirs");
        let st = AppState::load(path.clone());
        for i in 0..10 {
            st.push_recent_dir(&format!("/ws/{i}"));
        }
        let p = st.persisted.lock().unwrap();
        assert_eq!(p.recent_dirs.len(), RECENT_DIRS_MAX);
        assert_eq!(p.recent_dirs[0], "/ws/9");
        drop(p);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_bad_file_falls_back_to_default() {
        let path = temp_state_path("bad");
        fs::write(&path, "{not json").unwrap();
        let st = AppState::load(path.clone());
        assert!(st.persisted.lock().unwrap().recent.is_empty());
        let _ = fs::remove_file(&path);
    }
}
