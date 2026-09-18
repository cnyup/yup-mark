/**
 * 文件树构建与排序的纯逻辑（src/shared/fsutils.ts 的 Rust 对应物，可单测）。
 * 语义对齐 Electron 版 buildTree：目录优先 + 自然排序（数字段按数值），
 * 忽略常见干扰目录；mtime/birthtime/preview 静默降级。
 */
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_TREE_ENTRIES: usize = 20000;
/// 预览行只读 0 < size ≤ 256KB 的文件（对齐 Electron 262144 上限）
const PREVIEW_MAX_BYTES: u64 = 262144;
const PREVIEW_TEXT_CHARS: usize = 120;

/// 渲染进程 FileEntry 契约（src/shared/ipc.ts；可选字段缺省时不出键）
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub birthtime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

/// 常见干扰目录（依赖、构建产物、版本库）不入树；与 fsutils.ts 的 IGNORED_DIRS 保持一致
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    ".DS_Store",
    "dist",
    "out",
    "build",
    ".next",
    ".vercel",
    "coverage",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
];

pub fn is_ignored_entry(name: &str, dir: bool) -> bool {
    if !dir {
        return name == ".DS_Store";
    }
    IGNORED_DIRS.contains(&name)
}

/// 自然排序核心：数字段按数值比较（file2 < file10），其余按字符码位（调用方先转小写）
pub fn natural_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let av: Vec<char> = a.chars().collect();
    let bv: Vec<char> = b.chars().collect();
    let (mut ia, mut ib) = (0usize, 0usize);
    while ia < av.len() && ib < bv.len() {
        let (ca, cb) = (av[ia], bv[ib]);
        let (ad, bd) = (ca.is_ascii_digit(), cb.is_ascii_digit());
        if ad && bd {
            let mut ja = ia;
            while ja < av.len() && av[ja].is_ascii_digit() {
                ja += 1;
            }
            let mut jb = ib;
            while jb < bv.len() && bv[jb].is_ascii_digit() {
                jb += 1;
            }
            // 前导零不影响数值；超长数字段以 u128 兜底，避免 parse 溢出 panic
            let na: u128 = a[char_index(a, ia)..char_index(a, ja)]
                .parse()
                .unwrap_or(u128::MAX);
            let nb: u128 = b[char_index(b, ib)..char_index(b, jb)]
                .parse()
                .unwrap_or(u128::MAX);
            if na != nb {
                return na.cmp(&nb);
            }
            ia = ja;
            ib = jb;
        } else {
            if ca != cb {
                return ca.cmp(&cb);
            }
            ia += 1;
            ib += 1;
        }
    }
    (av.len() - ia).cmp(&(bv.len() - ib))
}

/// char 索引 → 字节索引（自然排序仅在 parse 时需要，且数字段必为 ASCII）
fn char_index(s: &str, char_i: usize) -> usize {
    s.char_indices()
        .nth(char_i)
        .map(|(b, _)| b)
        .unwrap_or(s.len())
}

/// 目录优先，同级按小写自然排序（对齐 compareEntries）
pub fn compare_entries(a: &(String, bool), b: &(String, bool)) -> std::cmp::Ordering {
    if a.1 != b.1 {
        return if a.1 {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        };
    }
    natural_compare(&a.0.to_lowercase(), &b.0.to_lowercase())
}

fn system_time_ms(t: SystemTime) -> f64 {
    match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs_f64() * 1000.0,
        Err(e) => -(e.duration().as_secs_f64() * 1000.0),
    }
}

/// 预览行：空白折叠为单空格、截 120 字符（对齐 Electron buildTree 的 preview 规则）
fn preview_of(raw: &str) -> Option<String> {
    let brief: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if brief.is_empty() {
        None
    } else {
        Some(brief.chars().take(PREVIEW_TEXT_CHARS).collect())
    }
}

pub fn build_tree(dir: &Path, budget: &mut usize) -> std::io::Result<Vec<FileEntry>> {
    let mut raw: Vec<(String, PathBuf, bool)> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_ignored_entry(&name, is_dir) {
            continue;
        }
        raw.push((name, entry.path(), is_dir));
    }
    raw.sort_by(|a, b| compare_entries(&(a.0.clone(), a.2), &(b.0.clone(), b.2)));

    let mut out: Vec<FileEntry> = Vec::new();
    for (name, path, is_dir) in raw {
        *budget += 1;
        if *budget > MAX_TREE_ENTRIES {
            return Ok(out);
        }
        let mut node = FileEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            dir: is_dir,
            mtime: None,
            birthtime: None,
            preview: None,
            children: None,
        };
        if is_dir {
            // 子目录读不了（权限/竞态）→ 空子树，不中断整棵树（对齐 Electron）
            node.children = Some(build_tree(&path, budget).unwrap_or_default());
        } else if let Ok(meta) = fs::metadata(&path) {
            node.mtime = meta.modified().ok().map(system_time_ms);
            node.birthtime = meta.created().ok().map(system_time_ms);
            let size = meta.len();
            if size > 0 && size <= PREVIEW_MAX_BYTES {
                // 非 UTF-8 文件读失败 → 无预览（对齐 Electron 的 utf8 读取 + catch）
                if let Ok(raw) = fs::read_to_string(&path) {
                    node.preview = preview_of(&raw);
                }
            }
        }
        out.push(node);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_sort_numeric_segments() {
        assert_eq!(natural_compare("file2", "file10"), std::cmp::Ordering::Less);
        assert_eq!(
            natural_compare("file10", "file2"),
            std::cmp::Ordering::Greater
        );
        assert_eq!(natural_compare("a1b2", "a1b2"), std::cmp::Ordering::Equal);
        assert_eq!(
            natural_compare("img12.png", "img9.png"),
            std::cmp::Ordering::Greater
        );
        assert_eq!(natural_compare("中文2", "中文10"), std::cmp::Ordering::Less);
    }

    #[test]
    fn compare_entries_dirs_first_case_insensitive() {
        assert_eq!(
            compare_entries(&("b.md".into(), false), &("a".into(), true)),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_entries(&("B.md".into(), false), &("a.md".into(), false)),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_entries(&("A".into(), true), &("b".into(), true)),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn ignored_entries() {
        assert!(is_ignored_entry("node_modules", true));
        assert!(is_ignored_entry(".git", true));
        assert!(is_ignored_entry(".DS_Store", false));
        assert!(is_ignored_entry(".DS_Store", true)); // 忽略集合含 .DS_Store，目录维度同样命中（对齐 fsutils.ts）
        assert!(!is_ignored_entry("notes", true));
        assert!(!is_ignored_entry("a.md", false));
    }

    #[test]
    fn build_tree_orders_and_previews() {
        let mut root = std::env::temp_dir();
        root.push(format!("yupmark-tree-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("zed")).unwrap();
        fs::create_dir_all(root.join("alpha")).unwrap();
        fs::write(root.join("alpha/file10.md"), "x").unwrap();
        fs::write(root.join("alpha/file2.md"), "x").unwrap();
        fs::write(root.join("z-note  with   spaces.md"), "a b\nc").unwrap();
        fs::write(root.join(".DS_Store"), "junk").unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();

        let mut budget = 0usize;
        let tree = build_tree(&root, &mut budget).unwrap();
        // 目录优先：alpha、zed 在前；node_modules/.DS_Store 被忽略
        let names: Vec<&str> = tree.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "zed", "z-note  with   spaces.md"]);
        // 自然排序：file2 < file10
        let alpha = &tree[0].children.as_ref().unwrap();
        assert_eq!(alpha[0].name, "file2.md");
        assert_eq!(alpha[1].name, "file10.md");
        // 预览行空白折叠
        assert_eq!(tree[2].preview.as_deref(), Some("a b c"));
        let _ = fs::remove_dir_all(&root);
    }
}
