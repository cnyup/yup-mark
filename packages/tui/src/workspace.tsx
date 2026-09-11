/**
 * 工作区总装（MT3a）：多标签 + 查找替换 + 大纲 + 视图三件套路由。
 *
 * 单一输入路由：浮层（搜索/大纲）打开时浮层独占；否则 TuiApp 编辑面接键，
 * 其 preInterceptor 先截获全局组合键（标签切换/视图三件套/浮层开关）。
 * 视图三件套直接 dispatch 内核 StateEffect（sourceModeField 等，无头可用）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Box, Text, useApp, useInput, useStdout, type Key } from 'ink'
import { EditorSession } from './editor/session'
import { TuiApp } from './editor/app'
import type { SearchHighlight } from './editor/layout'
import {
  findMatches,
  nearestMatch,
  replaceAll,
  replaceCurrent,
  stepMatch,
  initialSearch,
  type SearchState,
} from './editor/search'
import { extractOutline, activeOutlineItem } from '@yupmark/live-cm/outline'
import {
  setSourceMode,
  setFocusMode,
  setTypewriterMode,
  sourceModeField,
  focusModeField,
  typewriterModeField,
} from '@yupmark/live-cm/viewModes'
import type { SaveState } from './editor/doc'
import { textWidth } from './editor/measure'
import { flattenTree, rootLabel, scanTree, type FlatNode, type TreeNode } from './filetree'
import { MENU_ACTIONS } from './editor/context-menu'
import { loadFile } from './editor/doc'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WorkspaceTab {
  id: number
  path: string | null
  name: string
  session: EditorSession
}

let nextTabId = 1

export function makeTab(path: string | null, content: string): WorkspaceTab {
  const name = path === null ? 'untitled.md' : (path.replace(/\\/g, '/').split('/').pop() ?? 'untitled.md')
  return { id: nextTabId++, path, name, session: new EditorSession(path, content, 0) }
}

// ---------------------------------------------------------------------------
// 标签栏
// ---------------------------------------------------------------------------

function TabBar({
  tabs,
  activeId,
  dirtyIds,
  width,
}: {
  tabs: WorkspaceTab[]
  activeId: number
  dirtyIds: Set<number>
  width: number
}): React.JSX.Element {
  const HINT = ' Alt+]/[ 切换 · Alt+W 关闭'
  const budget = Math.max(6, width - textWidth(HINT) - 2)
  const per = Math.max(4, Math.floor(budget / tabs.length))
  return (
    <Box>
      {tabs.map((t, i) => {
        const active = t.id === activeId
        const full = `${i + 1}:${t.name}${dirtyIds.has(t.id) ? '·' : ''}`
        let label = full
        let acc = 0
        for (const ch of full) {
          const w = textWidth(ch)
          if (acc + w > per - 1) {
            label = `${full.slice(0, [...full].indexOf(ch))}…`
            break
          }
          acc += w
        }
        return active ? (
          <Text key={t.id} inverse>{` ${label} `}</Text>
        ) : (
          <Text key={t.id} dimColor>{` ${label} `}</Text>
        )
      })}
      <Text dimColor>{HINT}</Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// 搜索条
// ---------------------------------------------------------------------------

function SearchBar({ state, matchLabel }: { state: SearchState; matchLabel: string }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Box>
        <Text inverse>{state.replaceMode ? ' 查找 ' : ' 查找 ' }</Text>
        <Text color="green">{state.query}</Text>
        <Text inverse>{state.focusReplace ? ' ' : ''}</Text>
        <Text dimColor>{`  ${matchLabel} · ⏎ 下一 · ⇧⏎ 上一 · Esc 关闭`}</Text>
      </Box>
      {state.replaceMode ? (
        <Box>
          <Text inverse>{' 替换 '}</Text>
          <Text color="yellow">{state.replacement}</Text>
          <Text inverse>{state.focusReplace ? ' ' : ''}</Text>
          <Text dimColor>{' Alt+R 替换当前 · Alt+A 全部 · Tab 切换焦点'}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// 大纲面板（右列）
// ---------------------------------------------------------------------------

const OUTLINE_WIDTH = 30

function OutlinePanel({
  items,
  cursorIdx,
  width,
  height,
  activeIdx,
}: {
  items: { level: number; text: string; from: number }[]
  cursorIdx: number
  width: number
  height: number
  activeIdx: number
}): React.JSX.Element {
  const start = Math.max(0, Math.min(cursorIdx - Math.floor(height / 2), Math.max(0, items.length - height)))
  const visible = items.slice(start, start + height)
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" width={width} height={height}>
      {visible.map((it, i) => {
        const idx = start + i
        const text = `${'  '.repeat(Math.max(0, it.level - 1))}${it.text}`.slice(0, width - 4)
        const selected = idx === cursorIdx
        const cursorHere = idx === activeIdx
        return (
          <Box key={it.from + idx} height={1}>
            {selected ? (
              <Text inverse>{` ${text}`}</Text>
            ) : cursorHere ? (
              <Text color="cyan">{` ${text}`}</Text>
            ) : (
              <Text dimColor>{` ${text}`}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// 文件树面板
// ---------------------------------------------------------------------------

const TREE_WIDTH = 28

function FileTreePanel({
  flat,
  cursorIdx,
  expanded,
  rootName,
  width,
  height,
  newFile,
  activeRel,
}: {
  flat: FlatNode[]
  cursorIdx: number
  expanded: Set<string>
  rootName: string
  width: number
  height: number
  newFile: { active: boolean; name: string } | null
  activeRel: string | null
}): React.JSX.Element {
  const start = Math.max(0, Math.min(cursorIdx - Math.floor(height / 2), Math.max(0, flat.length - height)))
  const visible = flat.slice(start, start + height)
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" width={width} height={height}>
      <Box height={1}>
        <Text bold color="green">{` ${rootName}`}</Text>
      </Box>
      {visible.map((f, i) => {
        const idx = start + i
        const n = f.node
        const icon = n.type === 'dir' ? (expanded.has(n.rel) ? '▾' : '▸') : '·'
        const label = `${'  '.repeat(f.depth)}${icon} ${n.name}`.slice(0, width - 4)
        const selected = idx === cursorIdx && !(newFile?.active ?? false)
        const isActive = n.type === 'file' && n.rel === activeRel
        return (
          <Box key={n.rel} height={1}>
            {selected ? (
              <Text inverse>{` ${label}`}</Text>
            ) : isActive ? (
              <Text color="cyan">{` ${label}`}</Text>
            ) : n.type === 'dir' ? (
              <Text bold>{` ${label}`}</Text>
            ) : (
              <Text>{` ${label}`}</Text>
            )}
          </Box>
        )
      })}
      {newFile?.active ? (
        <Box height={1}>
          <Text color="green">{` + ${newFile.name}`}</Text>
          <Text inverse>{' '}</Text>
        </Box>
      ) : null}
      <Box height={1}>
        <Text dimColor>{' ⏎打开 · h/l 折叠 · n新建 · r刷新'}</Text>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// 上下文菜单
// ---------------------------------------------------------------------------

function ContextMenu(): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">
        {' 插入与格式 '}
      </Text>
      {MENU_ACTIONS.map((a) => (
        <Box key={a.key} height={1}>
          <Text color="yellow">{` ${a.key} `}</Text>
          <Text>{` ${a.label}`}</Text>
        </Box>
      ))}
      <Text dimColor>{' Esc 关闭'}</Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// 工作区
// ---------------------------------------------------------------------------

export function WorkspaceApp({
  initialTabs,
  rootDir,
}: {
  initialTabs: WorkspaceTab[]
  rootDir?: string | null
}): React.JSX.Element {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [size, setSize] = useState(() => ({ w: stdout.columns ?? 80, h: stdout.rows ?? 24 }))
  useEffect(() => {
    const onResize = (): void => setSize({ w: stdout.columns ?? 80, h: stdout.rows ?? 24 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  const [tabs, setTabs] = useState<WorkspaceTab[]>(initialTabs)
  const [activeId, setActiveId] = useState<number>(initialTabs[0]?.id ?? 0)
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState<SearchState>(initialSearch)
  const [outlineOpen, setOutlineOpen] = useState(false)
  // 文件树（MT3b）：根目录由 cli 传入；打开时扫描
  const [treeOpen, setTreeOpen] = useState(false)
  const [treeRoot, setTreeRoot] = useState<TreeNode | null>(rootDir !== null && rootDir !== undefined ? scanTree(rootDir) : null)
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set())
  const [treeCursor, setTreeCursor] = useState(0)
  const [newFile, setNewFile] = useState<{ active: boolean; name: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [outlineIdx, setOutlineIdx] = useState(0)

  const flushersRef = useRef(new Map<number, () => void>())

  const activeTab = (): WorkspaceTab | null => tabs.find((t) => t.id === activeId) ?? null
  const tab = activeTab()
  const activeVersion = tab?.session.version ?? 0
  useSyncExternalStore(
    tab?.session.subscribe ?? (() => () => {}),
    () => `${tab?.session.version ?? 0}:${tab?.id ?? 0}`,
    () => `${tab?.session.version ?? 0}:${tab?.id ?? 0}`,
  )

  const registerFlush = useCallback((flush: () => void) => {
    const active = activeTab()
    if (active !== null) flushersRef.current.set(active.id, flush)
    // registerFlush 在 TuiApp mount 时调用一次，绑定当时的 session
  }, [activeId, tabs]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTabSaveState = useCallback(
    (id: number) => (s: SaveState) => {
      setDirtyIds((prev) => {
        const next = new Set(prev)
        if (s === 'dirty' || s === 'saving') next.add(id)
        else next.delete(id)
        return next
      })
    },
    [],
  )

  // ---- 搜索 ----
  const openSearch = useCallback(
    (replaceMode: boolean): void => {
      const s = activeTab()
      if (s === null) return
      setSearch({ ...initialSearch, open: true, replaceMode, focusReplace: false })
    },
    [activeId, tabs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const currentMatch = search.matches[search.idx]
  const highlights: SearchHighlight[] = useMemo(
    () =>
      search.matches.map((m) => ({
        from: m.from,
        to: m.to,
        current: currentMatch !== undefined && m.from === currentMatch.from,
      })),
    [search.matches, currentMatch],
  )

  const handleSearchInput = useCallback(
    (input: string, key: Key): void => {
      const s = activeTab()
      if (s === null) return
      setSearch((prev) => {
        const next: SearchState = { ...prev }
        const field = prev.focusReplace && prev.replaceMode ? 'replacement' : 'query'
        if (key.escape) {
          return { ...initialSearch }
        }
        if (key.return) {
          if (prev.focusReplace && prev.replaceMode) {
            // 替换当前
            const r = replaceCurrent(s.session.doc, prev)
            if (r !== null) {
              s.session.dispatch({
                changes: { from: 0, to: s.session.doc.length, insert: r.doc },
                selection: { anchor: prev.matches[prev.idx]?.from ?? 0 },
              })
              next.matches = findMatches(r.doc, prev.query)
              next.idx = r.nextIdx
            }
            return next
          }
          if (prev.query !== '') {
            const matches = prev.matches.length > 0 ? prev.matches : findMatches(s.session.doc, prev.query)
            const idx = stepMatch(matches, prev.idx, key.shift ? -1 : 1)
            next.matches = matches
            next.idx = idx
            const m = matches[idx]
            if (m !== undefined) s.session.dispatch({ selection: { anchor: m.from, head: m.to } })
          }
          return next
        }
        if (key.tab && prev.replaceMode) {
          next.focusReplace = !prev.focusReplace
          return next
        }
        if (key.meta && (input === 'r' || input === 'a')) {
          if (input === 'a') {
            const r = replaceAll(s.session.doc, prev.query, prev.replacement)
            if (r !== null) {
              s.session.dispatch({
                changes: { from: 0, to: s.session.doc.length, insert: r.doc },
                selection: { anchor: prev.matches[prev.idx]?.from ?? 0 },
              })
              next.matches = findMatches(r.doc, prev.query)
              next.idx = next.matches.length > 0 ? 0 : -1
            }
            return next
          }
          const r = replaceCurrent(s.session.doc, prev)
          if (r !== null) {
            s.session.dispatch({
              changes: { from: 0, to: s.session.doc.length, insert: r.doc },
              selection: { anchor: prev.matches[prev.idx]?.from ?? 0 },
            })
            next.matches = findMatches(r.doc, prev.query)
            next.idx = r.nextIdx
          }
          return next
        }
        if (key.backspace) {
          next[field] = prev[field].slice(0, -1)
          next.matches = field === 'query' ? findMatches(s.session.doc, next.query) : prev.matches
          next.idx = next.matches.length > 0 ? nearestMatch(next.matches, s.session.state.selection.main.head) : -1
          return next
        }
        if (input.length > 0 && !key.ctrl && !key.meta) {
          next[field] = prev[field] + input.replace(/\r?\n/g, ' ')
          next.matches = field === 'query' ? findMatches(s.session.doc, next[field]) : prev.matches
          next.idx = next.matches.length > 0 ? nearestMatch(next.matches, s.session.state.selection.main.head) : -1
          const m = next.matches[next.idx ?? 0]
          if (field === 'query' && m !== undefined) s.session.dispatch({ selection: { anchor: m.from, head: m.to } })
          return next
        }
        return prev
      })
    },
    [activeId, tabs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ---- 大纲 ----
  const outlineItems = useMemo(() => {
    if (!outlineOpen || tab === null) return []
    try {
      return extractOutline(tab.session.state)
    } catch {
      return []
    }
    // activeVersion 触发编辑后重提取（编译器视为多余依赖，实际必要）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlineOpen, tab, activeVersion])

  const handleOutlineInput = useCallback(
    (input: string, key: Key): void => {
      const s = activeTab()
      if (s === null) return
      if (key.escape || input === 'o' || input === 'q') {
        setOutlineOpen(false)
        return
      }
      if (key.upArrow || input === 'k') {
        setOutlineIdx((i) => Math.max(0, i - 1))
        return
      }
      if (key.downArrow || input === 'j') {
        setOutlineIdx((i) => Math.min(Math.max(0, outlineItems.length - 1), i + 1))
        return
      }
      if (key.return) {
        const it = outlineItems[outlineIdx]
        if (it !== undefined) {
          s.session.dispatch({ selection: { anchor: it.from } })
          setOutlineOpen(false)
        }
      }
    },
    [outlineItems, outlineIdx, activeId, tabs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const switchTab = (dir: 1 | -1): void => {
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === activeId)
    const next = tabs[(idx + dir + tabs.length) % tabs.length]
    if (next !== undefined) setActiveId(next.id)
  }

  const closeTab = (id: number): void => {
    flushersRef.current.get(id)?.()
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        exit()
        return prev
      }
      if (id === activeId) {
        const idx = prev.findIndex((t) => t.id === id)
        const fallback = next[Math.min(idx, next.length - 1)] ?? next[0]
        if (fallback !== undefined) setActiveId(fallback.id)
      }
      return next
    })
    setDirtyIds((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }

  // ---- 全局组合键（编辑面 preInterceptor） ----
  // ---- 文件树（MT3b） ----
  const treeFlat = useMemo(
    () => (treeRoot === null ? [] : flattenTree(treeRoot, treeExpanded)),
    [treeRoot, treeExpanded],
  )

  const rescanTree = useCallback((): void => {
    if (rootDir !== null && rootDir !== undefined) setTreeRoot(scanTree(rootDir))
  }, [rootDir])

  /** 打开文件（去重：已在标签中则激活） */
  const openFileTab = useCallback(
    (rel: string): void => {
      if (rootDir === null || rootDir === undefined) return
      const abs = join(rootDir, rel)
      const existing = tabs.find((t) => t.path === abs)
      if (existing !== undefined) {
        setActiveId(existing.id)
        return
      }
      const content = (() => {
        try {
          return loadFile(abs)
        } catch {
          return null
        }
      })()
      if (content === null) return
      const t = makeTab(abs, content)
      setTabs((prev) => [...prev, t])
      setActiveId(t.id)
    },
    [rootDir, tabs],
  )

  const handleTreeInput = useCallback(
    (input: string, key: Key): void => {
      const flat = treeFlat
      const cur = flat[treeCursor]?.node
      if (newFile?.active) {
        if (key.escape) {
          setNewFile(null)
        } else if (key.return) {
          const rel = newFile.name.trim()
          if (rel !== '' && rootDir != null) {
            try {
              const abs = join(rootDir, rel.endsWith('.md') ? rel : `${rel}.md`)
              writeFileSync(abs, '', 'utf8')
              rescanTree()
              openFileTab(rel.endsWith('.md') ? rel : `${rel}.md`)
            } catch {
              // 创建失败静默（权限等）
            }
          }
          setNewFile(null)
        } else if (key.backspace) {
          setNewFile((p) => (p === null ? p : { ...p, name: p.name.slice(0, -1) }))
        } else if (input.length > 0 && !key.ctrl && !key.meta) {
          setNewFile((p) => (p === null ? p : { ...p, name: p.name + input }))
        }
        return
      }
      if (key.escape || input === 'q') {
        setTreeOpen(false)
        return
      }
      if (key.upArrow || input === 'k') {
        setTreeCursor((i) => Math.max(0, i - 1))
        return
      }
      if (key.downArrow || input === 'j') {
        setTreeCursor((i) => Math.min(Math.max(0, flat.length - 1), i + 1))
        return
      }
      if (input === 'n') {
        setNewFile({ active: true, name: '' })
        return
      }
      if (input === 'r') {
        rescanTree()
        return
      }
      if (cur === undefined) return
      if (key.return || input === 'l') {
        if (cur.type === 'file') {
          openFileTab(cur.rel)
          setTreeOpen(false)
        } else {
          setTreeExpanded((prev) => new Set([...prev, cur.rel]))
        }
        return
      }
      if (input === 'h' && cur.type === 'dir') {
        setTreeExpanded((prev) => {
          const next = new Set(prev)
          next.delete(cur.rel)
          return next
        })
      }
    },
    [treeFlat, treeCursor, newFile, rootDir, rescanTree, openFileTab],
  )

  // ---- 上下文菜单（MT3b） ----
  const handleMenuInput = useCallback(
    (input: string, key: Key): void => {
      if (key.escape) {
        setMenuOpen(false)
        return
      }
      const action = MENU_ACTIONS.find((a) => a.key === input)
      if (action !== undefined) {
        const s = activeTab()
        if (s !== null) action.run(s.session)
        setMenuOpen(false)
      }
    },
    [activeId, tabs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const overlayOpen = search.open || outlineOpen || menuOpen || (treeOpen && treeRoot !== null)
  useInput(
    (input: string, key: Key) => {
      if (search.open) handleSearchInput(input, key)
      else if (menuOpen) handleMenuInput(input, key)
      else if (outlineOpen) handleOutlineInput(input, key)
      else if (treeOpen && treeRoot !== null) handleTreeInput(input, key)
    },
    { isActive: overlayOpen },
  )

  const preInterceptor = useCallback(
    (input: string, key: Key): boolean => {
      const s = activeTab()
      if (s === null) return false
      if (key.ctrl && (input === 'f' || input === 'h')) {
        openSearch(input === 'h')
        return true
      }
      if (key.meta) {
        switch (input) {
          case 'o':
            setOutlineOpen((v) => {
              if (!v) {
                const items = extractOutline(s.session.state)
                const active = activeOutlineItem(items, s.session.state.selection.main.head)
                setOutlineIdx(active !== null ? items.indexOf(active) : 0)
              }
              return !v
            })
            return true
          case ']':
            switchTab(1)
            return true
          case '[':
            switchTab(-1)
            return true
          case 'e':
            // 文件树：仅工作区模式（cli 目录参数）
            if (rootDir !== null && rootDir !== undefined) {
              setTreeOpen((v) => {
                if (!v) rescanTree()
                return !v
              })
            }
            return true
          case 'm':
            setMenuOpen((v) => !v)
            return true
          case 'w': {
            closeTab(s.id)
            return true
          }
          case 's':
            s.session.dispatch({ effects: setSourceMode.of(!(s.session.state.field(sourceModeField, false) ?? false)) })
            return true
          case 'f':
            s.session.dispatch({ effects: setFocusMode.of(!(s.session.state.field(focusModeField, false) ?? false)) })
            return true
          case 'p':
            s.session.dispatch({
              effects: setTypewriterMode.of(!(s.session.state.field(typewriterModeField, false) ?? false)),
            })
            return true
          default:
            return false
        }
      }
      return false
    },
    [activeId, tabs], // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (tab === null) return <Text>无打开的标签</Text>

  const outlineBodyHeight = Math.max(3, size.h - 2)
  const activeOutline = activeOutlineItem(outlineItems, tab.session.state.selection.main.head)
  const outlineActiveIdx = activeOutline !== null ? outlineItems.indexOf(activeOutline) : -1

  const matchLabel =
    search.idx >= 0 && search.matches.length > 0 ? `${search.idx + 1}/${search.matches.length}` : '0/0'

  return (
    <Box flexDirection="column" height={size.h}>
      <TabBar tabs={tabs} activeId={activeId} dirtyIds={dirtyIds} width={size.w} />
      <Box flexDirection="row">
        {treeOpen && treeRoot !== null ? (
          <FileTreePanel
            flat={treeFlat}
            cursorIdx={treeCursor}
            expanded={treeExpanded}
            rootName={rootDir !== null && rootDir !== undefined ? rootLabel(rootDir) : ''}
            width={TREE_WIDTH}
            height={outlineBodyHeight}
            newFile={newFile}
            activeRel={
              tab.path !== null && rootDir !== null && rootDir !== undefined
                ? tab.path.slice(rootDir.length + 1).replace(/\\/g, '/')
                : null
            }
          />
        ) : null}
        {outlineOpen ? (
          <OutlinePanel
            items={outlineItems}
            cursorIdx={outlineIdx}
            width={OUTLINE_WIDTH}
            height={outlineBodyHeight}
            activeIdx={outlineActiveIdx}
          />
        ) : null}
        <Box flexDirection="column">
          <TuiApp
            key={tab.id}
            session={tab.session}
            totalHeight={outlineBodyHeight}
            inputActive={!overlayOpen}
            preInterceptor={preInterceptor}
            highlights={search.open ? highlights : undefined}
            bottomOverlay={
              search.open ? <SearchBar state={search} matchLabel={matchLabel} /> : undefined
            }
            bottomOverlayRows={search.open ? (search.replaceMode ? 2 : 1) : 0}
            onSaveState={onTabSaveState(tab.id)}
            registerFlush={registerFlush}
          />
        </Box>
        {menuOpen ? <ContextMenu /> : null}
      </Box>
    </Box>
  )
}
