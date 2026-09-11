/**
 * 滚动决策（MT1）：给定光标行与视口尺寸，修正 firstLine。
 *
 * MT1 策略（行级 + 渲染后兜底，app.tsx 编排）：
 *   - 光标行 < firstLine → 上滚一行留 1 行上下文
 *   - 光标行超出视口末行 → 下滚至光标行上方留 2 行
 *   - 软换行导致视觉行溢出 → 渲染后检测 cursor.y 越界，跳转到光标行居中
 * 打字机模式（光标恒垂直居中）MT3 在此扩展。
 */

/** 行级滚动修正（不含软换行，纯函数） */
export function adjustFirstLine(
  firstLine: number,
  cursorLine: number,
  docLines: number,
  height: number,
): number {
  let fl = firstLine
  if (cursorLine < fl) fl = Math.max(1, cursorLine - 1)
  const lastVisible = fl + height - 1
  if (cursorLine > lastVisible) fl = Math.max(1, cursorLine - (height - 2))
  // 短文档不满一屏时钉在顶部
  if (docLines <= height) fl = 1
  // 长文档不许滚出底部
  if (docLines > height) fl = Math.min(fl, docLines - height + 1)
  return fl
}

/** 渲染后发现光标视觉行越界时的居中跳转（兜底路径） */
export function centerOnCursor(cursorLine: number, docLines: number, height: number): number {
  return Math.max(1, Math.min(cursorLine - Math.floor(height / 2), docLines - height + 1))
}

/** 打字机模式：光标行恒居中（替代 adjustFirstLine） */
export function typewriterFirstLine(cursorLine: number, docLines: number, height: number): number {
  return Math.max(1, Math.min(cursorLine - Math.floor(height / 2), Math.max(1, docLines - height + 1)))
}
