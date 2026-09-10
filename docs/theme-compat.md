# YupMark 主题兼容说明（v0.1 · M4）

## 我们的主题机制

主题 = 一组 CSS 变量（可选附带少量额外规则，如 newsprint 的衬线字体）。切换方式：
`<html data-theme="github-dark">`，全部内置主题随应用打包、零闪烁切换。

内置主题 7 套：`yup`（默认玫粉）、`github`、`notion`、`newsprint`（衬线正文）、`purple`、`github-dark`、`dracula`（后两套覆盖整套窗口配色，含语法高亮变量）；
`auto` 模式跟随系统亮暗（亮 = yup，暗 = github-dark）。

## 变量清单（主题必须/可选定义）

### 基础（Typora 主题同名变量子集）

| 变量 | 用途 |
|------|------|
| `--bg-color` | 编辑区背景 |
| `--text-color` | 正文文字 |
| `--primary-color` | 主强调色（选中态/界面强调；链接用 `--link-color`，复选框激活用 `--checkbox-active-color`） |
| `--side-bar-bg-color` | 侧栏/标签栏/状态栏背景 |
| `--meta-content-color` | 次要文字 |
| `--border-color` | 边框（标题底线/表格/分隔线之外的边框） |
| `--error-color` | 错误（公式渲染失败/保存失败等） |
| `--monospace` | 等宽字体栈 |

### 排版辅助

`--heading-color`（h1-h4 标题色）、`--link-color`（链接）、`--heading-muted-color`（h5/h6 弱化）、`--quote-border-color` / `--quote-bg-color` / `--quote-text-color`（引用块）、`--content-font`（正文字体栈，newsprint 换衬线）、
`--code-bg-color`（代码块底色）、`--inline-code-bg-color` / `--inline-code-text-color`（行内代码底色/文字色）、`--table-header-bg`（表头底色）、`--hr-color`（水平线）、
`--checkbox-border-color` / `--checkbox-check-color`（任务复选框）

### 源码态语法高亮（编辑态可见的源码配色）

`--syntax-keyword` `--syntax-string` `--syntax-number` `--syntax-comment` `--syntax-variable`
`--syntax-type` `--syntax-function` `--syntax-tag` `--syntax-attr` `--syntax-mark`（Markdown 符号/标点）`--syntax-link`

## 与 Typora 主题的兼容边界

**兼容**：变量命名采用 Typora 主题的核心子集约定（上表"基础"组与 Typora 用户主题同名同义），
Typora 主题中的变量值可以直接搬到 YupMark 主题文件使用。

**不兼容（明确不支持，v0.1 边界）**：

- Typora 主题的**选择器规则**（`#write h1`、`.md-diagram-panel` 等）——我们的渲染 DOM 是
  CodeMirror 行结构而非标准 HTML 标签树（`.cm-h-line.cm-h1` 等），选择器层面不互通
- 主题内的 `@font-face` / `webfont` 引用（后续版本放开）
- `user.css` 自动加载目录

**给主题作者**（v0.1 无独立主题文件目录，v2 计划开放）：以 `src/renderer/assets/base.css` 末尾任一
`[data-theme='…']` 变量块为模板复制修改变量值；额外规则按 `[data-theme='你的主题名']` 前缀书写。

## 已知限制

- mermaid 图表配色跟随亮暗（default/dark），切换主题后已渲染的图表在下次编辑/重载时才更新配色
- KaTeX 字体固定黑色系，暗色主题下公式为浅色文字（继承 `--text-color`），对比度正常
