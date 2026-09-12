/**
 * ink log-update.js 的整文件替换：绝对定位帧绘制器。
 *
 * 由 run-cli.mjs 的 esbuild 插件注入 node_modules/ink/build/log-update.js
 * （整文件替换，对外表面与 ink 6.8 完全一致）；本模块同时被单元测试直接
 * 导入验证语义。
 *
 * 为什么不用 ink 自带的增量 renderer：它按「上一帧结束后光标停在帧底」的
 * 假设做相对移动（cursorUp(N-1) / cursorNextLine / returnToBottom），而
 * (1) 帧的可见行数随内容变化（空行被 yoga 折叠），(2) 相对移动在屏幕边缘
 * 被钳制，(3) resize 后行宽全变——三者叠加使记账与实际光标位置脱节，逐帧
 * 累积成整帧漂移（状态栏残影、内容重影）。
 *
 * 这里改为：每帧从 (0,0) 绝对归位，变化行按绝对坐标写入（ESC[r;1H + ESC[K），
 * 帧变矮清到底（ESC[0J），光标绝对定位锚定（useCursor 的 IME 锚点）。
 * 前提：备用屏 + 任何帧行宽不超终端列数（YupMark 的 layout 已保证截断）。
 */
import ansiEscapes from 'ansi-escapes'
import cliCursor from 'cli-cursor'

const visibleLineCount = (lines, str) => (str.endsWith('\n') ? lines.length - 1 : lines.length)
const showCursorEscape = '\u001B[?25h'
const hideCursorEscape = '\u001B[?25l'
const eraseBelow = '\u001B[0J'
const position = (x, y) => `\u001B[${Math.max(0, y) + 1};${Math.max(0, x) + 1}H`

const cursorChanged = (a, b) => a?.x !== b?.x || a?.y !== b?.y

export const create = (stream, { showCursor = false } = {}) => {
  let previousLines = []
  let previousOutput = ''
  let hasHiddenCursor = false
  let cursorPosition
  let cursorDirty = false
  let previousCursorPosition
  let cursorWasShown = false

  const getActiveCursor = () => (cursorDirty ? cursorPosition : undefined)
  // 光标意图仅在显式 set 后参与变更判定（undefined = 本帧无意图，不触发重绘）
  const hasChanges = (str, activeCursor) =>
    str !== previousOutput ||
    (activeCursor !== undefined && cursorChanged(activeCursor, previousCursorPosition))
  const cursorSuffix = (activeCursor) => {
    // 无光标意图（光标在隐藏行/被块吸收）→ 隐藏终端光标，防止它留在上一帧
    // 绝对绘制扫过的任意位置形成残影块
    if (!activeCursor) return hideCursorEscape
    return position(activeCursor.x, activeCursor.y) + showCursorEscape
  }

  const render = (str) => {
    if (!showCursor && !hasHiddenCursor) {
      cliCursor.hide(stream)
      hasHiddenCursor = true
    }
    const activeCursor = getActiveCursor()
    cursorDirty = false
    if (!hasChanges(str, activeCursor)) {
      return false
    }
    const nextLines = str.split('\n')
    const visibleCount = visibleLineCount(nextLines, str)
    const buffer = []
    buffer.push(ansiEscapes.cursorTo(0, 0))
    for (let i = 0; i < visibleCount; i++) {
      if (nextLines[i] === previousLines[i]) continue
      buffer.push(ansiEscapes.cursorTo(0, i), nextLines[i] ?? '', ansiEscapes.eraseEndLine)
    }
    if (visibleCount < previousLines.length) {
      buffer.push(ansiEscapes.cursorTo(0, visibleCount), eraseBelow)
    }
    buffer.push(cursorSuffix(activeCursor))
    stream.write(buffer.join(''))
    previousOutput = str
    previousLines = nextLines
    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined
    cursorWasShown = activeCursor !== undefined
    return true
  }

  render.clear = () => {
    stream.write(ansiEscapes.cursorTo(0, 0) + eraseBelow)
    previousOutput = ''
    previousLines = []
    previousCursorPosition = undefined
    cursorWasShown = false
  }

  render.done = () => {
    previousOutput = ''
    previousLines = []
    previousCursorPosition = undefined
    cursorWasShown = false
    if (!showCursor) {
      cliCursor.show(stream)
      hasHiddenCursor = false
    }
  }

  render.sync = (str) => {
    const activeCursor = cursorDirty ? cursorPosition : undefined
    cursorDirty = false
    previousOutput = str
    previousLines = str.split('\n')
    if (!activeCursor && cursorWasShown) {
      stream.write(hideCursorEscape)
    }
    if (activeCursor) {
      stream.write(cursorSuffix(activeCursor))
    }
    previousCursorPosition = activeCursor ? { ...activeCursor } : undefined
    cursorWasShown = activeCursor !== undefined
  }

  render.setCursorPosition = (pos) => {
    cursorPosition = pos
    cursorDirty = true
  }
  render.isCursorDirty = () => cursorDirty
  render.willRender = (str) => hasChanges(str, getActiveCursor())
  return render
}

const logUpdate = { create }
export default logUpdate
