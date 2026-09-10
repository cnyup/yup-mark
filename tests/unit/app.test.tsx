// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from '@renderer/app/App'
import '@renderer/i18n'

function mockApi() {
  return {
    openFileDialog: vi.fn(),
    saveFile: vi.fn(),
    saveFileDialog: vi.fn(),
    readFile: vi.fn(),
    openWorkspaceDialog: vi.fn(),
    readTree: vi.fn(),
    closeWorkspace: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    renameEntry: vi.fn(),
    trashEntry: vi.fn(),
    revealInFileManager: vi.fn(),
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    recentFiles: vi.fn().mockResolvedValue([]),
    setLanguage: vi.fn().mockResolvedValue({ ok: true, data: null }),
    loadSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue({ ok: true, data: null }),
    onMenuAction: vi.fn(() => () => {}),
    onFsEvent: vi.fn(() => () => {}),
  }
}

beforeEach(() => {
  cleanup()
  window.soyupmark = mockApi() as unknown as typeof window.soyupmark
})

describe('App 冒烟测试', () => {
  it('渲染编辑器容器、侧边栏与状态栏', () => {
    render(<App />)
    expect(document.querySelector('.editor-host .cm-editor')).toBeTruthy()
    expect(document.querySelector('.sidebar')).toBeTruthy()
    expect(document.querySelector('.status-bar')).toBeTruthy()
  })

  it('订阅原生菜单与文件系统事件', () => {
    render(<App />)
    expect(window.soyupmark.onMenuAction).toHaveBeenCalled()
    expect(window.soyupmark.onFsEvent).toHaveBeenCalled()
  })

  it('未命名文档显示占位标题', () => {
    render(<App />)
    expect(screen.getByText(/Untitled|未命名/)).toBeTruthy()
  })
})
