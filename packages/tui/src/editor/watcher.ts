/**
 * 外部修改检测（MT4，TUI.md §9-MT4）：mtime 轮询 + 冲突判定（纯函数）。
 * 桌面对齐（DESIGN §4.3）：内容未变（干净）→ 静默重载；有本地修改 → 冲突弹窗。
 * TUI 弹窗为二选一（对比视图为桌面 P1 待办，同源）。
 */
import { readFileSync, statSync } from 'node:fs'

export interface DiskSnapshot {
  mtimeMs: number
  content: string
}

export function readDiskSnapshot(path: string): DiskSnapshot | null {
  try {
    const st = statSync(path)
    if (!st.isFile()) return null
    // 行尾归一化（与 loadFile 一致）：否则 CRLF 外部改动会被误判为冲突/整文档差异
    return { mtimeMs: st.mtimeMs, content: readFileSync(path, 'utf8').replace(/\r\n?/g, '\n') }
  } catch {
    return null
  }
}

export type ConflictVerdict = 'none' | 'reload' | 'conflict' | 'deleted'

/**
 * 判定：
 *  - disk 缺失（删除/不可读）→ deleted
 *  - 磁盘内容 == 当前文档 → none
 *  - 当前文档 == 已保存基线（本地干净）→ reload（静默加载磁盘版）
 *  - 否则 → conflict
 */
export function judge(
  currentDoc: string,
  savedBaseline: string,
  disk: DiskSnapshot | null,
): ConflictVerdict {
  if (disk === null) return 'deleted'
  if (disk.content === currentDoc) return 'none'
  if (currentDoc === savedBaseline) return 'reload'
  return 'conflict'
}
