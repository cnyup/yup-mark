/**
 * TUI 应用总装（MT1）：编辑面 + 状态栏 + 输入接线 + 滚动跟随 + 自动保存。
 *
 * 渲染每帧：session 版本（useSyncExternalStore）→ layoutViewport（视口行装配）
 * → ink 渲染；光标 = 反色格（视觉）+ useCursor 终端光标（IME preedit 锚点）。
 * 滚动决策在输入/resize 事件里完成（不触碰渲染期 ref 规则）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useApp, useCursor, useInput, useStdout } from 'ink'
import type { EditorSession } from './session'
import { layoutViewport, type LayoutRow, type RenderSegment } from './layout'
import { handleKey, type KeyContext } from './keys'
import { adjustFirstLine, centerOnCursor } from './viewport'
import { Autosaver, type SaveState } from './doc'

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
      color={s.color}
    >
      {seg.text}
    </Text>
  )
}

function RowView({ row }: { row: LayoutRow }): React.JSX.Element {
  return (
    <Box height={1} overflow="hidden">
      <Text>
        {row.segments.map((seg, i) => (
          <SegmentView key={i} seg={seg} />
        ))}
      </Text>
    </Box>
  )
}

function StatusBar({
  path,
  saveState,
  lineNo,
  colNo,
  lineCount,
}: {
  path: string | null
  saveState: SaveState
  lineNo: number
  colNo: number
  lineCount: number
}): React.JSX.Element {
  const name = path === null ? 'untitled.md' : (path.replace(/\\/g, '/').split('/').pop() ?? 'untitled.md')
  const save = saveState === 'dirty' ? '·未保存' : saveState === 'saving' ? '·保存中' : ''
  return (
    <Box>
      <Text inverse>{` ${name}${save} `}</Text>
      <Text dimColor>{` Ln ${lineNo}, Col ${colNo} · ${lineCount} 行 · ^S 保存 · ^Q 退出 `}</Text>
    </Box>
  )
}

export function TuiApp({ session }: { session: EditorSession }): React.JSX.Element {
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion)
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { setCursorPosition } = useCursor()

  const [size, setSize] = useState(() => ({
    w: stdout.columns ?? 80,
    h: stdout.rows ?? 24,
  }))
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [firstLine, setFirstLine] = useState(1)

  // 自动保存器（构造时接线保存状态回调；经 session 订阅感知文档变化，不改 session）
  const [autosaver] = useState(
    () => new Autosaver(session.path, () => session.doc, { onState: (s) => setSaveState(s) }),
  )
  useEffect(() => session.subscribe(() => autosaver.changed()), [session, autosaver])

  const editHeight = Math.max(3, size.h - 1)

  // 事件期可变状态（渲染不触碰；getter 仅在 handleKey 事件里执行）
  const firstLineRef = useRef(1)
  const goalColumnRef = useRef<number | null>(null)
  const heightRef = useRef(Math.max(3, (stdout.rows ?? 24) - 1))
  const keyCtx = useMemo<KeyContext>(
    () => ({
      get height() {
        return heightRef.current
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
    [],
  )

  useEffect(() => {
    const onResize = (): void => {
      setSize({ w: stdout.columns ?? 80, h: stdout.rows ?? 24 })
      heightRef.current = Math.max(3, (stdout.rows ?? 24) - 1)
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  /** 滚动跟随（输入/resize 事件里调用）：行级修正 + 视觉越界居中兜底 */
  const applyScroll = useCallback((): void => {
    const st = session.state
    const cursorLine = st.doc.lineAt(st.selection.main.head).number
    const h = Math.max(3, (stdout.rows ?? 24) - 1)
    let fl = adjustFirstLine(firstLineRef.current, cursorLine, st.doc.lines, h)
    const w = stdout.columns ?? 80
    const lay = layoutViewport(st, { width: w, height: h, firstLine: fl, cursorPos: st.selection.main.head })
    if (lay.cursor !== null && (lay.cursor.y < 0 || lay.cursor.y >= h)) {
      fl = centerOnCursor(cursorLine, st.doc.lines, h)
    }
    if (fl !== firstLineRef.current) {
      firstLineRef.current = fl
      setFirstLine(fl)
    }
  }, [session, stdout])

  // resize 后重算滚动（size state 更新触发渲染，滚动在 effect 中修正）
  useEffect(() => {
    applyScroll()
  }, [size, applyScroll])

  const shutdown = useCallback((): void => {
    autosaver.flush()
    exit()
  }, [autosaver, exit])

  useInput((input: string, key) => {
    const action = handleKey(session, input, key, keyCtx)
    if (action === 'save') autosaver.save()
    if (action === 'exit') shutdown()
    applyScroll()
  })

  const state = session.state
  const doc = state.doc
  const main = state.selection.main
  const cursorLine = doc.lineAt(main.head)

  const layout = layoutViewport(state, {
    width: size.w,
    height: editHeight,
    firstLine,
    cursorPos: main.head,
  })

  // 终端光标锚定（IME preedit 显示在光标处）
  useEffect(() => {
    setCursorPosition(layout.cursor ?? undefined)
  }, [layout.cursor, setCursorPosition])

  const colNo = main.head - cursorLine.from + 1

  return (
    <Box flexDirection="column" height={size.h}>
      <Box flexDirection="column">
        {layout.rows.map((row, i) => (
          <RowView key={i} row={row} />
        ))}
      </Box>
      <StatusBar
        path={session.path}
        saveState={saveState}
        lineNo={cursorLine.number}
        colNo={colNo}
        lineCount={doc.lines}
      />
    </Box>
  )
}
