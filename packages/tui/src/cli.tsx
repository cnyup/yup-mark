/**
 * yupmark-tui CLI 入口（MT0 骨架）。
 *
 * TTY：备用屏幕缓冲（alternate screen，vim 同款）+ 隐藏光标，
 *      展示 @yupmark/live-cm 无头驱动的渲染态预览，q / Esc / Ctrl+C 退出。
 *      （ink 6.8 稳定版尚无 alternateScreen 选项，这里用标准转义码自实现，
 *        即未来 ink 内置特性的等价物；升级 ink 后可换回官方 API。）
 * 非 TTY（CI、管道）：打印去样式纯文本预览后正常退出——供脚本化验证。
 *
 * 编辑能力（光标/输入/滚动）自 MT1 起进入；本入口先钉死"内核 → 终端"链路。
 */
import React from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import { renderPreviewLines, previewToPlainText, type PreviewLine, type Span } from './preview'
import { docState } from './state'

const SAMPLE = [
  '# YupMark TUI',
  '',
  '内核 @yupmark/live-cm 在**无头模式**驱动终端渲染，',
  '样式 mark *常驻*，标记就近淡显——与桌面版同一套规则。',
  '',
  '## 已覆盖（MT0 静态预览）',
  '',
  '- 标题层级与颜色映射',
  '- `行内代码`、[链接文字](https://github.com/cnyup/yup-mark)',
  '- 删除线 ~~旧方案~~ 与组合样式',
  '',
  '> 引用块：竖线前缀 + 淡显，对应桌面左边框。',
  '',
  '```ts',
  'const ok = true // 代码块行样式（ANSI 高亮在 MT2）',
  '```',
  '',
  '### 光标所在块显源码（MT1）',
  '',
  '以下块 MT0 显示源码，MT1/MT2 逐步替换为终端形态：',
  '',
  '- [ ] 任务复选框 → ○/◉',
  '',
  '| 语法 | 桌面 | TUI |',
  '| --- | --- | --- |',
  '| 表格 | 网格 Widget | box 网格（MT2） |',
  '',
  '$e=mc^2$ → Unicode 近似（MT2）',
  '',
  '---',
  '',
  '（示例文档结束）',
].join('\n')

function buildSampleState(): ReturnType<typeof docState> {
  // 光标放在文末：示例中标题/引用等块处于"非活跃"态 → 标记隐藏，正是渲染态语义
  return docState(SAMPLE)
}

function SpanText({ span }: { span: Span }): React.JSX.Element {
  return (
    <Text
      bold={span.bold}
      italic={span.italic}
      dimColor={span.dim}
      underline={span.underline}
      strikethrough={span.strikethrough}
      color={span.color}
    >
      {span.text}
    </Text>
  )
}

function PreviewLineView({ line }: { line: PreviewLine }): React.JSX.Element {
  return (
    <Text>
      {line.spans.map((s, i) => (
        <SpanText key={i} span={s} />
      ))}
    </Text>
  )
}

function App({ lines }: { lines: PreviewLine[] }): React.JSX.Element {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">
        YupMark TUI · MT0 —— @yupmark/live-cm 无头驱动
      </Text>
      <Text> </Text>
      {lines.map((l, i) => (
        <PreviewLineView key={i} line={l} />
      ))}
      <Text> </Text>
      <Text dimColor>q / Esc / Ctrl+C 退出 · 编辑能力自 MT1 进入</Text>
    </Box>
  )
}

/** 进入备用屏幕 + 隐藏光标 */
function enterAltScreen(): void {
  process.stdout.write('\x1b[?1049h\x1b[?25l')
}

/** 退出备用屏幕 + 恢复光标（重复发送无害） */
function exitAltScreen(): void {
  process.stdout.write('\x1b[?25h\x1b[?1049l')
}

async function main(): Promise<void> {
  const state = buildSampleState()
  const lines = renderPreviewLines(state)

  if (!process.stdout.isTTY) {
    // 非交互环境：纯文本输出（供 CI 与脚本化验证，退出码 0）
    process.stdout.write(previewToPlainText(lines) + '\n')
    return
  }

  enterAltScreen()
  process.on('exit', exitAltScreen)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => process.exit(0))
  }

  const instance = render(<App lines={lines} />, {
    exitOnCtrlC: true,
    incrementalRendering: true,
  })
  await instance.waitUntilExit()
}

await main()
