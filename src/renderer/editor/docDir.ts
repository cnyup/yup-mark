/**
 * 文档目录（docDir）状态：图片等相对资源的解析基准。
 * store 在 openDocument 时通过 setDocDir effect 注入。
 */
import { StateEffect, StateField } from '@codemirror/state'

export const setDocDir = StateEffect.define<string | null>()

export const docDirField = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => {
    for (const eff of tr.effects) {
      if (eff.is(setDocDir)) return eff.value
    }
    return value
  },
})
