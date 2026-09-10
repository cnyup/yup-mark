/** 文本统计：中英混排的字数/字符/行数计算 */

export interface TextStats {
  /** 去除空白后的字符数 */
  chars: number
  /** 字数：CJK 逐字计数 + 拉丁字母/数字按词计数 */
  words: number
  lines: number
}

const LATIN_WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

export function countStats(text: string): TextStats {
  const lines = text === '' ? 1 : text.split('\n').length
  const chars = text.replace(/\s/g, '').length
  const latinWords = text.match(LATIN_WORD)?.length ?? 0
  const cjkChars = text.match(CJK_CHAR)?.length ?? 0
  return { chars, words: latinWords + cjkChars, lines }
}
