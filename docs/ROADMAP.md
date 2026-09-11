# YupMark 后续开发目标

> **双轨制**（2026-09-11 起）：TUI 线为当前活跃轨道，桌面线顺延。两轨共享内核（packages/live-cm 抽包后）。
> **每项动工前先与用户确认方案**（协作铁律见 [CONVENTIONS.md §0](./CONVENTIONS.md)）。
> 进度快照见 [PROGRESS.md](./PROGRESS.md)。

## TUI 线（当前活跃）

完整设计见 [TUI.md](./TUI.md)（ADR D13–D17 已敲定，含架构/装饰映射表/键位表/里程碑/风险）。

| 阶段 | 内容 | 状态 |
|---|---|---|
| MT0 | monorepo 抽包 + 纯 Node 无头冒烟 + TUI 骨架（Ink 备用屏预览） | ✅ 2026-09-11（偏差记录见 TUI.md §12） |
| MT1 | EditorSurface 编辑面 MVP（基础语法渲染态 + CJK 光标 + 自动保存） | ✅ 2026-09-11（每键 14ms@10k 行；备忘见 TUI.md §12a） |
| MT2 | 高级语法（表格网格渲染+**单元格编辑**/数学 Unicode 近似/占位框/代码 ANSI 高亮） | ✅ 2026-09-11（网格编辑按方案 A 落地，见 TUI.md §12b） |
| MT3 | 壳与效率（文件树/大纲/多标签/查找替换/视图三件套/上下文菜单） | 🔶 MT3a ✅ 2026-09-11（多标签/查找替换/大纲/视图三件套）；MT3b（文件树/上下文菜单）待续 |
| MT4 | 主题调色板 + i18n + 会话 + 外部修改检测 | ⬜ |
| MT5 | npm 分发（yupmark-tui）+ CI 三平台矩阵 | ⬜ |

## 桌面线（顺延）

### P0（TUI 线间隙或用户指示时做）

### 1. Git 基线 ⚠️ 最高优先
项目至今未 `git init`，零版本控制，误删/改坏无法回滚。
步骤：`git init` + `.gitignore`（node_modules/dist/dev 日志）+ 首次提交。
之后每完成一个功能单元提交一次。这是 M5 开源的前置条件。

### 2. 查找与替换（⌘F / ⌥⌘F 替换）
编辑器最后一块明显缺席的基础能力（Typora 官方表有，我们跳过）。
方案：`@codemirror/search` 的 `search()` 扩展 + `openSearchPanel`，挂到 tableAndFormatKeys
（`Mod-f` / mac 替换 `Mod-Alt-f`、Win `Ctrl+h`）；默认面板样式按 Typora 调整（CSS 覆盖 `.cm-panels`）。
注意：搜索高亮与 liveField 装饰共存无冲突（不同 facet），但需验证渲染态块内命中定位。

### 3. 列表 Tab 嵌套
现状：列表内 Tab/Shift-Tab 是 CM6 默认的空格缩进；Typora 语义是列表项升降层级
（`- a` 行内 Tab → 变子项缩进 2 空格 + 父子关系，有序列表自动重编号）。
方案：在 engine.ts 拦截列表行内 Tab（判定：光标行 `lineKind ∈ {ul,ol,task}`），对行首增删 2 空格；
降级超过 0 取消层级。注意任务列表与有序列表编号续算（复用 blockOps）。

### P1（体验补齐）

1. **表格在文档最顶部**时上方无插入新段落入口 → 实现"块前空段落"机制（首块 from 前插 `\n` 或在首个块前渲染可点击空行）
2. **下划线 ⌘U**：Typora 用 `<u>text</u>`；需先给 inlineRender.ts 与 rules.ts 增加行内 HTML 支持（范围可控：只认 `<u>` 标签对）
3. **冲突弹窗"对比"视图**：外部修改三选一弹窗增加左右对比（本地 vs 磁盘，只读渲染）
4. **Copy as Markdown ⌘⇧C**：当前选择复制为纯 markdown（渲染态下默认复制即为源码，此项主要是语义对齐，评估后可能直接关闭）
5. **Windows 任务列表快捷键核实**：`Ctrl+Shift+X` 来自第三方资料，如有 Windows 版 Typora 请用户看一眼菜单
6. **性能回归**：10k 行文档滚动/输入帧率（DESIGN.md M1 验收项，尚未系统测过）

## P2 = M5 开源发布（功能冻结后）

`npm run dist:*` 脚本已就绪（electron-builder），需要：

1. 应用图标（现为占位，DESIGN.md T6）
2. electron-updater + GitHub Releases（DESIGN.md D12，含 macOS 公证 notarization）
3. README 中英双语 + CONTRIBUTING + 架构文档链接（DESIGN.md 已有底稿）
4. LICENSE 文件落盘（MIT，ADR D11 已定）
5. CI（lint/test/build 矩阵）
6. v0.1.0 tag & 发布

## v2 方向（设计期，不排期）

- TUI：vim 键位可选层、终端图形协议真渲染（kitty/sixel）、鼠标点击定位、单文件二进制分发（见 TUI.md §11 待定项）
- 可视化表格编辑增强（DESIGN.md §4.2.4 列为 v2：列宽拖拽、跨行单元格）
- 导出 PDF/Word/ePub（Pandoc，ADR D4 后置大版本）
- 图床上传（PicGo 集成）
- Typora 社区主题直接导入（theme-compat.md 的完整兼容层）
- 打字机/专注模式进可视化设置面板开关（现为快捷键+徽章）

## 每项的完成定义（DoD）

- 纯函数有单测；视图行为有 jsdom 冒烟或用户手验清单；TUI 行为另有终端手验清单（Windows Terminal + WSL Ubuntu）
- `typecheck && lint && test` 全绿（基线 138 用例只增不减，2026-09-11 起含 4 个纯 Node 无头用例）
- 快捷键类改动：双平台对照官方表核对 + 检查 menu.ts 加速键冲突
- 主题/配色类改动：走 CSS 变量，六套主题下目测无破相
- 完成后更新 PROGRESS.md（清单 + 基线数字）
