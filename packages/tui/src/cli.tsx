/**
 * yupmark-tui CLI 入口（MT1：可编辑单文件闭环）。
 *
 * 用法：yupmark [file.md]（缺省打开内置示例文档，只演示不落盘）
 * TTY：备用屏幕 + 编辑面（光标/输入/CJK/自动保存）；q 是普通字符，^Q 退出、^S 保存。
 * 非 TTY（CI、管道）：打印渲染态纯文本预览后退出 0——脚本化验证通道。
 */
import { render } from 'ink'
import { docState } from './state'
import { layoutViewport } from './editor/layout'
import { EditorSession } from './editor/session'
import { loadFile } from './editor/doc'
import { TuiApp } from './editor/app'

const SAMPLE = [
  '# YupMark TUI',
  '',
  '内核 @yupmark/live-cm 在**无头模式**驱动终端渲染，',
  '样式 mark *常驻*，标记就近淡显——与桌面版同一套规则。',
  '',
  '## MT1：可编辑',
  '',
  '- 光标移动（方向键/Home/End/PgUp/PgDn，CJK 宽字符安全）',
  '- 输入与删除（含列表续写：上一行是 `- 项` 回车自动补 `- `）',
  '- `行内代码`、[链接文字](https://github.com/cnyup/yup-mark)、~~删除线~~',
  '- 自动保存（800ms 防抖落盘，^S 立即保存）',
  '',
  '> 引用块：竖线前缀 + 淡显。',
  '',
  '（^Q 退出 · ^S 保存 · 未命名示例不落盘）',
].join('\n')

/** 进入备用屏幕 + 隐藏光标 */
function enterAltScreen(): void {
  process.stdout.write('\x1b[?1049h\x1b[?25l')
}

/** 退出备用屏幕 + 恢复光标（重复发送无害） */
function exitAltScreen(): void {
  process.stdout.write('\x1b[?25h\x1b[?1049l')
}

async function main(): Promise<void> {
  const fileArg = process.argv[2]
  const path = fileArg !== undefined && fileArg.length > 0 ? fileArg : null
  const content = path === null ? SAMPLE : loadFile(path)

  if (!process.stdout.isTTY) {
    // 非交互环境：走完整视口装配管线（表格网格/数学近似/占位框/代码着色，
    // 与 TUI 同一渲染路径——黄金样例的脚本化验证通道），纯文本输出
    const state = docState(content)
    const lineCount = state.doc.lines
    const layout = layoutViewport(state, {
      width: Math.max(40, 72),
      height: lineCount + 4,
      firstLine: 1,
      cursorPos: Math.max(0, content.length - 1), // 光标贴文末但不在末块内激活特殊块
    })
    process.stdout.write(
      layout.rows
        .map((r) => r.segments.map((s) => s.text).join('').replace(/\s+$/, ''))
        .join('\n')
        .replace(/\n+$/, '') + '\n',
    )
    return
  }

  const session = new EditorSession(path, content, 0)

  enterAltScreen()
  process.on('exit', exitAltScreen)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => process.exit(0))
  }

  const instance = render(<TuiApp session={session} />, {
    exitOnCtrlC: true,
    incrementalRendering: true,
  })
  await instance.waitUntilExit()
}

await main()
