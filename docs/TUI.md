# YupMark TUI 设计方案（终端版）

> 把 YupMark 带进终端：一个 Typora 心智、渲染态编辑的 Markdown TUI 编辑器（`yupmark-tui`）。
>
> 版本：v0.1（2026-09-11 首稿）· 状态：**待用户评审，未批准动工**
>
> 对应 ADR：DESIGN.md D13–D17（用户已逐项敲定，2026-09-11）。

---

## 0. 已敲定的决策（ADR 摘要）

| # | 决策点 | 结论 |
|---|--------|------|
| D13 | TUI 技术栈 | **Node.js + Ink**（React for CLI），CM6 状态层无头复用 |
| D14 | 交互模型 | **Typora 式单栏**：所有块渲染态，光标所在块显源码 |
| D15 | 代码位置 | **本仓库 monorepo**（npm workspaces）：内核抽包 + TUI 子包 |
| D16 | 特殊块降级 | **务实降级**：数学 Unicode 近似、mermaid/图片占位框、光标进入显源码；图形协议（kitty/sixel）真渲染列 v2 |
| D17 | 键位体系 | **Typora 桌面键位映射**（终端键域内能映射多少映射多少，装不下的找最近替代并公示） |
| —— | v1 功能范围 | **现有功能全部上 TUI**（用户明确要求；特殊块按 D16 降级） |
| —— | 开发环境 | 本机（Windows）装 Node LTS；TUI 实测 Windows Terminal + WSL Ubuntu 双环境 |

## 1. 目标与非目标

### 1.1 目标

- Linux（及任何有现代终端的平台）上的 Typora 式 Markdown 编辑体验：**无模式、渲染态、光标所在块显源码**。
- 与桌面版共享同一颗内核（解析、块模型、装饰规则、块操作/表格操作纯函数），一次修 bug 两端受益。
- `npx yupmark` / `npm i -g yupmark-tui` 即用，无图形环境依赖——补齐 DESIGN D1 里"Linux 不承诺分发"的缺口。

### 1.2 非目标（v1）

- 数学/mermaid/图片的像素级真渲染（终端图形协议，v2 方向）
- vim modal 键位层（v2 可选层）
- 鼠标全面交互（v1 键盘优先；SGR 鼠标点击定位列 v2）
- 协同/远程多端（与桌面版非目标一致）

## 2. 为什么可行：内核复用的技术依据

已核实（2026-09-11 代码审查）：

- `rules.ts buildLiveDecorations(state) → Range<Decoration>[]` 是**纯函数**，仅消费 EditorState；
- `blocks.ts / blockOps.ts / tableOps.ts / outline.ts / docDir.ts / viewModes.ts`（StateField 定义）全部零 DOM 依赖；
- `@codemirror/state`、`@codemirror/language`、`@lezer/markdown` 本身可在纯 Node 导入与运行（CM6 为无头测试设计）；
- `@codemirror/view` 的 `Decoration` / `WidgetType` 是纯数据类，导入与构造不触碰 DOM（DOM 只在桌面端 EditorView 实例化 Widget 时介入）；
- `widgets.ts` 里的 DOM Widget 类对 TUI 是**惰性负担**：TUI 渲染器按 decoration 的 widget 类型和 eq 语义分流到 TUI 降级渲染器，DOM 类永远不被实例化。

**结论**：桌面版唯一不可复用的是"渲染到 DOM"这一层；TUI 要写的正是"渲染到终端单元格 + ANSI"的等价层。MT0 的第一件事就是用一条纯 Node 冒烟脚本钉死这个前提（见 §9 MT0）。

TUI 反而比桌面简单的一点：**终端里我们自己就是坐标权威**——不存在 DOM `posAtCoords` 映射问题，`Decoration.replace` 的语义直接等价于"该区间字符不输出"。

## 3. 总体架构

```
┌─ packages/tui（Ink 壳，React 渲染到终端）─────────────────────┐
│  bin/yupmark        CLI 入口：文件/目录参数、版本、帮助         │
│  shell/             FileTree · Outline · TabBar · StatusBar    │
│                     SearchBar · ContextMenu · SettingsBar      │
│  surface/           ★ EditorSurface（本包核心资产）            │
│    render.ts        state → 视口 ANSI 行装配                  │
│    ansiMap.ts       Decoration.mark → ANSI 样式映射            │
│    viewport.ts      滚动/光标可见性（CJK 宽字符安全）           │
│    widgets/         TUI 降级渲染器（见 §5）                    │
│  input/keys.ts      Typora 键位映射 → CM6 transaction          │
│  theme.ts           7 套主题 → truecolor 调色板                │
│  services/          fs 读写/watch/最近文件/会话（Node 原生）     │
├─ 依赖（workspace）─────────────────────────────────────────┤
│  packages/live-cm  ← src/renderer/editor 平移（零逻辑改动）    │
│    rules/blocks/blockOps/tableOps/outline/viewModes/…          │
│    widgets.ts（DOM Widget 类，桌面端消费，TUI 分流忽略）        │
├─────────────────────────────────────────────────────────────┤
│  桌面端 src/renderer 改为从 @yupmark/live-cm 导入（行为不变）    │
└──────────────────────────────────────────────────────────────┘
```

分层铁律沿用 CONVENTIONS §2 并加一条：**`packages/live-cm` 禁止依赖 Ink/React/Node 专属 API**（保持浏览器与终端双栖）；**`packages/tui` 禁止反向改写内核渲染语义**——发现内核不够用，改内核并让桌面版同跑测试。

### 3.1 EditorSurface 渲染管线（核心机制）

```
Ink useInput → keys.ts 翻译 → view-less 事务调度
  state.dispatch(tr)                      （EditorState 无头，含全部 StateField）
  buildLiveDecorations(state)             （live-cm 原函数，含冻结/源码模式分支）
  行装配（viewport 内每行）：
    Decoration.replace(无 widget)  → 区间字符不输出（隐藏语法标记）
    Decoration.mark                → 字符套 ANSI（bold/italic/dim/色）
    Decoration.line                → 行属性（引用前缀"│ "、代码块底色、缩进）
    Decoration.replace(widget)     → 按 widget 类分流到 TUI 渲染器
                                     产出替代文本（圆点/复选框/网格表/占位框…）
  string-width 列宽计算 → 光标定位（Ink useCursor）
  输出 Ink 树（增量渲染，maxFps 30）
```

- **事务调度无 EditorView**：桌面版挂在 EditorView 上的 updateListener（dirty/字数/自动保存）在 TUI 里由 dispatch 包装层承担，语义一致。
- **滚动**：TUI 自管 viewport（首行偏移），等价 CM6 viewport；dispatch 后保证光标可见（scrollIntoView 语义自实现，打字机模式 = 光标恒垂直居中）。
- **IME**：终端的组合输入（preedit）由终端模拟器自绘，应用收到的是成串 UTF-8——桌面版 composition 冻结机制保留但触发面变小（粘贴大块文本时仍冻结防闪烁）。全坐标计算走 `string-width`，中文黄金样例文档纳入测试。

## 4. 终端的物理约束（如实公示）

| 约束 | 应对 |
|------|------|
| 字号不可变 | 标题层级用 **粗体 + 主题色阶 + 级距空行** 表达（# 一级=accent 色+粗+上下空行……），帮助文档说明 |
| 无悬浮 hover | 光标落在链接/图片/mermaid 上时**状态栏显示元信息**（URL/尺寸/节点数） |
| 无右键菜单 | `Menu` 键 / `F10` / `m` 唤出上下文菜单浮层（三段布局同桌面） |
| 无浮动表格工具栏 | 表格网格激活时**底部上下文栏**承载行列增删/对齐/删表 |
| Ctrl+C/S/Q/Z 被终端劫持 | raw 模式下可重绑：Ctrl+S 关闭 IXON 流控后可用；Ctrl+Q 退出改 `Ctrl+Q` 失效时用 `F10→退出`；**Ctrl+C 双击确认退出**（编辑器惯例） |
| Ctrl+I=Tab、Ctrl+M=Enter 等 | 键位表逐条标注；开 kitty keyboard protocol 的终端可消歧，退化模式走备用键 |
| 部分终端无 italic/strikethrough | 能力探测降级（粗体代替斜体、删除线降级无效果），永不报错 |

## 5. 装饰/Widget → 终端映射表

| 桌面语义 | TUI 呈现 | 说明 |
|----------|----------|------|
| `cm-strong` | ANSI bold | |
| `cm-em` | ANSI italic | 不支持则降级 bold |
| 删除线 | ANSI strikethrough | 不支持则加 `[~~]` 前后缀标记（可关） |
| 行内代码 | 背景色块 + 前景色 | |
| 标题行 | bold + 主题色阶 + 级距空行 | §4 字号约束 |
| `cm-mark-dim`（标记淡显） | ANSI dim | 与桌面"就近揭示"语义完全一致 |
| 引用块 | 行首 `│ ` 前缀 + 缩进 + dim | 桌面左边框的等价物 |
| 代码块 | lezer 高亮树 → ANSI 语法色 | 复用桌面 highlight 定义，主题 `--syntax-*` 映射调色板 |
| 列表圆点 | `•` `◦` `▪`（层级） | 始终渲染，同桌面 |
| 任务复选框 | `○` / `◉`，空格键切换 | Things 风圆框的 TUI 等价 |
| HR | `─` 全宽线 | |
| 表格 | **box-drawing 网格**（┌─┬─┐），单元格可编辑 | 光标进入→网格编辑模式（Tab/Enter/方向键导航，复用 tableOps 全部行列操作）；非激活=只读网格 |
| 行内/块级数学 | **Unicode 近似**（§6） | 近似失败→显源码（永不丢内容） |
| mermaid | 占位框：`┌ ▶ mermaid · 流程图 · 12 节点 ┐` + 状态栏摘要 | 光标进入显源码 |
| 图片 | 占位框：`┌ ▣ alt · 文件名 · 尺寸(能读则显) ┐` | `o` 键调系统看图器（xdg-open/open） |
| 链接 | 只显示文字；光标入内状态栏显 URL；`o` 打开 | |
| 专注模式 F8 | 非当前块 ANSI dim | focusModeField 直接复用 |
| 源码模式 Ctrl+/ | 标记全显 + 行号槽 + 当前行反色 | sourceModeField 直接复用 |
| 打字机模式 F9 | 光标恒垂直居中 | viewport 偏移计算 |

## 6. 数学 Unicode 近似规则（务实集）

纯函数 `latexToUnicode(src): string | null`，**null 即整块退源码**：

| LaTeX | 近似 | 备注 |
|-------|------|------|
| `x^2` `x^{n}` | `x²` `xⁿ` | Unicode 上标字符集不全（缺大写等），缺字符→null |
| `x_i` | `xᵢ` | 同上 |
| `\sqrt{x}` | `√(x)` | |
| `\frac{a}{b}` | `a/b` | 复杂分子分母（含结构）→ null |
| `\sum` `\int` `\infty` … | `∑` `∫` `∞` … | 符号直映表（含希腊字母全表） |
| `_{}^{}` 组合上下限 | `∑ᵢ₌₁ⁿ` | 逐字符映射失败即 null |
| 矩阵/环境/`\begin{*}` | —— | 直接 null（显源码） |

黄金样例集：桌面 samples/ 里全部公式样例跑一遍，输出对照快照测试。

## 7. 键位映射（D17：Typora 桌面键位映射）

原则：桌面用户零迁移成本；终端装不下的键找最近替代并在帮助面板（`F1`）公示。

| 功能 | 桌面（Win） | TUI | 备注 |
|------|-------------|-----|------|
| 粗体/斜体/删除线 | Ctrl+B / I / Alt+Shift+5 | 同左（删除线改 Ctrl+Shift+X 之外备选 `~~` 输入包裹） | Ctrl+I 终端上报为 Tab——**用 Ctrl+B 循环切换粗斜**或 Alt+I 备选（MT1 定稿） |
| 标题升降级 | Ctrl+= / - | Ctrl+= / -（不可靠终端备选 Alt+= / -） | |
| 标题 1-6 | Ctrl+1..6 | Alt+1..6 | Ctrl+数字在传统转义序列不可靠，直接用 Alt |
| 源码模式 | Ctrl+/ | Ctrl+/ | 多数终端上报 Ctrl+_，可识别 |
| 专注/打字机 | F8 / F9 | F8 / F9 | |
| 查找/替换 | Ctrl+F / H | Ctrl+F / Ctrl+H（备选 Alt+F/H） | |
| 保存 | Ctrl+S | Ctrl+S（关闭 IXON 后可用；备选 Alt+S） | 自动保存为主，保存键低频 |
| 列表 Tab 嵌套 | Tab / Shift+Tab | 同左 | 与桌面 ROADMAP P0 联动实现（同一 blockOps） |
| 选行/选词 | Ctrl+L / D | 同左 | |
| 任务列表 | Ctrl+Shift+X | Ctrl+Shift+X（不可靠终端 Alt+T） | |
| 表格 | Ctrl+T | Ctrl+T（备选 Alt+G） | 插入表格弹窗（行列选择器浮层） |
| 退出 | —— | Ctrl+Q（被劫持则 `:q` 命令 / F10 菜单） | 未保存改动弹确认 |
| 上下文菜单 | 右键 | Menu / F10 / `m` | |
| 打开链接/图片 | ⌘点击 | `o`（光标在链接/图片内时） | 状态栏同步显示目标 |

## 8. 主题与 i18n

- **主题**：7 套主题 → truecolor（24-bit）调色板对象（bg/fg/accent/side-bar/syntax-*）。主流终端（Windows Terminal / kitty / iTerm2 / WezTerm / gnome-terminal / WSL 全系）支持 truecolor；探测降级 256 色。TUI 运行于 alternateScreen 并自绘背景；提供 `--transparent` 跟随终端背景。
- **i18n**：复用 `i18next` 的 `t()`（不依赖 react-i18next），zh-CN 默认 + en-US，语言检测走 `LANG` 环境变量 + 设置覆盖。

## 9. 里程碑（MT 系列，与桌面 M 系列并行编号）

| 阶段 | 交付物 | 验收标准 |
|------|--------|----------|
| **MT0 脚手架 + 内核抽包** ✅（2026-09-11） | npm workspaces monorepo；`src/renderer/editor → packages/live-cm` 平移（零逻辑改动）；桌面端改引用；TUI 包骨架 + Ink 备用屏 hello world；**纯 Node 无头冒烟脚本**（buildLiveDecorations 在无 DOM 下跑通） | 桌面端全部用例照旧全绿（仅 import 路径变化，生产构建产物 hash 不变）；`node packages/tui/scripts/headless-smoke.mjs` 输出装饰区间 ✅ |
| **MT1 编辑面 MVP** ✅（2026-09-11） | EditorSurface：单栏渲染态（基础语法全表 §5 上半）+ 光标所在块显源码 + CJK 宽字符安全 + 自动保存 + 打开/编辑/保存单文件 | 中文 10k 行文档滚动/输入流畅（实测每键 14ms，见 §12 备忘）；samples/ 渲染经 CLI 预览验证；IME 组合输入待真机手验 |
| **MT2 高级语法** ✅（2026-09-11，**表格网格编辑模式已按方案 A 落地**） | 表格 box 网格（渲染 + 单元格导航编辑 + 底部上下文栏）+ 数学 Unicode 近似 + mermaid/图片占位框 + 代码块 ANSI 高亮 | samples/ 黄金样例经 CLI 渲染验证（含近似失败降级路径）；表格/数学/网格/布局共 42 用例 |
| **MT3 壳与效率** | 文件树/大纲/多标签（状态快照）/查找替换/视图三件套/上下文菜单 | 典型仓库（500+ 文件）树导航流畅；⌘F 等价物与桌面行为对齐清单 |
| **MT4 主题与收口** | 7 主题调色板 + i18n + 会话恢复 + 外部修改检测（三选一弹窗）+ 设置栏 | 七主题目测无破相；外部修改流程与桌面一致 |
| **MT5 分发** | npm 包 `yupmark-tui`（bin `yupmark`）+ README 双语 TUI 章节 + CI 加 TUI 构建矩阵（Linux/macOS/Windows） | `npx yupmark-tui` 三平台开箱即用；单文件二进制（bun/pkg）列 v2 |

依赖顺序 MT0→MT5；每个 MT 结束更新 PROGRESS.md。桌面线 ROADMAP（⌘F、列表 Tab 等）与 MT 系列共享内核改动（列表 Tab 嵌坐在 blockOps 上，两端同一次实现）。

## 10. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|------|------|------|
| RT1 | monorepo 平移引入桌面端回归 | 高 | 纯移动不改逻辑；import 路径外零 diff；134 用例 + typecheck 双 project 护航；MT0 单独提交可整体回滚 |
| RT2 | 终端键域碎片化（Ctrl 组合不可靠） | 高 | 优先 kitty keyboard protocol 探测；全部功能有 Alt 系备用键；F1 帮助面板实时显示当前终端能力 |
| RT3 | CJK 宽字符坐标/滚动半字 | 高 | 行装配层缓存列宽（string-width），滚动按整行对齐永不切半宽字符；中文黄金样例进 MT1 验收 |
| RT4 | Ink 长文档渲染性能 | 中 | 只装配 viewport 行；incrementalRendering；maxFps 默认 30；10k 行基准进 MT1 |
| RT5 | 数学近似覆盖度不足 | 中 | 失败即降级源码（总兜底原则：永不丢内容）；近似规则纯函数快照测试 |
| RT6 | IME 特定终端 preedit 显示异常 | 中 | 组合输入由终端承担；冻结机制保留；已知问题清单公示（帮助面板） |
| RT7 | 表格网格编辑的状态同步复杂度 | 中 | 网格编辑=对源码区间的事务包装（tableOps 已有全部原语），网格只是视图 |

## 11. 待定项（建议默认值，随时推翻——DESIGN §9 同款机制）

| # | 事项 | 默认建议 | 备选 |
|---|------|----------|------|
| U1 | monorepo 工具 | npm workspaces（零新依赖） | pnpm workspace |
| U2 | npm 包名 | `yupmark-tui`（bin 名 `yupmark`） | `@yupmark/tui` scope |
| U3 | 单文件二进制分发 | v2（bun compile） | pkg / 海海编译 |
| U4 | vim 键位层 | v2 可选层 | 不做 |
| U5 | 终端图形协议（kitty/sixel 图片渲染） | v2 | 不做 |
| U6 | 鼠标支持 | v2 只做点击定位 | v1 就加 |

## 12. MT0 落地备忘（2026-09-11，与设计的偏差记录）

1. **ink 6.8 稳定版无 `alternateScreen` 选项**（那是未发布 master 的特性）：cli.tsx 用标准转义码（`\x1b[?1049h/l` + 光标隐藏恢复）自实现，行为等价；ink 升级后可换回官方 API。
2. **`@shared/paths` 归属调整**：冒烟脚本（esbuild 打包内核）暴露 kernel 对 `@shared/paths` 的依赖会破坏独立消费——`src/shared/paths.ts` 整体移入 `packages/live-cm/src/paths.ts`，桌面 app/测试改从 `@yupmark/live-cm/paths` 导入。这是 MT0 唯一超出"纯移动"的改动（仅 import 行，函数零改动）。
3. **npm workspaces 不支持 `workspace:` 协议**（那是 pnpm/yarn 语法）：包间依赖写 `"*"`，npm 按名称+版本链接本地包。
4. **`tsconfig.tui.json` 的 lib 含 DOM**：仅为类型检查（内核 `inlineRender.ts` 的 DOM 类型引用）；运行时纯度由无头冒烟脚本与 `headless-node.test.ts` 双重守护。
5. TUI 的解析器配置集中在 `packages/tui/src/state.ts`（`docState`），与内核 `baseExtensions` 的语言配置对齐但不挂 view 专属扩展——MT1 起生长为事务调度宿主。
6. 验证基线更新：**21 文件 / 144 用例**（+6 个 TUI preview 单测）；桌面生产构建产物 hash 与迁移前一致（`index-uDV3AUFc.js`），佐证零逻辑改动。

## 12a. MT1 落地备忘（2026-09-11）

1. **内核新增 range 参数**（MT1 唯一内核改动，附加式）：`buildLiveDecorations(state, extraActive, range?)` 按语法节点粒度只装配与区间相交的装饰。动因：10k 行中文文档每键全量重算实测 90ms（RT4 风险兑现）→ 区间化后每键 14ms（ink maxFps 30 帧预算 33ms，宽裕）。等价性契约由 `tests/unit/live-range.test.ts` 护栏（区间内产出与全量一致 + partial ⊆ full，节点边界允许溢出）。**桌面端未启用 range**——其 94ms 全量口径与 ROADMAP P1-6（10k 性能回归）同源，可共享此参数做 view.viewport 级优化，列为双轨共享优化项。
2. **布局架构**：`editor/layout.ts` 的 cells 模型（隐藏字符剔除 → widget 终端替身 → mark 套样式 → CJK 贪心软换行 → 光标反色格）。同参 memo 缓存让滚动检查与渲染每键只装配一次。虚拟 EOL 空格 cell 承接行尾光标与换行边界输入。
3. **键位（D17 MT1 子集）**：可打印输入（多字符整串=粘贴）/Enter（列表续写：无序补 `- `、有序递增、任务补 `[ ] `、空项退出列表）/Backspace（行首并行的 CJK 码点删除）/Delete/Tab（两空格）/方向键（码点步进 + 上下行视觉列目标）/Home/End/PgUp/PgDn/Ctrl+Home/End/Ctrl+左右词跳/Shift+方向选择/Esc 收选区/^S 保存/^Q 退出。`q` 是普通字符（编辑器语义）。
4. **react-hooks 编译器级规则**（refs/immutability）倒逼的正确结构：滚动决策全部在输入/resize 事件期（firstLine 真 state + ref 镜像）；Autosaver 组件内构造、经 session.subscribe 订阅感知文档变化（不改 props 对象）；KeyContext 为 useMemo 对象 + ref getter。
5. **光标双轨**：反色格（视觉块状光标）+ ink useCursor 终端光标锚定（IME preedit 显示在光标处——中文输入生命线）。
6. **已知边界（MT2+ 处理）**：选区只有状态没有高亮渲染（查找替换 MT3 需要）；样式快捷键（Ctrl+B/I…）与视图三件套未接；Tab 列表层级升降未做（与桌面 ROADMAP P0 共享 blockOps 实现任务）。
7. 验证基线：**27 文件 / 197 用例**；`node packages/tui/scripts/perf.mjs` 为 10k 行性能探针（纳入 MT 验收工具）。

## 12b. MT2 落地备忘（2026-09-11）

1. **已落地**：行装配器升级为三态行内容（cells / block 多行预渲染 / absorbed 被块吞并）；表格 box 网格（`┌─┬─┐` + 表头粗体 + 对齐生效 + 超宽列截断）；行内/块级数学 Unicode 近似（白名单式 `latexToUnicode`，失败降级源码）；mermaid/图片信息占位框（`─ ▶ mermaid · 流程图 · 6 行 ─`）；HR 全宽线；代码块 token 着色（lezer `highlightTree` + tag→ANSI 色，仅 FencedCode 内生效）。块渲染按 widget 实例本趟缓存（长表格不重复渲染）。
2. **降级契约**（黄金样例实测）：`e=mc²`/`∑ᵢ₌₁ⁿ`/`√(π)/2` 近似成功；`^\infty`、`e^{i\pi}`（π 无上标形）、嵌套脚本 → 整块显源码——与 §6 一致。
3. **非 TTY 预览通道升级**：cli 的 CI 输出从 MT0 简化路径改为完整视口装配管线（与 TUI 同一渲染路径），黄金样例（samples/m1、m3）经此验证。
4. **表格网格编辑模式（方案 A，用户拍板）已落地**：`table-mode.ts` 的格 span 模型——文档光标即单元格内插入符（激活判定/所在格/格内偏移全部由 state 纯推导，打字直写源码、undo 逐字）；`table-keys.ts` 路由 Tab/⏎/方向键跨格导航（边界跳出表格）、Backspace/Delete 格内删字符（格首尾跨格）、粘贴换行压空格；结构性操作复用内核 tableOps（Alt+R 加行 · Alt+N 加列 · Alt+D 删行 · Alt+X 删列 · Alt+A 循环对齐 · Alt+T 删表），整表重写后重锚定格光标；渲染层把光标所在表格强制画成网格（激活格 cyan + 插入符反色，useCursor 坐标含网格偏移）；状态栏切表格上下文提示条。进入边界（表格起点）经 `resolveInner` 向后偏置探测修正。
5. 验证基线：**31 文件 / 239 用例**；每键 15.6ms@10k 行（含 tableAt 树解析，无回归）。

## 13. 与既有文档的关系

- DESIGN.md：新增 ADR D13–D17；§3 架构图补 packages 视角（本文件 §3 为准）。
- ROADMAP.md：改为**双轨**——TUI 线（MT0–MT5，当前活跃）+ 桌面线（原 P0/P1 顺延）。
- CONVENTIONS.md：MT0 已落地 monorepo 分层规则（live-cm 禁 React/Electron/Ink 依赖、tui 禁改内核渲染语义）。
