# YupMark 开发进度（截至 2026-09-11）

> 里程碑定义见 [DESIGN.md §7](./DESIGN.md)。规范见 [CONVENTIONS.md](./CONVENTIONS.md)，待办见 [ROADMAP.md](./ROADMAP.md)（双轨制）。TUI 版设计见 [TUI.md](./TUI.md)。

## 1. 里程碑总览

| 里程碑 | 范围 | 状态 |
|---|---|---|
| M0 脚手架 | electron-vite + React + CM6 + 原生菜单 | ✅ 完成 |
| M1 编辑核心 | 块级实时渲染、语法隐藏、自动保存、IME 安全 | ✅ 完成 |
| M2 文件管理 | 文件树、多标签、大纲、外部修改检测、会话恢复 | ✅ 完成 |
| M3 扩展语法 | KaTeX、mermaid、代码高亮、表格 Widget、智能粘贴 | ✅ 完成 |
| M4 主题与打磨 | 主题系统、i18n、设置页、快捷键对齐、视图三件套 | ✅ 完成（超出原范围，含大量 Typora 对齐打磨） |
| M5 开源发布 | 打包、自动更新、README/贡献指南、发布 | ⬜ 未开始 |

**验证基线**：typecheck 0 错误（node/web/tui 三 project）· eslint 干净 · vitest 35 文件 / 267 用例全绿。

## 2. 已完成功能清单

### 编辑器内核（packages/live-cm/src/，MT0 前位于 src/renderer/editor/）
- 块级实时渲染（rules.ts）：标题/粗斜/删除线/行内代码/链接/图片/引用/HR/列表/任务列表/表格/数学/mermaid 全覆盖
- **Typora 式渲染态编辑**（2026-09-09 定型）：样式常驻 + 语法标记就近淡显（`cm-mark-dim`），列表符号/复选框始终渲染，IME 组合冻结纯源码
- 表格：Typora 网格样式（浅灰表头+斑马纹）、上方悬浮工具栏（行列增删/对齐/删表）、单元格 contenteditable 编辑、键盘导航（Tab/Enter/方向键/⇧⌘⌫ 删行）、空行单元格合成、TableHeader 新版结构兼容
- 代码块：底部语言选择器（22 常见语言+自定义+清除）
- 任务列表复选框：圆形待办样式（Things 风）、点击切换
- 右键菜单：Typora 三段布局（段落/格式/插入子菜单，图标+文字+快捷键）、插入表格确认弹窗（3×4 默认）
- 快捷键：与 Typora 官方 macOS/Windows 双平台对齐（见 engine.ts `tableAndFormatKeys`），含标题升降级 ⌘=/⌘-、选行 ⌘L、选词 ⌘D、删词 ⇧⌘D、跳选区 ⌘J、任务列表 ⌘⌥X
- 视图三件套（viewModes.ts）：源码模式 ⌘/（含行号槽+当前行高亮）、专注模式 F8（非当前块淡化）、打字机模式 F9（光标居中）；状态栏模式徽章可点击退出
- 智能粘贴 URL → `[文字](URL)`；⌘点击打开链接/图片；选中后输入 `` ` ``/`*`/`$`/`~` 自动包裹
- 大纲懒解析修复（ensureSyntaxTree 根治截断）

### 外壳（src/renderer/app/）
- 侧栏：Typora 化头部（面板切换/标题/搜索）、悬浮底栏（新建/目录操作弹窗/视图切换/开关）、树/列表双视图（列表带预览）、5 种排序+最近目录、data-tip 悬浮提示
- 标签页：LRU 状态快照、保存反馈（蓝点 dirty/绿✓ 已存）
- 状态栏：文件名/保存状态/行数字数字符、视图模式徽章、侧栏开关（最右）
- 冲突弹窗（外部修改三选一，"对比"视图未做）
- 会话持久化：标签、侧栏开合/面板/文件视图/排序、最近目录

### 主题与设置
- 主题系统落地：`:root` 默认（yup 玫粉）+ `html[data-theme]` 六套——GitHub 蓝 / Notion 墨黑 / Newsprint 报纸（衬线正文）/ 静谧紫 / GitHub Dark / Dracula（暗色整套）；设置面板即时切换 + localStorage 持久化 + auto 跟随系统
- i18n 中英双语；原生菜单双语（主进程按语言重建）

### 主进程
- 原生菜单（文件/编辑/视图/窗口/帮助），Typora 对齐加速键（侧栏 ⌘⇧L、文档切换 ⌃Tab/⌘`、视图三件套、缩放 ⌘⇧±）
- IPC：文件读写/树/对话框/剪贴板/最近目录/语言
- 外部修改 watcher、自动保存调度

## 3. 代码规模

- renderer 约 4100 行 TS/TSX（editor 内核 21 文件 + app 外壳 17 文件），main 4 文件，shared 4 文件
- 测试 19 文件 134 用例（blockOps/tableOps/fileView/rules 装饰/视图冒烟/表格导航/快捷键链路/保存反馈/复选框/视图模式等）

## 4. 已知遗留（细节见 ROADMAP）

- 表格是文档第一块时，上方无插入新段落入口（块前空段落机制缺）
- 下划线 ⌘U 未做（需行内 HTML 渲染支持）
- 编辑器内查找替换（⌘F/⌘H）整体缺失
- 列表内 Tab 是空格缩进，未实现 Typora 的列表项升降层级
- 冲突弹窗"对比"视图未做
- 项目**尚未 git init**（M0 至今零提交，ROADMAP P0 第一项）
- Windows 侧任务列表快捷键 Ctrl+Shift+X 是第三方佐证，未经官方表确认

## 5. 本轮（2026-09）大改动备忘

1. updateListener 丢失事故修复：`hostEvents()` 状态工厂统一所有 EditorState 路径
2. 交互模型从"活跃块=整块源码"切换为"Typora 渲染态编辑 + 标记淡显"（rules.ts 全面重构，live.test 相应用例反转）
3. 快捷键双平台对齐 + 三个菜单加速键冲突修复（⌘\、⌘=、⌘0）
4. 视图三件套 + 模式徽章 + 状态订阅（subscribeViewModes）
5. 主题系统 CSS 真正落地（此前设置里可选但无样式效果）

## 6. 2026-09-11 TUI 立项（设计定稿 + 可行性验证）

- **决策**（ADR D13–D17，用户逐项敲定）：Node.js + Ink / Typora 式单栏 / 本仓库 monorepo / 特殊块务实降级 / Typora 键位映射；v1 功能范围 = 桌面现有功能全部上 TUI（特殊块按降级策略）。设计文档 [TUI.md](./TUI.md)，ROADMAP 改双轨制。
- **可行性已验证**：新增 `tests/unit/headless-node.test.ts`（纯 Node 无 DOM 环境，`// @vitest-environment node`）——`@codemirror/view` 的 `Decoration` 与 `buildLiveDecorations` 完整跑通（非活跃块隐藏 `# `/`> `/`**`、活跃块淡显、mark 产出），TUI 复用内核的核心前提成立。
- **开发环境**：本机（Windows）winget 安装 Node v24.19.0 LTS；npm allow-scripts 需批准 esbuild postinstall（平台二进制）；验证流水线全绿（typecheck / lint / 138 用例）。

## 7. MT0 完成（2026-09-11，monorepo 抽包 + TUI 骨架）

- **monorepo**：npm workspaces；`src/renderer/editor`（20 文件）→ `packages/live-cm`（包名 `@yupmark/live-cm`，exports `./src/*.ts` 直出 TS 源）；桌面 app/测试全部改经 `@yupmark/live-cm/*` 导入；`@shared/paths` 归入内核（`live-cm/paths.ts`，app 反向引用内核）。
- **TUI 包** `packages/tui`（`yupmark-tui`）：`src/preview.ts`（无头装配器：装饰 → Span 结构，EditorSurface 种子）· `src/state.ts`（docState 解析器工厂，GFM+数学与内核对齐）· `src/cli.tsx`（Ink 备用屏静态预览，q/Esc/Ctrl+C 退出；非 TTY 纯文本输出供 CI）· `scripts/headless-smoke.mjs`（esbuild 打包内核→无 DOM 运行，输出 17 项装饰区间）。
- **验证**：typecheck 三 project / lint / **144 用例**（+6 TUI preview 单测）/ 桌面生产构建产物 hash 与迁移前一致（零逻辑改动佐证）；冒烟与 CLI 非 TTY 运行均通过。偏差与发现记录见 TUI.md §12。

## 8. MT1 完成（2026-09-11，EditorSurface 编辑面 MVP）

- **模块**（packages/tui/src/editor/）：session（CM6 无头事务宿主 + useSyncExternalStore 协议）· measure（string-width CJK 列换算/码点步进/贪心软换行）· layout（装饰→cells→视觉行，widget 终端替身 ○/◉/•，光标反色格，同参 memo）· viewport（行级滚动 + 居中兜底）· keys（D17 MT1 子集：输入/删除/列表续写/方向键视觉列目标/词跳/PgUp/PgDn/选择/^S/^Q）· doc（800ms 防抖自动保存 + 退出 flush）· app（编辑面 + 状态栏 + useCursor IME 锚点）。
- **CLI**：`yupmark [file.md]` 可编辑闭环；非 TTY 仍走纯文本预览。
- **性能（RT4 兑现与治理）**：10k 行中文文档每键全量装饰 90ms → 内核新增 range 参数（附加式，桌面不受影响）→ **14ms/键**（ink 30fps 预算内）；`scripts/perf.mjs` 探针纳入验收工具；等价性护栏 `live-range.test.ts`。
- **验证**：typecheck×3 / lint / **197 用例**（+41 TUI MT1 单测 + 6 区间等价用例）；react-hooks 编译器级规则全过。

## 9. MT2 完成（2026-09-11，高级语法渲染 + 表格网格编辑）

- **三态行装配**：cells / block（多行预渲染）/ absorbed（块吞并行）——表格网格、块级数学、占位框、HR 以整块进入视口；块渲染按 widget 实例本趟缓存。
- **新增渲染器**：`math-unicode.ts`（LaTeX→Unicode 白名单近似：上下标组合/√/分数/符号希腊字母；失败一律降级源码）· `grid.ts`（表格 box 网格：表头粗体、对齐、超宽列截断；mermaid/图片信息占位框；HR）。代码块 token 着色（highlightTree + tag→色）。
- **表格网格编辑模式（用户选方案 A）**：格 span 模型（table-mode.ts）——文档光标即格内插入符，state 纯推导、打字直写源码、undo 逐字；键位路由（table-keys.ts）Tab/⏎/方向键跨格、边界跳出、Alt+R/N/D/X/A/T 行列增删/对齐/删表（复用 tableOps 整表重写后重锚定）；渲染覆盖 + 激活格 cyan/插入符反色 + useCursor 锚定；状态栏上下文提示条。
- **非 TTY 预览升级**：cli CI 输出走完整装配管线，samples/m1、m3 黄金样例经此验证（含 `∑ᵢ₌₁ⁿ` 近似与 `^\infty` 降级路径）。
- **验证**：typecheck×3 / lint / **239 用例**（+42 MT2 用例，含 18 个表格模式用例）；每键 15.6ms@10k 行（含 tableAt 树解析）。

## 10. MT3 完成（2026-09-11，壳与效率，a+b 两单元）

- **多标签**：workspace 总装（单一输入路由 + preInterceptor 全局键拦截）；Alt+]/[ 切换、Alt+W 关闭（关前 flush）；TabBar 按宽截断；`yupmark a.md b.md` 多文件。
- **查找替换**：^F/^H、⏎/⇧⏎ 命中循环、Alt+R/A 替换当前/全部；当前命中反色 + 其余下划线（layout highlights）；纯函数 8 用例。
- **大纲**：Alt+O 模态面板（j/k/⏎/Esc），复用内核 extractOutline/activeOutlineItem，光标跟随 cyan。
- **视图三件套**：Alt+S/F/P（终端无 F 键，键位变更公示于 TUI.md §12c）；直接 dispatch 内核 StateEffect；源码模式行号槽 + 打字机居中滚动；docState 显式挂载视图字段。
- **MT3b**：文件树（filetree 扫描/展开纯函数 + Alt+E 模态面板 + n 新建文件 + 打开去重）+ 上下文菜单（Alt+M：格式包裹/插入模板，纯事务）。cli 目录参数进工作区模式。
- **验证**：typecheck×3 / lint / **255 用例**（+16）；11.7ms@10k 行。
- **MT4 完成（2026-09-11）**：颜色 token 体系 + 7 套调色板（同源桌面主色，暗色自绘背景）· 设置栏 Alt+,（主题/语言，持久化 ~/.config/yupmark/tui.json）· 会话恢复（标签/根目录/设置）· 外部修改检测（mtime 轮询 + judge 四判定：静默重载/二选一冲突弹窗）· i18n（zh/en，LANG 探测）。验证：typecheck×3 / lint 零告警 / **267 用例**（+12）；10.9ms@10k 行。
- **下一步**：MT5（npm 分发 + CI 三平台矩阵）——TUI 最后一个里程碑。

## 11. MT4.5 完成（2026-09-11，mermaid flowchart 字符画，D18 路线 B）

- **起因**：用户实测发现 mermaid 只显占位框（"无法显示"）；A 图形协议 / B ASCII 字符画 / C 保持现状问询未获显式选择，"继续"放行 → 按推荐 B 先行（零依赖全终端；A 需 ~150MB Chromium 且多数终端不支持，列 v2）。
- **模块** `packages/tui/src/mermaid-flowchart.ts`（纯函数）：解析子集（形状 `[..] (..) {..} ([..]) ((..))` 与裸 id→矩形、边 `--> --- -.-> ==> --o --x`、管道/内联标签、链式、引号标签、实体、%% 注释、指令行忽略）+ 布局（DFS 回边检测 → 最长路径分层 → 重心排序；TD 层间通道/右侧檐列，LR 镜像底部檐行）+ 画布（显示列索引 CJK 安全、方向位并集合并线段）。
- **接线**：layout.ts MermaidWidget 分支——字符画成功即用，否则回落原占位框；**绝不画错图**（未识别语法/超 40 节点/超终端宽/超 50 行高 → 占位框）。
- **验证**：m3 样例（菱形分支+跳层檐列+自环）经 run-cli.mjs 真实管线目检；解析/渲染/LR/降级 **13 新用例**；typecheck×3 + lint 零告警；基线 **36 文件 / 280 用例**全绿。
- **下一步**：仍是 MT5（npm 分发 + CI 三平台矩阵）。
- **整屏闪烁修复（2026-09-11）**：用户实测"光标一动整屏闪"。取证（YUPMARK_DEBUG_OUT 捕获 VT 载荷）双根因：① ink 满屏应用绕过增量 renderer 每帧 clearTerminal 整帧重写 → run-cli.mjs esbuild 插丁放行增量路径（每键只重写变化行）；② Autosaver 误把纯选区移动判脏（subscribe 全量触发 + 基线空串）→ session.subscribeDoc（仅 docChanged）+ 基线=打开时内容。附带：eslint ignores + spikes/**。36 文件 / 280 用例、typecheck×3、lint 全绿（TUI.md §12g）。
- **MT4.5 mermaid 时序图字符画（2026-09-12）**：用户反馈第二个 mermaid 块（时序图）只显占位框——D18 首期只覆盖 flowchart，本里程碑补齐。`packages/tui/src/mermaid-sequence.ts`：participant/actor + 四类箭头（实线/虚线/叉头/开箭头）+ Note 三定位 + 自环回勾 + title；激活前缀/结构行解析后忽略；未知语法/超限整体 null 占位框（绝不画错图）。layout.ts 三级回落 flowchart → sequence → 占位框。38 文件 / 302 用例全绿（TUI.md §12f+）。

## 12. MT5 完成（2026-09-13，npm 分发——TUI 线收官）

- **渲染收尾（11-13 日间随用户实测连续修复）**：整屏闪烁（ink 满屏 clearTerminal）→ 状态栏残影（尾随换行 off-by-one）→ 整帧漂移根治（log-update 整文件替换为绝对定位绘制器 + 12 单测）→ 数学近似平排回退（m3 三大公式全近似）→ 隐藏行光标残影块（无意图时 ESC[?25l）→ 状态栏瘦身。补丁抽共享模块 `ink-patches.mjs`（开发/发布共用）。全程取证通道 YUPMARK_DEBUG_OUT（详见 TUI.md §12g）。
- **收口巡检（a0cb2e3）**：mt2 补回 flowchart 集成覆盖、基线数字对齐、npm tui 脚本（`npm run tui -- <file>`）、删临时启动脚本。
- **MT5 交付**：`packages/tui/scripts/build-dist.mjs` 发布构建（自有代码+打补丁的 ink 内联，2.8MB 单文件；language-data 外置依赖，katex/mermaid 空桩）；`packages/tui/package.json`（name yupmark-tui / bin yupmark / files dist+README / engines ≥20 / 依赖仅 language-data）；README 中英「终端版」章节 + 包页 README；CI `.github/workflows/tui.yml` 三平台矩阵（冒烟/单测/构建/预览断言/tarball 独立安装 npx 验证）。
- **验证**：npm pack = 614KB；临时目录独立安装 `npx yupmark samples/m3-demo.md` 通过（流程图+时序图字符画正常）；38 文件 / 303 用例、typecheck×3、lint 全绿。
- **发布**：保持手动——`cd packages/tui && npm publish`（需 npm 账号；CI 只做验证不自动发）。
- **GitHub Release 通道（2026-09-13 追加，用户选定主通道）**：`.github/workflows/tui-release.yml`——推 `tui-vX.Y.Z` 标签（与桌面 `v*` 不冲突）自动跑测试/构建/冒烟后用 softprops 创建 Release 并附 npm tarball，Release 说明含免账号安装命令；README 安装说明双通道（GitHub Release 为主，npm 源后补）。发布动作 = `git push origin main --follow-tags`（需 GitHub 连通，当前网络需代理）。
- **TUI 线 MT0-MT5 全部完成**。后续待决：桌面线 P0/P1（⌘F 查找替换、列表 Tab 嵌套等）；v2 清单（图形协议真图、vim 层、单文件二进制、resetBaseline 小修）。

## 13. 桌面线 Tauri 重构启动（2026-09-18，TR0–TR3 编译级完成）

- **决策（用户逐项确认）**：Electron → Tauri 2.10 原位替换（renderer 保留、验收后删 Electron）；UI 组件库选 Radix 无头组件（视觉/7 套主题零改动）；构建在远程 yup-dev（仓库经 mutagen 接入 `~/github/yup-mark ⇄ /root/code/yup-mark`，远程装 Rust 1.98 + webkit2gtk-4.1；GUI 由用户本地 Mac `tauri dev` 手验）；自动更新/签名本次不做。整体方针不变：仿 Typora。
- **TR0 脚手架**：renderer 脱离 electron-vite → 纯 vite（root src/renderer、产物 dist/、别名不变；vitest.config 显式钉 root 防合并泄漏）；`src-tauri/`（窗口 1000×700/min 640×400、CSP+asset 协议 scope `**`、icons 由 build/icon.png 生成）；**`window.yupmark` Tauri 适配层** `src/renderer/lib/tauriApi.ts`（RUST_CMD 通道名映射表、Result 协议与 'canceled' 语义保持、`resolveAssetUrl` 供 engine-img 钩子）；main.tsx bootstrap 安装。
- **TR1 命令面**：20 个 invoke 命令全量 Rust 化（commands/mod.rs，dialog/opener/clipboard-manager 插件 Rust 侧调用 + notify crate）；state.json serde 同构（recent/recentDirs/session 三键 camelCase，session 走 Value 透传）；watcher 引用计数（key `r:`/`s:`，事件换算为「被监听目录 + 相对路径」对齐 handleFsEvent 拼接语义）；文件树 fsops.rs（自然排序/忽略集/20000 上限/预览 120 字符，Rust 单测 5 个）。
- **TR2 原生菜单**：menu.rs 双语 LABELS；加速键全对齐（⌘⇧L 侧栏、⌘`/Ctrl+Tab 切文档、⌘/ 源码、F8/F9、缩放 Ctrl+Shift±= 让出 ⌘=⌘-⌘0）；Open Recent 子菜单随 push_recent 重建；`set_language` 重建；缩放/全屏/reload/devtools/About 宿主侧直处理（menu:action 契约零改动，App.tsx 分发未动）；mac appMenu 走 `#[cfg(target_os)]`。
- **TR3 编辑链路**：外链 window.open 补丁 → Rust `open_external`（http/https 白名单）；关窗冲刷改 `onCloseRequested`（preventDefault → 冲刷 → destroy，WKWebView beforeunload 不可靠）；watcher/冲突弹窗/自动保存/会话逻辑本体未动（纯事件源替换）。
- **验证（编译级）**：cargo check/clippy 0 警告/fmt/test 7 用例 ✓；typecheck×3 + lint + vitest 39 文件/306 用例 ✓；vite build ✓。**GUI 手验清单待用户本地执行**（见 ROADMAP TR 章节）。
- **环境备忘**：远程磁盘曾满（清 go-build 缓存 8.4G 腾挪）；远程 Node 走 nvm v24.14（直接 `node` 可能命中系统 v18，命令统一 `source /root/.nvm/nvm.sh`）。

## 14. KP0 完成（2026-09-18，桌面 P0 内核补课——惠及 Tauri 线）

- **查找替换**：`@codemirror/search` 的 `search()` 进 baseExtensions（与 liveRender 装饰共存无冲突）；键位挂 tableAndFormatKeys——⌘F 查找、mac ⌥⌘F / Win Ctrl+H 打开面板并 best-effort 聚焦替换框（CM6 无官方 API，DOM 定位第二输入框）；面板 CSS 覆盖为 Typora 风（编辑区右上浮层、7 套主题走 CSS 变量；命中高亮主色/当前反色）。
- **列表 Tab 升降层级**：`adjustListIndent(view, ±1)`（engine.ts）+ 纯函数 `adjustListIndentLines`/`renumberOrderedLines`（blockOps.ts）——列表行 Tab 加 2 空格、Shift-Tab 去 2 空格（0 缩进回落默认）；有序列表栈式重编号（同级连续 1..n、深缩进子项不打断父级、空行宽松保持）；非列表行返回 false 回落 CM 默认缩进；剔除文档末尾幻影空行。
- **验证**：新增 15 用例（listIndent 12 + search 3：面板/命中进渲染态块/replaceAll 跨隐藏语法）→ 基线 **41 文件 / 321 用例**全绿；typecheck×3 + lint（补 src-tauri 构建产物 ignore）通过。

## 15. TR4 完成（2026-09-18，Radix 无头组件接入）

- **Dialog**（`ui/Modal.tsx`）：三个弹窗（Settings/Prompt/Conflict）迁移 Radix Dialog——焦点圈定/Esc/外点/aria/滚动锁定白得，DOM 结构与 `.modal-overlay`+`.modal` 类名不变；CSS 改 `.modal` 自居中（Overlay/Content 兄弟节点）；PromptModal 经 `initialFocus` 聚焦输入框；ConflictModal 的 Esc/外点 = 「稍后」。
- **ContextMenu**（FileTree）：手绘坐标菜单（MenuState + ctx-overlay）整体删除，树行/列表卡片/根目录头包 Radix ContextMenu——键盘导航/定位/选中即关白得；`.ctx-menu` 只留外观（定位交 Radix）。Sidebar ops 弹层仍用 `.ctx-overlay`（保留）。
- **Tooltip**（`ui/Tip.tsx`）：Sidebar/StatusBar 13 处 data-tip 纯 CSS 提示 → Radix Tooltip（350ms 延迟、键盘聚焦可达）；`[data-tip]` CSS 块删除，`.tip` 沿用原视觉。
- **验证**：新增 modals.test 4 用例（portal/role=dialog/初始焦点/Enter/Esc/文件与目录菜单项集）；**42 文件 / 325 用例**全绿；typecheck×3 + lint + vite build 通过。Radix onSelect 激活链路 jsdom 不可达 → GUI 手验。
- **待用户手验**：7 套主题 × 弹窗/右键菜单/提示的视觉回归（三平台 WebView）。
