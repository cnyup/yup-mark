// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import i18n from '@renderer/i18n'
import { PromptModal } from '@renderer/app/PromptModal'
import { SettingsModal } from '@renderer/app/SettingsModal'
import { FileTree } from '@renderer/app/FileTree'
import { useWorkspaceStore } from '@renderer/app/store/workspaceStore'
import '@renderer/i18n'

// Radix Portal 渲染在 body 下，vitest 未开 globals：必须手动 cleanup，否则跨用例残留 .modal
afterEach(cleanup)

/** Radix Dialog/ContextMenu 接入后的外壳行为冒烟（焦点圈定/Esc/portal/菜单联动） */
describe('Radix 无头组件（Modal/ContextMenu）', () => {
  it('PromptModal：portal 渲染、初始聚焦输入框、Enter 确认、Esc 回调取消', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { baseElement } = render(
      <PromptModal title="新建文件" initial="a.md" onConfirm={onConfirm} onCancel={onCancel} />,
    )
    // Radix Portal：内容挂在 body 下
    const overlay = baseElement.querySelector('.modal-overlay')
    const modal = baseElement.querySelector('.modal')
    expect(overlay).not.toBeNull()
    expect(modal).not.toBeNull()
    expect(modal?.getAttribute('role')).toBe('dialog')
    // 初始焦点在输入框
    const input = modal?.querySelector('input.modal__input') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('a.md')
    // Enter → onConfirm
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith('a.md')
    // Esc → onCancel（Radix 层处理）
    fireEvent.keyDown(baseElement, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('SettingsModal：Esc 关闭回调 + 两个下拉存在', () => {
    const onClose = vi.fn()
    const { baseElement } = render(<SettingsModal onClose={onClose} />)
    const modal = baseElement.querySelector('.modal') as HTMLElement
    expect(modal.querySelectorAll('select.settings__select').length).toBe(2)
    fireEvent.keyDown(baseElement, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('FileTree：右键文件行 → ContextMenu 弹出且项集正确（文件无「新建」组）', async () => {
    useWorkspaceStore.setState({
      workspaceRoot: '/ws',
      tree: [
        { name: 'a.md', path: '/ws/a.md', dir: false },
        { name: 'sub', path: '/ws/sub', dir: true, children: [] },
      ],
    })
    const { baseElement } = render(<FileTree query="" view="tree" sort="folder" />)
    // 排序目录优先：按文件名定位文件行
    const row = Array.from(baseElement.querySelectorAll('.file-tree__row')).find((r) =>
      r.textContent?.includes('a.md'),
    ) as HTMLElement
    expect(row).not.toBeNull()
    fireEvent.contextMenu(row)
    const menu = await vi.waitFor(() => {
      const m = baseElement.querySelector('.ctx-menu') as HTMLElement
      expect(m).not.toBeNull()
      return m
    })
    // 文件行：无「新建」，有「重命名/删除/显示」；项集完整性
    const labels = Array.from(menu.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toContain(i18n.t('tree.rename'))
    expect(labels).toContain(i18n.t('tree.delete'))
    expect(labels).toContain(i18n.t('tree.reveal'))
    expect(labels).not.toContain(i18n.t('tree.newFile'))
    // onSelect→PromptModal 的激活链路依赖 Radix 内部指针状态机，jsdom 合成事件不可达，留给 GUI 手验
  })

  it('FileTree：右键目录行 → 含「新建文件/新建文件夹」', async () => {
    useWorkspaceStore.setState({
      workspaceRoot: '/ws',
      tree: [
        { name: 'a.md', path: '/ws/a.md', dir: false },
        { name: 'sub', path: '/ws/sub', dir: true, children: [] },
      ],
    })
    const { baseElement } = render(<FileTree query="" view="tree" sort="folder" />)
    const rows = baseElement.querySelectorAll('.file-tree__row')
    const dirRow = Array.from(rows).find((r) => r.textContent?.includes('sub')) as HTMLElement
    fireEvent.contextMenu(dirRow)
    await vi.waitFor(() => {
      const labels = Array.from(baseElement.querySelectorAll('.ctx-menu button')).map((b) => b.textContent)
      expect(labels).toContain(i18n.t('tree.newFile'))
      expect(labels).toContain(i18n.t('tree.newFolder'))
    })
  })
})
