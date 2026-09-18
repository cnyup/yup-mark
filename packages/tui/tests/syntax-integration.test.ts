import { describe, expect, it } from 'vitest'
import type { EditorState } from '@codemirror/state'
import type { Key } from 'ink'
import { setSourceMode } from '@yupmark/live-cm/viewModes'
import { docState } from '../src/state'
import { EditorSession } from '../src/editor/session'
import { handleKey, type KeyContext } from '../src/editor/keys'
import { layoutViewport, type LayoutRow, type RenderSegment } from '../src/editor/layout'

function makeKey(over: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...over,
  }
}

function makeCtx(height = 20): KeyContext {
  let goal: number | null = null
  return {
    height,
    get goalColumn() {
      return goal
    },
    set goalColumn(value: number | null) {
      goal = value
    },
    setGoalColumn(value: number | null) {
      goal = value
    },
  }
}

function layout(state: EditorState, cursorPos = state.selection.main.head, width = 72, height = 24) {
  return layoutViewport(state, { width, height, firstLine: 1, cursorPos })
}

function rowText(row: LayoutRow): string {
  return row.segments.map((segment) => segment.text).join('')
}

function allText(rows: LayoutRow[]): string {
  return rows.map(rowText).join('\n')
}

function segments(rows: LayoutRow[]): RenderSegment[] {
  return rows.flatMap((row) => row.segments)
}

function styledTextContains(rows: LayoutRow[], text: string, style: Partial<RenderSegment['style']>): boolean {
  return segments(rows)
    .filter((segment) => Object.entries(style).every(([key, value]) => segment.style[key as keyof RenderSegment['style']] === value))
    .map((segment) => segment.text)
    .join('')
    .includes(text)
}

describe('TUI syntax integration', () => {
  it('keeps bold and italic rendered while navigation skips their hidden markers', () => {
    const doc = 'start **bold** *italic* end'
    const state = docState(doc, 0)
    const initial = layout(state)

    expect(allText(initial.rows)).toContain('start bold italic end')
    expect(allText(initial.rows)).not.toContain('**')
    expect(allText(initial.rows)).not.toContain('*italic*')
    expect(styledTextContains(initial.rows, 'bold', { bold: true })).toBe(true)
    expect(styledTextContains(initial.rows, 'italic', { italic: true })).toBe(true)
    expect(styledTextContains(initial.rows, 'start', { bold: true })).toBe(false)

    const session = new EditorSession(null, doc, doc.indexOf('**'))
    const ctx = makeCtx()
    handleKey(session, '', makeKey({ rightArrow: true }), ctx)
    expect(session.state.selection.main.head).toBe(doc.indexOf('bold'))
    handleKey(session, '', makeKey({ rightArrow: true }), ctx)
    expect(session.state.selection.main.head).toBe(doc.indexOf('bold') + 1)

    const italicStart = doc.indexOf('*italic*')
    session.dispatch({ selection: { anchor: italicStart } })
    handleKey(session, '', makeKey({ rightArrow: true }), ctx)
    expect(session.state.selection.main.head).toBe(doc.indexOf('italic'))

    handleKey(session, 'X', makeKey(), ctx)
    const afterEdit = layout(session.state)
    expect(session.doc).toContain('*Xitalic*')
    expect(allText(afterEdit.rows)).toContain('Xitalic')
    expect(styledTextContains(afterEdit.rows, 'Xitalic', { italic: true })).toBe(true)
    expect(afterEdit.cursor).not.toBeNull()
  })

  it('renders consecutive quotes with inline styles and keeps them after editing', () => {
    const doc = '> **bold** and *italic*\n> plain quote\nnormal'
    const session = new EditorSession(null, doc, doc.indexOf('bold'))
    const before = layout(session.state)
    const quoteRows = before.rows.filter((row) => rowText(row).startsWith('│ '))

    expect(quoteRows.length).toBeGreaterThanOrEqual(2)
    expect(quoteRows.some((row) => rowText(row).includes('bold and italic'))).toBe(true)
    expect(quoteRows.some((row) => rowText(row).includes('plain quote'))).toBe(true)
    expect(rowText(before.rows.find((row) => rowText(row).includes('normal'))!)).toContain('normal')
    expect(allText(before.rows)).not.toContain('> ')
    expect(styledTextContains(quoteRows, 'bold', { bold: true })).toBe(true)
    expect(styledTextContains(quoteRows, 'italic', { italic: true })).toBe(true)

    handleKey(session, 'X', makeKey(), makeCtx())
    const after = layout(session.state)
    expect(session.doc).toContain('Xbold')
    const editedQuote = after.rows.find((row) => rowText(row).includes('Xbold'))
    expect(editedQuote).toBeDefined()
    expect(rowText(editedQuote!)).toContain('│ Xbold')
    expect(styledTextContains([editedQuote!], 'Xbold', { bold: true })).toBe(true)
    expect(after.cursor).not.toBeNull()
  })

  it('keeps fenced JavaScript editable and tokenizes code without styling adjacent prose', () => {
    const doc = [
      'before **plain**',
      '',
      '```js',
      "const label = 'ok' + 42 // note",
      '```',
      '',
      'after *plain*',
    ].join('\n')
    const session = new EditorSession(null, doc, doc.indexOf('42') + 1)
    const before = layout(session.state)

    expect(allText(before.rows)).toContain('```js')
    expect(allText(before.rows)).toContain("const label = 'ok' + 42 // note")
    expect(styledTextContains(before.rows, 'const', { color: 'syntaxKeyword' })).toBe(true)
    expect(styledTextContains(before.rows, "'ok'", { color: 'syntaxString' })).toBe(true)
    expect(styledTextContains(before.rows, '42', { color: 'syntaxNumber' })).toBe(true)
    expect(styledTextContains(before.rows, '// note', { color: 'syntaxComment', italic: true })).toBe(true)
    expect(styledTextContains(before.rows, 'before plain', { color: 'syntaxKeyword' })).toBe(false)
    expect(styledTextContains(before.rows, 'after plain', { color: 'syntaxKeyword' })).toBe(false)

    handleKey(session, '3', makeKey(), makeCtx())
    const after = layout(session.state)
    expect(session.doc).toContain('432')
    expect(styledTextContains(after.rows, '432', { color: 'syntaxNumber' })).toBe(true)
    expect(after.cursor).not.toBeNull()
  })

  it('renders an active table as a styled grid, keeps editing in source, and restores source mode output', () => {
    const doc = [
      '| Left | Center | Right |',
      '| :--- | :----: | ----: |',
      '| Chinese |  | 12 |',
    ].join('\n')
    const session = new EditorSession(null, doc, doc.indexOf('Chinese') + 1)
    const grid = layout(session.state, session.state.selection.main.head, 60)
    const gridText = allText(grid.rows)

    expect(gridText).toContain('Chinese')
    expect(gridText).toContain('Center')
    expect(gridText).toContain('12')
    expect(gridText).toContain('┌')
    expect(gridText).not.toContain('| Left | Center | Right |')
    expect(styledTextContains(grid.rows, 'Left', { bold: true })).toBe(true)
    expect(grid.cursor).not.toBeNull()

    handleKey(session, 'X', makeKey(), makeCtx())
    handleKey(session, '', makeKey({ tab: true }), makeCtx())
    handleKey(session, '', makeKey({ backspace: true }), makeCtx())
    const editedGrid = layout(session.state, session.state.selection.main.head, 60)
    expect(session.doc).toContain('CXhinese')
    expect(allText(editedGrid.rows)).toContain('CXhinese')
    expect(allText(editedGrid.rows)).toContain('┌')

    const sourceState = session.state.update({ effects: setSourceMode.of(true) }).state
    const source = layout(sourceState, sourceState.selection.main.head, 60)
    expect(allText(source.rows)).toContain('| Left | Center | Right |')
    expect(allText(source.rows)).not.toContain('┌')
    expect(source.rows.some((row) => row.lineNo !== undefined)).toBe(true)
  })
})
