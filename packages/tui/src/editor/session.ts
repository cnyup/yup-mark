/**
 * 编辑会话（MT1）：CM6 EditorState 的无头事务宿主。
 *
 * 桌面版把 updateListener 挂在 EditorView 上；TUI 没有 View，
 * 由本类承担同等职责：dispatch 包装（doc 变化通知 → 自动保存）+
 * 版本号订阅（React useSyncExternalStore 的数据源）。
 */
import { EditorState, type Transaction, type TransactionSpec } from '@codemirror/state'
import { docState } from '../state'

export class EditorSession {
  state: EditorState
  /** 每次成功 dispatch 自增；React 订阅的快照值 */
  version = 0

  constructor(readonly path: string | null, doc: string, anchor = 0) {
    this.state = docState(doc, anchor)
  }

  dispatch(...specs: TransactionSpec[]): Transaction {
    const tr = this.state.update(...specs)
    this.state = tr.state
    this.version++
    if (tr.docChanged) {
      for (const fn of this.docListeners) fn()
    }
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

  // ---- 文档变化订阅（自动保存触发器；纯选区移动不触发） ----
  private readonly docListeners = new Set<() => void>()

  subscribeDoc = (fn: () => void): (() => void) => {
    this.docListeners.add(fn)
    return () => {
      this.docListeners.delete(fn)
    }
  }
}
