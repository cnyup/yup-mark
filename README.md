# YupMark

[![CI](https://github.com/cnyup/yup-mark/actions/workflows/ci.yml/badge.svg)](https://github.com/cnyup/yup-mark/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cnyup/yup-mark?display_name=tag&sort=semver)](https://github.com/cnyup/yup-mark/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](#中文) | [English](#english)

## 中文

一个开源、免费、类 [Typora](https://typora.io/) 的所见即所得 Markdown 编辑器。

### 下载

前往 [Releases](https://github.com/cnyup/yup-mark/releases) 下载最新版本：

- **macOS**：`.dmg`（arm64 / x64）
- **Windows**：`.exe` 安装包（x64）

> macOS 安装包未做签名公证，首次打开请右键点击应用选择「打开」。

**当前状态：M4 完成（打磨收尾）** —— Typora 式渲染态编辑（标记就近淡显）+ 文件管理 + 扩展语法（公式/图表/表格）+ 视图三件套（源码 ⌘/ · 专注 F8 · 打字机 F9）+ 主题系统（内置多套、亮暗跟随系统、CSS 变量架构）、设置页（⌘,）、菜单与界面中英双语、快捷键与 Typora 官方双平台对齐。

### 特性路线

- [x] Typora 式渲染态编辑：所有块保持渲染，语法标记光标就近淡显 —— CodeMirror 6 + lezer-markdown 自研引擎
- [x] 文件树工作区 / 多标签 / 大纲 / 最近文件 / 会话恢复
- [x] KaTeX 数学公式、Mermaid 图表（懒加载）、Typora 网格表格（含行列工具栏与单元格编辑）、智能粘贴 URL
- [x] 视图三件套：源码模式（行号+当前行高亮）/ 专注模式 / 打字机模式，状态栏模式徽章
- [x] 主题系统：CSS 变量架构（Typora 变量子集兼容，见 docs/theme-compat.md），Yup 玫粉 / GitHub 蓝 / Notion 墨黑 / Newsprint 报纸 / 静谧紫 / GitHub Dark / Dracula
- [x] 中英双语界面 + 原生菜单；快捷键对齐 Typora 官方（macOS / Windows 双套）

完整设计见 [docs/DESIGN.md](docs/DESIGN.md)。开发者交接文档：

- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) —— 开发规范（分层铁律、内核模型、验证流水线）
- [docs/PROGRESS.md](docs/PROGRESS.md) —— 当前进度与验证基线
- [docs/ROADMAP.md](docs/ROADMAP.md) —— 后续目标与完成定义

### 终端版（TUI）

同一个 Markdown 引擎，跑在你的终端里 —— 无需安装桌面应用：

```bash
# 方式一：GitHub Release（无需任何账号）
npm install -g https://github.com/cnyup/yup-mark/releases/download/tui-v0.2.0/yupmark-tui-0.2.0.tgz
yupmark 文档.md                 # 打开/编辑单个文件（自动保存）
yupmark .                       # 目录模式（文件树 + 多标签）

# 方式二：npm（已发布 npm 官方源后可用）
npx yupmark-tui 文档.md
```

- **Typora 式渲染态编辑**：光标所在块显源码，移开即渲染（与桌面版同引擎、同语义）
- **扩展语法**：表格网格（可编辑）、数学公式 Unicode 近似、**mermaid 流程图/时序图 ASCII 字符画**、代码块高亮
- **CJK 安全**：中文宽字符的列定位、软换行、表格网格永不错位
- **主题与双语**：7 套配色（与桌面同源）+ 中英界面（`Alt+,` 设置）
- 跨平台（Windows Terminal / iTerm2 / kitty / 终端均可），Node ≥ 20

### 开发

```bash
npm install     # 安装依赖
npm run dev     # 启动开发模式（Electron + 热重载）
npm test        # 单元测试
npm run lint    # 代码检查
npm run typecheck
npm run build   # 生产构建
```

### 技术栈

Electron · React · TypeScript · CodeMirror 6 · lezer-markdown · zustand · i18next

### 许可

[MIT](LICENSE)

---

## English

An open-source, free, [Typora](https://typora.io/)-like WYSIWYG Markdown editor.

### Download

Grab the latest build from [Releases](https://github.com/cnyup/yup-mark/releases):

- **macOS**: `.dmg` (arm64 / x64)
- **Windows**: `.exe` installer (x64)

> macOS builds are unsigned — right-click the app and choose "Open" on first launch.

**Current status: M4 complete (polishing)** — Typora-style live rendering (in-place marker reveal), file management, math/mermaid/tables, view modes (source ⌘/ · focus F8 · typewriter F9), theme system, bilingual UI, Typora-aligned shortcuts.

Developer handoff docs: [CONVENTIONS](docs/CONVENTIONS.md) · [PROGRESS](docs/PROGRESS.md) · [ROADMAP](docs/ROADMAP.md). See [docs/DESIGN.md](docs/DESIGN.md) for the full design document.

### Terminal edition (TUI)

The same Markdown engine, running in your terminal — no desktop app required:

```bash
# Option 1: GitHub Release (no account needed)
npm install -g https://github.com/cnyup/yup-mark/releases/download/tui-v0.2.0/yupmark-tui-0.2.0.tgz
yupmark notes.md               # open/edit a single file (autosave)
yupmark .                      # directory mode (file tree + tabs)

# Option 2: npm (available once published to the registry)
npx yupmark-tui notes.md
```

- **Typora-style live editing**: the block under the cursor shows source; everything else stays rendered (same engine & semantics as the desktop app)
- **Extended syntax**: editable table grids, math via Unicode approximation, **mermaid flowcharts & sequence diagrams as ASCII art**, code highlighting
- **CJK-safe**: column tracking, soft wrap and table grids never misalign on wide characters
- **Themes & bilingual UI**: 7 palettes (same as desktop) + English/Chinese (`Alt+,` for settings)
- Cross-platform (Windows Terminal / iTerm2 / kitty / …), Node ≥ 20

### Tech Stack

Electron · React · TypeScript · CodeMirror 6 · lezer-markdown · zustand · i18next

### License

[MIT](LICENSE)
