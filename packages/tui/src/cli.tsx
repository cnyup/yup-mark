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
import { loadFile } from './editor/doc'
import { makeTab, WorkspaceApp } from './workspace'
import { isDirectory } from './filetree'
import { loadState } from './persist'
import { setTheme } from './theme'
import { setLang, detectLang } from './i18n'
import { existsSync, writeFileSync, appendFileSync } from 'node:fs'

const SAMPLE = [
  '# YupMark TUI',
  '',
  '内核 @yupmark/live-cm 在**无头模式**驱动终端渲染，',
  '样式 mark 常驻，Markdown 标记保持隐藏——与桌面版同一套规则。',
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

/**
 * 调试设施（YUPMARK_DEBUG_OUT=<文件> 时启用）：经原型链代理 stdout 记录全部
 * VT 载荷到文件（ESC 以 \u001b 转义）。不替换 process.stdout.write——把代理
 * 流传给 ink render，退出清理路径不受影响。终端渲染问题（漂移/闪烁）取证用。
 */
function makeCapturingStdout(target: string): NodeJS.WriteStream {
  writeFileSync(target, '')
  const real = process.stdout
  const proxy = Object.create(real) as NodeJS.WriteStream
  proxy.write = ((chunk: string | Uint8Array, cb?: (err?: Error | null) => void): boolean => {
    try {
      appendFileSync(target, `[${Date.now()}] ${JSON.stringify(String(chunk))}\n`)
    } catch {
      /* 调试通道失败不影响运行 */
    }
    return cb === undefined ? real.write(chunk) : real.write(chunk, cb)
  }) as NodeJS.WriteStream['write']
  return proxy
}

/** 退出备用屏幕 + 恢复光标（重复发送无害） */
function exitAltScreen(): void {
  process.stdout.write('\x1b[?25h\x1b[?1049l')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a.length > 0)
  // 参数分流：目录 → 工作区模式（文件树 + 空白标签）；文件 → 多标签
  let rootDir: string | null = null
  const fileArgs: string[] = []
  for (const a of args) {
    if (isDirectory(a) && rootDir === null) rootDir = a
    else fileArgs.push(a)
  }
  // 主题/语言恢复（设置持久化，MT4）
  const saved = loadState()
  if (saved !== null) {
    setTheme(saved.theme)
    setLang(saved.lang)
  } else {
    setLang(detectLang())
  }

  const firstFile = fileArgs[0]
  let content: string
  if (firstFile !== undefined) content = loadFile(firstFile)
  else if (saved !== null && fileArgs.length === 0 && saved.openTabs.length > 0) content = loadFile(saved.openTabs[0] ?? '')
  else content = SAMPLE

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

  enterAltScreen()
  process.on('exit', exitAltScreen)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => process.exit(0))
  }

  // 标签来源优先级：显式文件参数 > 上次会话 > 空白示例
  let tabs: ReturnType<typeof makeTab>[]
  if (fileArgs.length > 0) {
    tabs = fileArgs.map((p) => makeTab(p, loadFile(p)))
  } else if (saved !== null && saved.openTabs.length > 0) {
    const restored = saved.openTabs.filter((p) => existsSync(p))
    tabs = restored.length > 0 ? restored.map((p) => makeTab(p, loadFile(p))) : [makeTab(null, content)]
  } else {
    tabs = [makeTab(null, content)]
  }
  const effectiveRoot = rootDir ?? saved?.rootDir ?? null
  const debugOut = process.env.YUPMARK_DEBUG_OUT
  const renderOptions = {
    exitOnCtrlC: true,
    incrementalRendering: true,
    ...(debugOut === undefined ? {} : { stdout: makeCapturingStdout(debugOut) }),
  }
  const instance = render(<WorkspaceApp initialTabs={tabs} rootDir={effectiveRoot} />, renderOptions)
  await instance.waitUntilExit()
}

await main()
