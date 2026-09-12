# YupMark 设计方案

> 一个类 Typora 的所见即所得 Markdown 编辑器。开源、跨 macOS 与 Windows。
>
> 版本：v0.2（2026-09-10 修订） · 状态：已评审决策见 §2，待定项见 §9
>
> v0.2 修订要点：交互模型升级为 Typora 式渲染态编辑（§1.1/§4.1.2）；视图三件套（源码 ⌘/ · 专注 F8 · 打字机 F9）落地；表格可视化编辑落地（§4.2.4）；主题系统按 CSS 变量集实现、选择器兼容收缩为 v2 方向（§4.4）；目录结构对齐实际代码（§6）。

---

## 1. 概述

### 1.1 目标

复刻 Typora 的核心体验——**单栏、无模式、块级实时渲染的 Markdown 编辑**，并以开源、免费的形式长期维护。

Typora 的本质：文档由"块"（block）组成；**所有块始终渲染为富文本，光标所在的块只是把语法标记淡显出来**（"渲染文字 + 淡出标记"）。底层永远是纯文本 `.md` 文件。我们沿用同样的产品哲学（2026-09 起从"活跃块整块显源码"升级为与此一致的渲染态编辑模型，见 §4.1.2），用现代技术栈（Electron + React + CodeMirror 6 + TypeScript）重新实现。

### 1.2 非目标（MVP 明确不做）

- 导出 PDF/Word/ePub（依赖 Pandoc，后置大版本）
- 图床上传（PicGo 集成）
- 移动端 / Web 版
- 协同编辑
- 双链 / 知识管理（那是 Obsidian 的领地）

（打字机/专注/源码等视图模式原列于此，2026-09 已实现，见 §4.1.2 与 PROGRESS.md。）

### 1.3 产品名

`YupMark`（仓库目录已定名）。npm 包 / 应用 ID 统一使用小写 `yupmark`。

---

## 2. 已敲定的决策记录（ADR）

| # | 决策点 | 结论 | 备注 |
|---|--------|------|------|
| D1 | 目标平台 | macOS + Windows | Linux 架构上不做限制，但不承诺测试与分发 |
| D2 | 应用外壳 | Electron | 与 Typora/VS Code/MarkText 同路线，生态最成熟 |
| D3 | 编辑器内核 | **CodeMirror 6 自研块级实时渲染** | Typora 同源路线，项目核心资产与核心风险 |
| D4 | MVP 范围 | 核心编辑 + 文件管理 + 扩展语法 | 导出能力后置 |
| D5 | 前端框架 | React | 外壳 UI（文件树/标签/设置） |
| D6 | 主题系统 | **兼容 Typora 主题生态**（CSS 变量 + 选择器约定） | 见 §4.4 |
| D7 | 界面语言 | 中英双语（i18n，默认中文） | 见 §4.5 |
| D8 | 项目定位 | 准备开源发布 | 架构按"陌生人可贡献"标准，依赖许可证需审查 |
| D9 | Markdown 解析器 | @lezer/markdown + 官方 GFM 扩展 | 增量解析，与 CM6 同源；见 §4.1.1 |
| D10 | 代码高亮 | 编辑态 CM6 原生高亮，导出/复制场景动态加载 Shiki | 见 §4.2.1 |
| D11 | 开源协议 | MIT | 依赖全兼容 |
| D12 | 自动更新 | electron-updater + GitHub Releases | M5 启用，含 macOS 公证流程 |
| D13 | TUI 版本技术栈 | Node.js + Ink，CM6 状态层无头复用 | 2026-09-11 定，详见 [TUI.md](./TUI.md) |
| D14 | TUI 交互模型 | Typora 式单栏（渲染态编辑，光标所在块显源码） | 与桌面 §4.1.2 同源哲学 |
| D15 | TUI 代码位置 | 本仓库 monorepo（npm workspaces） | 内核抽 `packages/live-cm` + `packages/tui` |
| D16 | TUI 特殊块降级 | 数学 Unicode 近似、mermaid/图片占位框、光标进入显源码 | 终端图形协议真渲染列 v2 |
| D17 | TUI 键位体系 | Typora 桌面键位映射（终端键域内，冲突键找最近替代并公示） | vim 层列 v2 |
| D18 | TUI mermaid 渲染 | flowchart + sequenceDiagram 子集 ASCII 字符画（零依赖全终端）；其余类型/超限降级占位框 | 图形协议（kitty/sixel）真渲染列 v2 |

---

## 3. 总体架构

```
┌──────────────────────────────────────────────────────────────┐
│ Renderer Process (Chromium, React 18 + TS)                    │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ FileTree │ │ TabBar   │ │ Outline  │ │ Settings / i18n  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       └────────────┴─────┬──────┴────────────────┘            │
│                     ┌────▼─────────────────────────┐          │
│                     │ EditorHost                   │          │
│                     │  ┌────────────────────────┐  │          │
│                     │  │ @yupmark/live-cm     │  │          │
│                     │  │ (纯 TS，零 React 依赖)  │  │          │
│                     │  │  LiveRenderEngine      │  │          │
│                     │  │  BlockModel(AST)       │  │          │
│                     │  │  DecorationPipeline    │  │          │
│                     │  │  Widgets: KaTeX/Mermaid│  │          │
│                     │  │  TyporaCompat DOM 层    │  │          │
│                     │  └────────────────────────┘  │          │
│                     └─────────────────────────────┘           │
├──────────── typed IPC (contextBridge, 双向) ──────────────────┤
│ Main Process (Node.js)                                        │
│  ├ FileService      读/写/监听(watch) / 外部修改检测            │
│  ├ WorkspaceService 最近文件、工作区文件夹、会话恢复             │
│  ├ WindowService    多窗口、原生菜单(macOS/Windows 差异化)      │
│  └ (预留 SearchService ripgrep 全局搜索)                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 进程与安全基线

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`（渲染进程）。
- 所有 Node/fs 能力收在主进程，通过 preload 的 `contextBridge` 暴露**类型化** API（`src/shared/ipc.ts` 定义协议类型，主/渲染两侧共用）。
- IPC 消息带请求 ID + 错误结构化返回，禁止裸 `ipcRenderer.send` 字符串协议散落各处。

### 3.2 核心资产独立性

`packages/live-cm`（包名 `@yupmark/live-cm`）必须是**纯 TypeScript、零 React、零 Electron、零 Ink/Node 专属 API**的可独立测试模块：

- 可以在纯浏览器环境跑单测和 Storybook 式 playground；
- 未来可单独发包，成为项目最核心的开源卖点（一个 CM6 版的 Typora 引擎）；
- React 外壳只负责生命周期挂载和 UI 编排，不侵入编辑逻辑。

---

## 4. 核心模块设计

### 4.1 Live Render Engine（重中之重）

#### 4.1.1 块模型（BlockModel）

文档 = 块序列。块来自 Markdown 语法树的顶层节点：

```
Block {
  id: string            // 稳定 ID，用于装饰缓存与动画
  type: 'heading'|'paragraph'|'code'|'math'|'diagram'|'table'
      | 'list'|'quote'|'hr'|'html'
  from: number          // 文档内字符偏移
  to: number
  children?: Block[]    // 列表项/引用内嵌套
}
```

- 解析器基于 **lezer-markdown**（CM6 官方增量 Markdown 解析器，与 EditorState 的 SyntaxTree 共享增量解析管线）+ 官方 GFM 扩展（表格/删除线/任务列表/自动链接）。
  - 理由：装饰器管线天然消费 SyntaxNode；大文档增量更新性能远优于每次全量 parse 的 markdown-it。
  - 数学和 mermaid 块在 lezer 语法里注册自定义 `inline`/`block` parser 扩展，产出独立节点类型。
- 块树由 `StateField` 派生并随事务增量更新；块 ID 尽量跨编辑保持稳定（按块内容 + 邻居关系匹配），服务于后续大纲高亮与滚动同步。

#### 4.1.2 渲染态编辑模型（2026-09 定型，Typora 式）

所有块**始终渲染**，不存在"整块退回源码"的状态切换：

- 样式 mark（粗体/斜体/链接文字等）**永远生效**，不随光标进出消失；
- **行级标记**（`#`、`>`）：光标所在块内以淡色显示（`cm-mark-dim`），光标离开后隐藏；
- **行内标记**（`**`、`` ` ``、`[]()`）：仅当选区落入该语法跨度内才淡显（就近揭示，粒度是跨度而非整块）；
- **列表符号 / 任务复选框**：始终替换为 Widget（编辑列表文字时圆点/圆框不消失，复选框可点击切换）；
- **表格 / 图片 / 数学 / 分割线**：光标进入其语法范围时显示源码（表格由单元格 Widget 承担编辑，见 §4.2.4）；
- **活跃块判定**：`state.selection.ranges` 任一 range 与块区间相交 ⇒ 该块行级标记淡显；
- **视图三件套**（`viewModes.ts`，StateField 存于每个标签页状态）：源码模式 ⌘/（标记全显 + 行号槽 + 当前行高亮）、专注模式 F8（非当前块淡化）、打字机模式 F9（光标垂直居中）；
- **IME 安全（中文用户生命线）**：`compositionstart` 冻结所在块为纯源码（组合期间不施加任何装饰 DOM 变化），`compositionend` 解除；新增装饰规则必须考虑 frozen 分支。

#### 4.1.3 DecorationPipeline（语法隐藏规则表）

按语法逐条定义"隐藏什么、换成什么"。M1 目标语法集（"淡显"= 光标就近时显示浅色标记，见 §4.1.2）：

| 语法 | 隐藏 | 替换 Widget | 备注 |
|------|------|:------------|------|
| 标题 `#`+空格 | 隐藏 `#` 序列 | 无（靠 CSS 样式区分层级） | 光标所在块内 `#` 淡显 |
| 强调 `**x**` | 隐藏四个 `*` | 无（CSS `strong`） | |
| 斜体/删除线 | 隐藏标记符 | 无 | |
| 行内代码 | 隐藏反引号 | 无 | |
| 链接 `[t](url)` | 隐藏 `[ ] (url)` | 显示 `t`，hover 浮层显示 url，⌘+点击打开 | 选区入内时标记淡显 |
| 图片 `![alt](src)` | 隐藏全部 | `<img>` Widget | 光标入内显源码 |
| 引用 `>` | 隐藏 `>` | CSS 左边框竖线 | 光标所在块内 `>` 淡显 |
| 任务列表 `[ ]`/`[x]` | 隐藏 `-` 与标记 | 复选框 Widget（始终渲染，可点击切换） | |
| 水平线 `---` | 隐藏全部 | `<hr>` Widget | |
| 行内公式 `$x$` | 隐藏全部 | KaTeX Widget | 光标入内显源码 |
| 块级公式 `$$` | 隐藏全部 | KaTeX 块 Widget | |
| mermaid 块 | 隐藏全部 | Mermaid SVG Widget + "编辑"角标 | |
| 表格 | 隐藏分隔行与竖线 | 网格表格 Widget：单元格直接编辑 + 行列工具栏 | §4.2.4 |
| 代码块 | **不隐藏**（代码本无渲染态） | 无需 Widget，原生 CM6 nested language | §4.2.1 |

实现要点：

- 装饰由 `rules.ts buildLiveDecorations`（纯函数，可无头测试）计算，经 `engine.ts liveField`（StateField）输出到 `EditorView.decorations`；语法树用 `ensureSyntaxTree` 同步补齐（视口懒解析会截断装饰与大纲）。
- 隐藏必须用 `Decoration.replace`（文本完全脱离 DOM）——**不能**用 mark + `display:none`：无布局矩形会破坏 `posAtCoords` 坐标映射，导致点击落点错位。
- **边界 case 清单**（M1 验收项）：转义符 `\*`、未闭合强调、嵌套强调（`**a *b* c**`）、块内多行语法（引用内列表）、光标恰好停在隐藏符号边界、undo/redo 后装饰一致性、拖拽选择跨块时的渲染态保持。

#### 4.1.4 与 Typora 体验对齐的细节

- 光标从渲染块上方/下方"穿过"时块保持渲染态（只有真正落点进入才激活）。
- Enter/Backspace 在块首块尾的语义（拆块/合块）保持 CM6 默认 + markdown 语言内置支持（CM6 `@codemirror/lang-markdown` 自带列表续写、缩进）。
- 自动配对：`**`、`$`、`` ` `` 的智能补全（M1 用简版，M4 打磨）。
- 粘贴 URL 到选中文字上自动生成链接（Typora 招牌小功能，M3）。

### 4.2 特殊块

#### 4.2.1 代码块（不做双态）

Typora 的代码块永远是源码形态（只是带语言高亮和外壳），我们完全一致：

- CM6 nested language（`@codemirror/lang-markdown` 的 `codeLanguages` 机制）实现块内高亮编辑。
- 高亮主题：**Shiki 只用于导出/复制富文本场景**（编辑态用 CM6 自己的 highlight，避免双引擎闪烁）；待定项 §9-T2。

#### 4.2.2 数学公式（KaTeX）

- 行内 `$...$` 与块级 `$$...$$`。
- 渲染态：KaTeX Widget（渲染失败时显示红色错误行内提示，点击进入编辑态修正）。
- KaTeX 而非 MathJax：体积小一个数量级、同步渲染不闪、Typora 用户无感知差异。

#### 4.2.3 Mermaid 图表

- 渲染态：mermaid SVG Widget；解析失败显示源码 + 错误面板（Typora 同款行为）。
- Widget 带 hover 工具条：编辑 / 放大查看 / 复制 SVG。
- 首次滚动到可视区才渲染（IntersectionObserver 懒渲染），避免长文档卡顿。

#### 4.2.4 表格（2026-09 已实现可视化编辑）

- 渲染态：Typora 网格表格 Widget（浅灰表头 + 斑马纹 + `:---` 对齐）；单元格为 contenteditable，可直接编辑（blur / Tab 时同步回源码）。
- 上方悬浮工具栏：行列增删、列对齐、删除表格；键盘导航（Tab/Enter/方向键进出表格、⇧⌘⌫ 删行）。
- 结构兼容：新版 lezer-markdown 的 TableHeader 直接挂 TableCell（无 TableRow 包裹）；全空单元格行按竖线手动切分合成区间。

### 4.3 文件与工作区（M2）

- **打开方式**：单文件打开 + "打开文件夹为工作区"（Typora 同款）。
- 文件树：主进程 `fs.watch`（递归）→ IPC 推送变更 → React 树增量更新；新建/重命名/删除/在 Finder 中显示。
- 多标签页：**单 EditorView + `view.setState` 状态快照切换**（所有 EditorState 必须经含 updateListener 的状态工厂创建，见 CONVENTIONS §3.3）；Tab 超限时 LRU 卸载快照，重新激活恢复滚动位置与撤销栈。
- 大纲面板：消费 BlockModel 的 heading 树，双向定位（点击跳转 / 光标同步高亮）。
- 最近文件与会话恢复：主进程 JSON 存储（`app.getPath('userData')/state.json`）。
- **外部修改检测**：watcher 触发 → 未保存修改则弹三选一（保留我的/加载磁盘版/对比），已保存则静默重载。保持 undo 栈（用整体替换 + 重建）。
- 自动保存：内容变化 debounce 800ms 落盘 + 失焦立即保存。保存策略（仅自动保存 / 手动 Ctrl+S 混合）默认前者，设置项可关。

### 4.4 主题系统（CSS 变量兼容，2026-09 落地）

Typora 主题 = 一份用户 CSS。我们的兼容策略（v0.1 边界）：

- **变量命名兼容**：基础变量与 Typora 主题同名同义（`--bg-color`、`--text-color`、`--side-bar-bg-color` 等），变量值可直接互搬；
- **选择器不兼容**（明确不支持，完整边界见 theme-compat.md）：渲染 DOM 是 CodeMirror 行结构（`.cm-h-line.cm-h1`、`.cm-table` 等），Typora 的 `#write h1`、`.md-diagram-panel` 等选择器规则不互通；选择器级兼容列为 v2 方向；
- 内置主题 7 套：`yup`（默认玫粉）、`github`、`notion`、`newsprint`（衬线正文）、`purple`、`github-dark`、`dracula`——后两套覆盖整套窗口配色（含 `--syntax-*` 语法高亮），亮色主题只覆盖排版变量；
- 切换机制：`html[data-theme]` 属性 + localStorage 持久化（`settingsPersist.ts`），`auto` 跟随系统亮暗（亮 = yup，暗 = github-dark），mermaid 图表配色自动跟随；
- 主题定义位置：`src/renderer/assets/base.css` 末尾的 `[data-theme='…']` 变量块（独立主题文件目录列为 v2）。

### 4.5 i18n

- 方案：`i18next` + `react-i18next`，文案全量走 key，禁止硬编码。
- 默认语言 `zh-CN`，`en-US` 全量对照；语言跟随系统 + 手动覆盖。
- 日期/数字用 `Intl`。RTL 不在范围内。

---

## 5. 技术栈与依赖清单

| 层 | 选型 | 许可证 | 说明 |
|----|------|--------|------|
| 外壳 | Electron (LTS 版本钉死) | MIT | |
| 构建 | electron-vite + Vite + TS (strict) | MIT | |
| UI | React 18 + zustand | MIT | 状态管理用 zustand（轻、无样板代码） |
| 编辑器 | @codemirror/{state,view,language,commands} + lang-markdown | MIT | |
| Markdown 解析 | @lezer/markdown + GFM 扩展 | MIT | 增量解析，见 §4.1.1 |
| 公式 | KaTeX | MIT | |
| 图表 | mermaid | MIT | |
| i18n | i18next | MIT | |
| 测试 | vitest + @testing-library/react + Playwright（跨平台 E2E） | MIT | 编辑器核心纯环境单测，IPC 层 Playwright |

全部 MIT 系，开源无污染（D8 前提）。**不引入** Tiptap/ProseMirror（与 CM6 路线冲突）、不引入 UI 组件大库（自绘轻量组件，保体积与主题可控）。

## 6. 目录结构

```
YupMark/                        # npm workspaces 根
├── package.json / electron-vite 配置 / tsconfig.{node,web,tui}.json
├── docs/                    # DESIGN / CONVENTIONS / PROGRESS / ROADMAP / theme-compat / TUI
├── packages/
│   ├── live-cm/             # 编辑器内核 @yupmark/live-cm（纯 TS、桌面/TUI 共享：
│   │                        #   engine / rules / blocks / widgets / viewModes / commands /
│   │                        #   contextMenu / tableOps / blockOps / platform / paths / …）
│   └── tui/                 # yupmark-tui（Ink 壳 + 无头装配器 preview / state / cli + 冒烟脚本）
├── release/                 # electron-builder 输出（不入库）
├── samples/                 # 体验文档
├── src/
│   ├── main/                # 主进程：index / menu / fileService / workspaceService
│   ├── preload/index.ts     # contextBridge 类型化 API
│   ├── shared/              # ipc 协议类型 / stats / fsutils（路径工具已归 live-cm）
│   └── renderer/
│       ├── app/             # React 外壳（App/EditorHost/Sidebar/TabBar/StatusBar/
│       │                    #   SettingsModal/… + store/{workspaceStore,appSettings}）
│       ├── assets/base.css  # 全部样式 + 七套主题变量块
│       └── i18n/            # zh-CN / en-US
├── tests/unit/              # vitest + jsdom（含 headless-node 无头冒烟）
└── packages/tui/tests/      # TUI 无头装配器单测
```

## 7. 里程碑

| 阶段 | 周期 | 交付物 | 验收标准 |
|------|------|--------|----------|
| **M0 脚手架** | 1 周 | electron-vite + React + CM6 hello world；MIT LICENSE；CI（lint/test/build 三平台矩阵中的 mac+win）；原生菜单骨架 | 应用可打开/编辑/保存单个 .md |
| **M1 编辑核心** | 3-4 周 | BlockModel + §4.1.3 表中除公式/图表/表格外全部语法隐藏；自动保存；IME 安全 | 连续编辑 30 分钟无渲染态异常；IME 全程稳定；10k 行文档滚动/输入 <16ms 帧 |
| **M2 文件管理** | 2-3 周 | 文件树、多标签、大纲、最近文件、外部修改检测、会话恢复 | 典型仓库目录（500+ 文件）树操作流畅；外部修改三选一流程完备 |
| **M3 扩展语法** | 2 周 | KaTeX 行内/块、mermaid（懒渲染）、代码高亮增强、表格 Widget、智能粘贴 URL | Typora 官方文档级复杂样例文档渲染正确（作为黄金测试集） |
| **M4 主题与打磨** | 2 周 | Typora 主题兼容层 + 内置 5 主题 + 亮暗切换 + i18n 收口 + 设置页 | 3 个主流社区 Typora 主题直接可用 |
| **M5 开源发布** | 1-2 周 | README（中英）、贡献指南、架构文档、v0.1.0 发布、自动更新通道 | 陌生开发者 15 分钟内完成本地构建 |

里程碑顺序即依赖顺序；每个 M 结束打 tag、写 changelog。

## 8. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|------|------|------|
| R1 | 语法隐藏边界 case 海量（转义/嵌套/多行/未闭合），Typora 打磨了 8 年 | 高 | 语法集按表逐条交付，每条带黄金样例；渲染失败兜底 = 显示源码（永不白屏/丢字） |
| R2 | IME 与渲染态切换冲突 | 高 | composition 期间冻结活跃块集合；M1 起自动化测试双平台输入法 |
| R3 | 光标进出块的视觉跳动破坏沉浸感 | 高 | 隐藏用 0 宽隐藏而非删除字符，字号行高不变；逐块目测调优清单 |
| R4 | 大文档装饰重算性能 | 中 | 块级缓存 + 只重算变化区间；1 万行文档纳入性能基准门禁 |
| R5 | Typora 主题兼容承诺范围失控 | 中 | 承诺"核心子集"（§4.4 表）而非 100%；映射表公开，不满足的选择器明确列为不支持 |
| R6 | mermaid/KaTeX 体积拖慢首屏 | 低 | 动态 import + 懒渲染 |
| R7 | Electron 双平台差异（菜单/快捷键/文件对话框） | 低 | 快捷键统一抽象层（⌘/Ctrl 映射表），菜单两套定义共享 action 常量 |

**总兜底原则**：任何渲染异常的块自动降级为纯源码显示——编辑器在任何情况下不丢内容。

## 9. 待定项（我的建议默认值，随时可推翻）

| # | 事项 | 我的默认建议 | 备选 |
|---|------|--------------|------|
| T5 | 状态管理 | zustand | Redux Toolkit |
| T6 | 应用图标 / 视觉设计 | M0 用占位图标，M4 前定稿 | —— |

（原 T1-T4 已升级为决策记录 D9-D12。）

---

## 附：调研来源

- Typora 官网与定价（$14.99 一次性 / 3 设备 / 15 天试用）：[typora.io](https://typora.io/)
- Typora 基于 CodeMirror GFM 魔改：[typora-issues #315 (GitHub)](https://github.com/typora/typora-issues)
- Typora 版本史与功能演进：[support.typora.io/What's-New](https://support.typora.io/What's-New/)
- MarkText（Electron+Vue，最接近 Typora 的开源品，2022 起停更）：[GitHub](https://github.com/marktext/marktext) · [ARCHITECTURE.md](https://github.com/marktext/marktext/blob/develop/packages/website/content/docs/dev/ARCHITECTURE.md) · [r/Markdown 停更讨论](https://www.reddit.com/r/Markdown/comments/1kcy85q/looking_for_a_wysiwyg_markdown_editor_for_fedora/)
- 2026 Typora 替代品盘点：[unmarkdown.com](https://unmarkdown.com/blog/best-markdown-editors-2026) · [nimbalyst.com](https://nimbalyst.com/blog/typora-alternatives-2026/)
- 编辑器内核对比：[Vditor（即时渲染模式）](https://github.com/vanessa219/vditor) · [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown) · [Liveblocks 2025 编辑器框架指南](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
