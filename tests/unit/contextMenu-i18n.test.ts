// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'
import { openEditorContextMenu, setEditorMenuLabels, tableMarkdown } from '@yupmark/live-cm/contextMenu'

afterEach(() => {
  document.body.innerHTML = ''
})

/** 内核右键菜单文案注入（外壳 i18n 联动的内核侧） */
describe('编辑器右键菜单 i18n', () => {
  const open = (): string[] => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState('正文', 1), parent: host })
    openEditorContextMenu(view, 10, 10)
    // 按钮内含图标/标签/快捷键三个 span，取标签那枚
    return Array.from(document.querySelectorAll('.ctx-menu button, .ctx-sub button')).map(
      (b) => b.querySelector('span:not(.ctx-menu__icon):not(.ctx-menu__hint)')?.textContent ?? '',
    )
  }

  it('默认中文；setEditorMenuLabels 注入后整体切换（含子菜单组名）', () => {
    expect(open()).toContain('剪切')
    expect(open()).toContain('段落')

    setEditorMenuLabels(
      {
        cut: 'Cut',
        copy: 'Copy',
        paste: 'Paste',
        selectAll: 'Select All',
        paragraph: 'Paragraph',
        format: 'Format',
        insert: 'Insert',
      },
      'Col ',
    )
    const en = open()
    expect(en).toContain('Cut')
    expect(en).toContain('Paragraph')
    expect(en).not.toContain('剪切')

    // 还原默认，避免影响其他用例
    setEditorMenuLabels(
      {
        cut: '剪切',
        copy: '复制',
        paste: '粘贴',
        selectAll: '全选',
        paragraph: '段落',
        format: '格式',
        insert: '插入',
      },
      '列',
    )
  })

  it('表头列前缀跟随注入（列N ↔ Col N）', () => {
    expect(tableMarkdown(3, 4)).toContain('列1')
    setEditorMenuLabels({}, 'Col ')
    expect(tableMarkdown(3, 4)).toContain('Col 1')
    setEditorMenuLabels({}, '列')
  })
})
