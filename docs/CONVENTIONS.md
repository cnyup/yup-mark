# SoyupMark 开发规范（交接必读）

> 面向后续接手开发的 agent / 人类。项目全貌见 [DESIGN.md](./DESIGN.md)（ADR 与架构设计），
> 当前进度见 [PROGRESS.md](./PROGRESS.md)，待办见 [ROADMAP.md](./ROADMAP.md)。

## 0. 协作铁律（最高优先级）

- **所有决策由用户敲定，任何不确定的都要先问用户**（用户原话约束）。提供选项时给出推荐和理由。
- 每轮改动后必须跑完整验证流水线（见 §7），全绿才算完成。
- 用户以 macOS 截图对照 Typora 官方行为验收；快捷键一律以 Typora 官方表
  <https://support.typora.io/Shortcut-Keys/> 为准（注意该表更新滞后，如任务列表 ⌘⌥X 未收录——用户实际 Typora 菜单才是最终真相）。

## 1. 技术栈与命令

Electron 30 + electron-vite + React 18 + TypeScript + Zustand + CodeMirror 6 + @lezer/markdown + KaTeX + mermaid。

```bash
npm run dev        # 开发（Electron + HMR）
npm run typecheck  # tsc 双 tsconfig（node + web）
npm run lint       # eslint .
npm test           # vitest run（19 文件 / 134 用例基线）
npm run dist:mac   # electron-builder 打包（M5 用）
```

**dev 重启模板**（改 main/preload 后必须重启；渲染层改动 vite 会热更但建议统一重启）：

```bash
pkill -f "electron-vite dev"; pkill -f "MacOS/Electron"; sleep 1
(ELECTRON_ENABLE_LOGGING=1 npm run dev > /tmp/soyup-dev-<tag>.log 2>&1 &)
sleep 12; pgrep -f "MacOS/Electron"   # 拿到 pid 即成功
```

## 2. 分层规则（违反会破坏架构）

| 目录 | 职责 | 禁止 |
|---|---|---|
| `src/renderer/editor/` | CM6 编辑器内核，纯 TS | **零 React、零 Electron IPC 依赖**（要通知外壳时用 DOM 事件或回调，参考 viewModes 的 subscribe 模式） |
| `src/renderer/app/` | React 外壳（侧栏/标签/状态栏/设置）与 Zustand store | 直接操作 CM 内部 |
| `src/renderer/i18n/` | zh-CN / en-US 双语键（**两文件必须同步加**） | |
| `src/main/` | 主进程：菜单加速键、文件系统、剪贴板、工作区 | |
| `src/shared/` | 进程间契约：IPC 类型、路径/统计纯函数 | 引用 renderer 或 main 专属类型 |
| `src/preload/` | contextBridge 暴露 `window.soyupmark` | |

## 3. 编辑器内核核心模型（改动前必读）

### 3.1 装饰管线

```
rules.ts buildLiveDecorations(state, freezeRanges)  // 纯函数，可无头测试
  → engine.ts liveField（StateField 持有 RangeSet）
  → EditorView.decorations facet → DOM
```

重建触发条件（liveField.update）：`docChanged || selection || freezeChanged || parseAdvanced || viewModeChanged`。
语法树必须用 `ensureSyntaxTree(state, doc.length, 100) ?? syntaxTree(state)`（`blocks.ts` 已封装），否则大纲/装饰被视口懒解析截断。

### 3.2 渲染态编辑模型（2026-09 定型，Typora 式）

- **样式永远生效**：`cm-strong`/`cm-em`/`cm-link-text` 等 mark 不随光标消失。
- **行级标记**（`#`、`>`）：光标所在块内**淡显**（`cm-mark-dim`），离开后 `hide()` 隐藏。
- **行内标记**（`**`、`` ` ``、`[]()`）：选区落入语法跨度内才淡显（`inlineActive(from,to)`，非整块）。
- **列表符号/任务复选框**：始终替换为 Widget（编辑任务文字时圆框不消失）。
- **表格/图片/数学/HR**：光标进入其语法范围才显源码；表格的编辑由 TableWidget 内 contenteditable 单元格承担（`ignoreEvent()=true`）。
- **IME 冻结**：`compositionstart` 冻结整块为纯源码（`frozen()` 判定跳过所有装饰），防组合输入被 DOM 切换打断。**任何新装饰规则都要考虑 frozen 分支**。
- **源码模式**（⌘/）：`sourceModeField` 置位后 `hide()` 短路、输出过滤掉 Widget 与淡显，保留行样式与 mark；行号槽+当前行高亮由 `viewModes.ts` 的 Compartment 挂载。

### 3.3 多标签与状态工厂（⚠️ 历史致命 bug 区）

整个应用只有**一个 EditorView**（`EditorHost.tsx` 挂载），多标签通过 `view.setState(snapshot)` 切换。
`EditorState` 的创建路径有：`workspaceStore.makeTab` / `mountTabIntoView` / LRU 重建 / `createHostState`——
**全部必须经过含 `hostEvents()` 的状态工厂**（workspaceStore 的 `docState()`）。漏掉 updateListener 的历史 bug 曾导致
打开的标签编辑事件全断（dirty/字数/自动保存/大纲全部失效）。新增状态路径时先看 `hostEvents`。

### 3.4 键位系统

- `engine.ts` 的 `tableAndFormatKeys` 排在 `defaultKeymap` **之前**（keymap 优先级靠扩展顺序）。
- 双平台：`platform.ts` 的 `IS_MAC` 分支——mac 用 ⌘⌥ 系（⌘⌥U/O/Q/X、⌘⌥C/B/T），Win 用 Ctrl+Shift 系
  （Ctrl+Shift+] / [ / Q / X / K / M，Ctrl+T 表格，Alt+Shift+5 删除线，Ctrl+Shift+I 图片）。
- **主进程菜单加速键会抢在渲染层之前截胡**：新增编辑器快捷键前先查 `src/main/menu.ts` 冲突
  （历史事故：⌘\ 被侧栏占用、⌘=/⌘-/⌘0 被缩放 role 占用；已改为侧栏 ⌘⇧L、缩放 ⌘⇧±）。
- CM6 键名陷阱：`Mod-Shift-[` 这类经 base 表匹配（Shift 改变字符也能命中）；`Ctrl+Tab` 不会触发裸 `Tab` 绑定（isChar=false 无回退）。
- F8/F9 在 macOS 默认是媒体键，需 fn 前缀或菜单点击——状态栏模式徽章是可视化反馈。

### 3.5 主题系统

`:root` 定义默认值（= soyup 玫粉主题）；`html[data-theme='xxx']` 块覆盖（base.css 末尾）。
亮色主题只覆盖排版变量；`github-dark`/`dracula` 覆盖整套窗口变量（含 `--syntax-*`）。
设置链路：`SettingsModal → appSettings(store) → document.documentElement.dataset.theme → CSS`，
持久化在 localStorage（`settingsPersist.ts`，THEME_OPTIONS 数组即下拉顺序）。
**新增可配色元素必须走 CSS 变量**（如 `--link-color`、`--table-header-bg`），不许硬编码色值。

## 4. CSS 规范

- 变量命名对齐 Typora 主题约定（`--bg-color`/`--primary-color`/`--side-bar-bg-color`…，见 DESIGN.md §4.4）。
- **行装饰（`Decoration.line`）禁止垂直 margin**：CM6 坐标测量不含 margin，会导致点击错位——用 padding。
- 隐藏语法符号必须用 `Decoration.replace`（不能用 mark+display:none，理由见 rules.ts 头注释）。
- Widget 的 SVG 图标必须显式限宽高（否则按 300×150 渲染）。
- z-index 约定：ctx-overlay 100、ctx-sub 弹层 102；新浮层先查现有层级防互盖。

## 5. 测试规范

- vitest + jsdom。涉及 DOM/EditorView 的文件头加 `// @vitest-environment jsdom`。
- jsdom 已知陷阱：`navigator.platform` 为空 → `IS_MAC` 恒 false（测 Windows 分支正好，测 mac 分支需 stub）；
  无 `scrollIntoView`（代码用 `?.`）；`contenteditable=plaintext-only` 不可聚焦（单元格用 `tabindex=-1` + focus）。
- 纯函数（blockOps/tableOps/fileView/rules 装饰输出）优先做无头测试；视图级用真实 `new EditorView` 挂 div 断言 DOM。
- 修改渲染行为时，**先更新测试期望再实现**（编码旧行为的用例要反转，见 live.test.ts 列表项案例）。

## 6. 文本批量替换教训

用 python/sed 批量改 CSS/TS 时，**目标文本不匹配会静默跳过不报错**（已两次造成"改了没生效"假象）。
规范：优先用 Edit 工具；用脚本批量替换后必须 grep 验证落盘。

## 7. 交付流水线（每轮必跑）

```bash
npm run typecheck && npm run lint && npm test
# 全绿后按 §1 模板重启 dev，并给用户列出可手验的检查点
```

typecheck 双 project 都要过；lint 零告警；测试数不少于基线（134，见 PROGRESS.md）。
