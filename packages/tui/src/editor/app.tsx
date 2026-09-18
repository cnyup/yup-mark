/**
 * 编辑器应用组件（MT1–MT3）：编辑面 + 状态栏 + 输入接线 + 滚动跟随 + 自动保存。
 *
 * MT3 起由 workspace.tsx 编排：本组件只负责"当前 session 的编辑面"，
 * 通过 props 接入全局键拦截器、搜索高亮、底部浮层（搜索条）与输入激活开关。
 *
 * 渲染每帧：session 版本（useSyncExternalStore）→ layoutViewport（视口行装配）
 * → ink 渲染；光标由 useCursor 的真实终端插入符定位。
 * 滚动决策在输入/resize 事件里完成（不触碰渲染期 ref 规则）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useApp, useCursor, useInput, useStdout, type Key } from 'ink'
import type { EditorSession } from './session'
import { layoutViewport, type LayoutRow, type RenderSegment, type SearchHighlight } from './layout'
import { handleKey, type KeyContext } from './keys'
import { adjustFirstLine, centerOnCursor, typewriterFirstLine } from './viewport'
import { tableAt } from './table-mode'
import { Autosaver, type SaveState } from './doc'
import { sourceModeField, focusModeField, typewriterModeField } from '@yupmark/live-cm/viewModes'
import { resolveColor, resolveBg } from '../theme'
import { t } from '../i18n'

export interface TuiAppProps {
  session: EditorSession
  /** 可用总高度（含状态栏；workspace 扣除标签行与浮层后传入） */
  totalHeight: number
  /** 输入激活（浮层打开时编辑面不接键） */
  inputActive?: boolean
  /** 全局键拦截器：返回 true 表示 workspace 已消费，编辑面不再处理 */
  preInterceptor?: (input: string, key: Key) => boolean
  /** 搜索命中高亮 */
  highlights?: SearchHighlight[]
  /** 底部浮层（搜索条等），渲染在编辑面与状态栏之间 */
  bottomOverlay?: React.ReactNode
  /** 浮层占用的行数（从编辑面高度中扣除） */
  bottomOverlayRows?: number
  /** 保存状态上抛（workspace 的标签 dirty 点） */
  onSaveState?: (state: SaveState) => void
  /** 关闭前 flush（切标签/关标签时） */
  registerFlush?: (flush: () => void) => void
  /** 已保存基线内容上抛（外部修改检测用，MT4） */
  registerBaseline?: (fn: () => string) => void
}

function SegmentView({ seg }: { seg: RenderSegment }): React.JSX.Element {
  const s = seg.style
  return (
    <Text
      bold={s.bold}
      italic={s.italic}
      dimColor={s.dim}
      underline={s.underline}
      strikethrough={s.strikethrough}
      inverse={s.inverse}
      color={resolveColor(s.color)}
    >
      {seg.text}
    </Text>
  )
}

function RowView({ row, gutterWidth }: { row: LayoutRow; gutterWidth: number }): React.JSX.Element {
  const num = row.lineNo === undefined ? '' : `${row.lineNo}`.padStart(gutterWidth - 1) + ' '
  return (
    <Box height={1} overflow="hidden">
      {num !== '' ? <Text dimColor>{num}</Text> : null}
      <Text>
        {row.segments.map((seg, i) => (
          <SegmentView key={i} seg={seg} />
        ))}
      </Text>
    </Box>
  )
}

/** 暗色主题铺编辑区背景（亮色透明跟随终端） */
function EditArea({ children, width }: { children: React.ReactNode; width: number }): React.JSX.Element {
  const bg = resolveBg()
  return (
    <Box flexDirection="column" width={width} backgroundColor={bg}>
      {children}
    </Box>
  )
}

function StatusBar({
  path,
  saveState,
  lineNo,
  colNo,
  lineCount,
  inTable,
  modes,
  width,
}: {
  path: string | null
  saveState: SaveState
  lineNo: number
  colNo: number
  lineCount: number
  inTable: boolean
  modes: string[]
  width: number
}): React.JSX.Element {
  const name =
    path === null ? t('editor.untitled') : (path.replace(/\\/g, '/').split('/').pop() ?? t('editor.untitled'))
  const save = saveState === 'dirty' ? t('status.dirty') : saveState === 'saving' ? t('status.saving') : ''
  const badges = modes.length > 0 ? ` [${modes.join(' ')}]` : ''
  const hints = inTable ? t('status.tableHints') : t('status.hints')
  const left = ` ${name}${save} `
  const leftW = Array.from(left).reduce((a, ch) => a + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
  const info = ` ${t('status.line')} ${lineNo}, ${t('status.col')} ${colNo} · ${lineCount} ${t('status.lines')}${badges} ·${hints} `
  // 终端宽度内截断（CJK 宽字符不切半），保住文件名优先
  let acc = leftW
  let clipped = ''
  for (const ch of info) {
    const w = ch.charCodeAt(0) > 0xff ? 2 : 1
    if (acc + w > width) break
    acc += w
    clipped += ch
  }
  return (
    <Box>
      <Text inverse>{left}</Text>
      <Text dimColor>{clipped}</Text>
    </Box>
  )
}

export function TuiApp(props: TuiAppProps): React.JSX.Element {
  const {
    session,
    totalHeight,
    inputActive = true,
    preInterceptor,
    highlights,
    bottomOverlay,
    bottomOverlayRows = 0,
    onSaveState,
    registerFlush,
    registerBaseline,
  } = props
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion)
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()

  const [width, setWidth] = useState(() => stdout.columns ?? 80)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [firstLine, setFirstLine] = useState(1)

  const setSaveStateBoth = useCallback(
    (s: SaveState): void => {
      setSaveState(s)
      onSaveState?.(s)
    },
    [onSaveState],
  )

  // 自动保存器（构造时接线保存状态回调；subscribeDoc 只感知文档变化——纯选区移动不判脏不落盘）
  const [autosaver] = useState(
    () => new Autosaver(session.path, () => session.doc, { onState: (s) => setSaveStateBoth(s) }),
  )
  useEffect(() => session.subscribeDoc(() => autosaver.changed()), [session, autosaver])
  useEffect(() => {
    registerFlush?.(() => autosaver.flush())
    registerBaseline?.(() => autosaver.savedContent())
  }, [registerFlush, registerBaseline, autosaver])

  const editHeight = Math.max(3, totalHeight - 1 - bottomOverlayRows)

  // 事件期可变状态（渲染不触碰；getter 仅在 handleKey 事件里执行）
  const firstLineRef = useRef(1)
  const goalColumnRef = useRef<number | null>(null)
  const keyCtx = useMemo<KeyContext>(
    () => ({
      get height() {
        return Math.max(3, totalHeight - 1 - bottomOverlayRows)
      },
      get goalColumn() {
        return goalColumnRef.current
      },
      set goalColumn(v: number | null) {
        goalColumnRef.current = v
      },
      setGoalColumn(v: number | null) {
        goalColumnRef.current = v
      },
    }),
    [totalHeight, bottomOverlayRows],
  )

  useEffect(() => {
    const onResize = (): void => setWidth(stdout.columns ?? 80)
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  /** 滚动跟随（输入/resize 事件里调用）：打字机居中 或 行级修正+视觉越界兜底 */
  const applyScroll = useCallback((): void => {
    const st = session.state
    const cursorLineNo = st.doc.lineAt(st.selection.main.head).number
    const h = Math.max(3, totalHeight - 1 - bottomOverlayRows)
    const w = stdout.columns ?? 80
    if (st.field(typewriterModeField, false) === true) {
      const fl = typewriterFirstLine(cursorLineNo, st.doc.lines, h)
      if (fl !== firstLineRef.current) {
        firstLineRef.current = fl
        setFirstLine(fl)
      }
      return
    }
    let fl = adjustFirstLine(firstLineRef.current, cursorLineNo, st.doc.lines, h)
    const lay = layoutViewport(st, { width: w, height: h, firstLine: fl, cursorPos: st.selection.main.head })
    if (lay.cursor !== null && (lay.cursor.y < 0 || lay.cursor.y >= h)) {
      fl = centerOnCursor(cursorLineNo, st.doc.lines, h)
    }
    if (fl !== firstLineRef.current) {
      firstLineRef.current = fl
      setFirstLine(fl)
    }
  }, [session, stdout, totalHeight, bottomOverlayRows])

  useEffect(() => {
    applyScroll()
  }, [totalHeight, width, applyScroll])

  const shutdown = useCallback((): void => {
    autosaver.flush()
    exit()
  }, [autosaver, exit])

  useInput(
    (input: string, key: Key) => {
      if (preInterceptor !== undefined && preInterceptor(input, key)) return
      const action = handleKey(session, input, key, keyCtx)
      if (action === 'save') autosaver.save()
      if (action === 'exit') shutdown()
      applyScroll()
    },
    { isActive: inputActive },
  )

  const state = session.state
  const doc = state.doc
  const main = state.selection.main
  const cursorLine = doc.lineAt(main.head)
  // 表格网格编辑模式指示（底部上下文栏）
  const inTable = useMemo(() => {
    try {
      return tableAt(state, main.head) !== null
    } catch {
      return false
    }
  }, [state, main.head])

  const layout = layoutViewport(state, {
    width,
    height: editHeight,
    firstLine,
    cursorPos: main.head,
    highlights,
  })

  // 终端光标锚定（IME preedit 显示在光标处）；浮层打开时交还给终端默认位置
  useEffect(() => {
    if (inputActive) setCursorPosition(layout.cursor ?? undefined)
  }, [layout.cursor, setCursorPosition, inputActive])

  const colNo = main.head - cursorLine.from + 1
  const modes: string[] = []
  if (state.field(sourceModeField, false) === true) modes.push('源码')
  if (state.field(focusModeField, false) === true) modes.push('专注')
  if (state.field(typewriterModeField, false) === true) modes.push('打字机')
  const gutterWidth = layout.rows.some((r) => r.lineNo !== undefined) ? `${doc.lines}`.length + 1 : 0

  return (
    <Box flexDirection="column" height={totalHeight}>
      <EditArea width={width}>
        {layout.rows.map((row, i) => (
          <RowView key={i} row={row} gutterWidth={gutterWidth} />
        ))}
      </EditArea>
      {bottomOverlay}
      <StatusBar
        path={session.path}
        saveState={saveState}
        lineNo={cursorLine.number}
        colNo={colNo}
        lineCount={doc.lines}
        inTable={inTable}
        width={width}
        modes={modes}
      />
    </Box>
  )
}
