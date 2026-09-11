/**
 * 编辑会话（MT1）：CM6 EditorState 的无头事务宿主。
 *
 * 桌面版把 updateListener 挂在 EditorView 上；TUI 没有 View，
 * 由本类承担同等职责：dispatch 包装（doc 变化通知 → 自动保存）+
 * 版本号订阅（React useSyncExternalStore 的数据源）。
 */
import { EditorState, type Transaction, type TransactionSpec } from '@codemirror/state'
import { docState } from '../state'

export type DocChangeListener = (tr: Transaction) => void

export class EditorSession {
  state: EditorState
  /** 每次成功 dispatch 自增；React 订阅的快照值 */
  version = 0
  /** 文档内容变化（自动保存触发器） */
  onDocChanged: DocChangeListener | null = null

  constructor(readonly path: string | null, doc: string, anchor = 0) {
    this.state = docState(doc, anchor)
  }

  dispatch(...specs: TransactionSpec[]): Transaction {
    const tr = this.state.update(...specs)
    this.state = tr.state
    this.version++
    if (tr.docChanged) this.onDocChanged?.(tr)
    this.emit()
    return tr
  }

  get doc(): string {
    return this.state.doc.toString()
  }

  // ---- React 订阅协议（useSyncExternalStore） ----
  private readonly listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getVersion = (): number => this.version

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
