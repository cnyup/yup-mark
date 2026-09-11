/**
 * 视图模式三件套（Typora 对照）：
 * - 源码模式 ⌘/ / Ctrl+/：整文档切换纯源码（标记全显 + 行号槽 + 当前行高亮）
 * - 专注模式 F8：非当前块淡化
 * - 打字机模式 F9：输入/移动时保持光标垂直居中
 * 模式存于 EditorState 字段（每个标签页独立），rules.ts 装饰层读取生效；
 * 状态变化经 subscribeViewModes 推送（状态栏徽章反馈）。
 */
import {
  Compartment,
  StateEffect,
  StateField,
  type Extension,
  type StateEffectType,
} from '@codemirror/state'
import { EditorView, ViewPlugin, highlightActiveLine, lineNumbers, type ViewUpdate } from '@codemirror/view'

/** 布尔模式字段的标准构造 */
function modeField(effect: StateEffectType<boolean>): StateField<boolean> {
  return StateField.define<boolean>({
    create: () => false,
    update: (value: boolean, tr): boolean => {
      for (const e of tr.effects) if (e.is(effect)) return e.value
      return value
    },
  })
}

export const setSourceMode = StateEffect.define<boolean>()
export const sourceModeField = modeField(setSourceMode)

export const setFocusMode = StateEffect.define<boolean>()
export const focusModeField = modeField(setFocusMode)

export const setTypewriterMode = StateEffect.define<boolean>()
export const typewriterModeField = modeField(setTypewriterMode)

export function toggleSourceMode(view: EditorView): boolean {
  view.dispatch({ effects: setSourceMode.of(!view.state.field(sourceModeField, false)) })
  return true
}

export function toggleFocusMode(view: EditorView): boolean {
  view.dispatch({ effects: setFocusMode.of(!view.state.field(focusModeField, false)) })
  return true
}

export function toggleTypewriterMode(view: EditorView): boolean {
  view.dispatch({ effects: setTypewriterMode.of(!view.state.field(typewriterModeField, false)) })
  return true
}

// ---------------------------------------------------------------------------
// 状态订阅（状态栏模式徽章）
// ---------------------------------------------------------------------------
export interface ViewModesState {
  source: boolean
  focus: boolean
  typewriter: boolean
}

const listeners = new Set<(modes: ViewModesState) => void>()
let lastModes: ViewModesState = { source: false, focus: false, typewriter: false }

function modesOf(view: EditorView): ViewModesState {
  return {
    source: view.state.field(sourceModeField, false) ?? false,
    focus: view.state.field(focusModeField, false) ?? false,
    typewriter: view.state.field(typewriterModeField, false) ?? false,
  }
}

function notify(view: EditorView): void {
  lastModes = modesOf(view)
  for (const l of listeners) l(lastModes)
}

/** 订阅当前激活视图的模式（立即回放最近一次状态） */
export function subscribeViewModes(listener: (modes: ViewModesState) => void): () => void {
  listeners.add(listener)
  listener(lastModes)
  return () => listeners.delete(listener)
}

/** 模式变化通知：切换（dispatch）与换标签（setState 重建插件）都会触发 */
const modeNotifier = ViewPlugin.fromClass(
  class {
    private last: ViewModesState

    constructor(view: EditorView) {
      this.last = modesOf(view)
      notify(view)
    }

    update(u: ViewUpdate): void {
      const now = modesOf(u.view)
      if (
        now.source !== this.last.source ||
        now.focus !== this.last.focus ||
        now.typewriter !== this.last.typewriter
      ) {
        this.last = now
        notify(u.view)
      }
    }
  },
)

// ---------------------------------------------------------------------------
// 源码模式附加扩展：行号槽 + 当前行高亮（Compartment 按需挂载）
// ---------------------------------------------------------------------------
const sourceExtrasComp = new Compartment()
const sourceExtras: Extension[] = [lineNumbers(), highlightActiveLine()]

const sourceExtrasReconfigurer = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate): void {
      const was = u.startState.field(sourceModeField, false)
      const now = u.state.field(sourceModeField, false)
      if (was === now) return
      // 不允许在 update 循环内 dispatch；微任务外重配置 compartment
      queueMicrotask(() => {
        const on = u.view.state.field(sourceModeField, false)
        u.view.dispatch({ effects: sourceExtrasComp.reconfigure(on ? sourceExtras : []) })
      })
    }
  },
)

/** 打字机模式：文档/选区变化后把光标滚动到视口中央 */
const typewriterScroll = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate): void {
      if (!u.docChanged && !u.selectionSet) return
      if (!u.state.field(typewriterModeField, false)) return
      queueMicrotask(() => {
        const v = u.view
        if (v.state.field(typewriterModeField, false)) {
          v.dispatch({
            effects: EditorView.scrollIntoView(v.state.selection.main.head, { y: 'center' }),
          })
        }
      })
    }
  },
)

export function viewModeExtensions(): Extension[] {
  return [
    sourceModeField,
    focusModeField,
    typewriterModeField,
    typewriterScroll,
    modeNotifier,
    sourceExtrasComp.of([]),
    sourceExtrasReconfigurer,
  ]
}
