/**
 * 文档服务（MT1）：打开 + 防抖自动保存 + 落盘时机。
 * 桌面版语义对齐（DESIGN §4.3）：内容变化 debounce 800ms 落盘；退出时强制落盘。
 */
import { readFileSync, writeFileSync } from 'node:fs'

export type SaveState = 'saved' | 'dirty' | 'saving'

const AUTOSAVE_DELAY_MS = 800

export function loadFile(path: string): string {
  return readFileSync(path, 'utf8')
}

export interface AutosaverHooks {
  onState?(state: SaveState): void
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastSaved: string
  /** 保存状态回调（TuiApp 挂载后接线 setSaveState） */
  readonly hooks: AutosaverHooks

  constructor(
    private readonly path: string | null,
    private readonly getContent: () => string,
    hooks: AutosaverHooks = {},
  ) {
    this.hooks = hooks
    this.lastSaved = path === null ? getContent() : ''
  }

  /** 文档变化后调用（session.onDocChanged 接线） */
  changed(): void {
    if (this.path === null) return
    if (this.getContent() === this.lastSaved) return
    this.hooks.onState?.('dirty')
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.save()
    }, AUTOSAVE_DELAY_MS)
  }

  /** 立即落盘；成功返回 true */
  save(): boolean {
    if (this.path === null) return true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const content = this.getContent()
    if (content === this.lastSaved) return true
    this.hooks.onState?.('saving')
    try {
      writeFileSync(this.path, content, 'utf8')
      this.lastSaved = content
      this.hooks.onState?.('saved')
      return true
    } catch {
      this.hooks.onState?.('dirty')
      return false
    }
  }

  /** 退出前强制落盘（同步，process exit 钩子里可用） */
  flush(): void {
    if (this.path !== null && this.getContent() !== this.lastSaved) this.save()
  }
}
