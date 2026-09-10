/**
 * 全量测量工具（诊断台用；应用内不做自动触发——实测漂移指标对装饰文档无法收敛，
 * 自动自愈会导致滚动刷屏。正常滚动本身会渐进固化高度，跳滚后的轻微瞬态误差可接受）。
 */
import type { EditorView } from '@codemirror/view'

const MAX_LINES = 3000 // 超大文档不做全量（耗时），退化为渐进测量

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

let passRunning = false

export async function forceFullMeasure(view: EditorView): Promise<void> {
  if (passRunning) return
  if (view.state.doc.lines > MAX_LINES) return
  passRunning = true
  try {
    await runPass(view)
  } finally {
    passRunning = false
  }
}

async function runPass(view: EditorView): Promise<void> {
  const scroller = view.scrollDOM
  const original = scroller.scrollTop
  // 不能用 visibility:hidden 防闪烁——CM6 的可见性检测会因此跳过测量
  try {
    const step = Math.max(200, Math.floor(scroller.clientHeight / 2))
    for (let y = 0; y < scroller.scrollHeight; y += step) {
      scroller.scrollTop = y
      // 每步给 CM6 完整的"绘制→测量"周期
      await nextFrame()
      view.requestMeasure()
      await nextFrame()
      await nextFrame()
    }
    view.requestMeasure()
    await nextFrame()
    await nextFrame()
  } finally {
    scroller.scrollTop = original
    view.requestMeasure()
    await nextFrame()
  }
}

/** 高度图与真实 DOM 的累计偏差（px）；接近 0 表示高度图可信 */
export function heightMapDrift(view: EditorView): number {
  const contentRect = view.contentDOM.getBoundingClientRect()
  const endCoords = view.coordsAtPos(view.state.doc.length)
  if (!endCoords || contentRect.height === 0) return 0
  const mapHeight = endCoords.bottom - contentRect.top + view.scrollDOM.scrollTop
  return Math.abs(mapHeight - contentRect.height)
}
