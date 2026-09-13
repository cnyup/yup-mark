# yupmark-tui

YupMark in your terminal — a Typora-style, live-rendering Markdown editor powered by the same engine as the [YupMark desktop app](https://github.com/cnyup/yup-mark).

## Quick start

```bash
npx yupmark-tui notes.md     # open/edit a single file (autosave)
npx yupmark-tui .            # directory mode (file tree + tabs)
yupmark                      # after global install: npm i -g yupmark-tui
```

Requires Node ≥ 20. Works in Windows Terminal, iTerm2, kitty, tmux, ssh sessions.

## Highlights

- **Typora-style editing** — the block under the cursor shows its Markdown source; everything else stays rendered. Same CodeMirror 6 engine and semantics as the desktop app.
- **Tables** — box-drawing grid with cell navigation and editing (`Tab` move, `Alt+R` add row, `Alt+N` add column).
- **Math** — LaTeX converted to Unicode approximations (`e^{iπ}`, `∫₀^∞`), fallback to source when not representable (never renders wrong output).
- **Mermaid as ASCII art** — flowcharts (TD/LR) and sequence diagrams are parsed and drawn with box-drawing characters; unsupported syntax falls back to a placeholder instead of a wrong diagram.
- **CJK-safe** — wide-character width tracking for cursor movement, soft wrap and table grids.
- **7 themes, bilingual UI** — `Alt+,` settings bar; Chinese/English.
- **Workspace** — tabs (`Alt+]/[`), outline (`Alt+O`), search & replace (`^F`/`^H`), file tree (`Alt+E`), external-change detection, session restore.

## Keys

| Key | Action |
| --- | --- |
| `^S` / `^Q` | save / quit |
| `^F` / `^H` | find / replace |
| `Alt+O` / `Alt+E` / `Alt+M` | outline / file tree / format menu |
| `Alt+S` / `Alt+F` / `Alt+P` | source mode / focus mode / typewriter mode |
| `Alt+,` | settings (theme · language) |

## License

[MIT](./dist/LICENSE)
