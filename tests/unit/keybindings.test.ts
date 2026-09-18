// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView, keymap } from '@codemirror/view'
import { EDITOR_COMMANDS, comboFromEvent, effectiveBindings, matchesBinding, prettyKey } from '@yupmark/live-cm/keybindings'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { buildTableAndFormatKeys, formatKeysCompartment } from '@yupmark/live-cm/engine'

const find = (id: string) => EDITOR_COMMANDS.find((c) => c.id === id) as (typeof EDITOR_COMMANDS)[number]

/** 键位注册表 + 覆盖解析 + 捕获/匹配工具（设置页快捷键功能的内核侧） */
describe('keybindings 注册表', () => {
  it('命令表覆盖全部关键组且默认键与 Typora 对照一致', () => {
    expect(find('format.bold').mac).toBe('Mod-b')
    expect(find('format.bold').win).toBe('Mod-b')
    expect(find('find.replace').mac).toBe('Mod-Alt-f')
    expect(find('find.replace').win).toBe('Mod-h')
    expect(find('list.ul').mac).toBe('Mod-Alt-u')
    expect(find('list.ul').win).toBe('Mod-Shift-]')
    expect(find('paragraph.h6').win).toBe('Mod-6')
    expect(find('insert.table').win).toBe('Mod-t')
  })

  it('effectiveBindings：默认 + 覆盖，未知 id 与空串被忽略', () => {
    const eff = effectiveBindings({ 'format.bold': 'Mod-Shift-b', 'bogus.id': 'Mod-x', 'find.open': '' })
    expect(eff['format.bold']).toBe('Mod-Shift-b')
    expect(eff['find.open']).toBe(find('find.open').mac === 'Mod-f' ? 'Mod-f' : 'Mod-f')
    expect(eff['bogus.id']).toBeUndefined()
    expect(Object.keys(eff).length).toBe(EDITOR_COMMANDS.length)
  })

  it('comboFromEvent：修饰 + 主键组合成键位串；纯修饰返回 null；裸字母拒绝', () => {
    expect(comboFromEvent({ code: 'KeyB', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent)).toBe('Mod-b')
    expect(comboFromEvent({ code: 'KeyF', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false } as KeyboardEvent)).toBe('Mod-Alt-f')
    expect(comboFromEvent({ code: 'F8', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent)).toBe('F8') // 裸功能键允许（默认即 F8/F9）
    expect(comboFromEvent({ code: 'ShiftLeft', shiftKey: true } as KeyboardEvent)).toBeNull()
    expect(comboFromEvent({ code: 'KeyA', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false } as KeyboardEvent)).toBeNull()
  })

  it('matchesBinding：mac 上 Mod=⌘、Ctrl 独立；win 上 Mod=Ctrl', () => {
    const ev = { code: 'Digit1', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false } as KeyboardEvent
    expect(matchesBinding(ev, 'Control-Mod-1', true)).toBe(true)
    expect(matchesBinding(ev, 'Mod-Shift-1', true)).toBe(false)
    const winEv = { code: 'Digit1', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true } as KeyboardEvent
    expect(matchesBinding(winEv, 'Mod-Shift-1', false)).toBe(true)
    expect(matchesBinding(winEv, 'Control-Mod-1', false)).toBe(false)
  })

  it('prettyKey：双平台显示化', () => {
    expect(prettyKey('Mod-b', true)).toBe('⌘B')
    expect(prettyKey('Mod-b', false)).toBe('Ctrl+B')
    expect(prettyKey('Mod-Shift-d', false)).toBe('Ctrl+Shift+D')
  })
})

describe('键位热重配（Compartment）', () => {
  it('覆盖键进 keymap、被替换的默认键消失；reconfigure 即时切换', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
      state: createEditorState('正文\n', 1, undefined, { 'format.bold': 'Mod-Shift-b' }),
      parent: host,
    })
    const keys = (): string[] => view.state.facet(keymap).flat().map((b) => b.key ?? '')
    expect(keys()).toContain('Mod-Shift-b')
    expect(keys()).not.toContain('Mod-b') // 加粗默认键被覆盖取代
    expect(keys()).toContain('F8') // 未覆盖命令保持默认

    // 活视图热重配：清空覆盖回到默认
    view.dispatch({ effects: formatKeysCompartment.reconfigure(buildTableAndFormatKeys({})) })
    expect(keys()).toContain('Mod-b')
    expect(keys()).not.toContain('Mod-Shift-b')
    view.destroy()
    host.remove()
  })
})
