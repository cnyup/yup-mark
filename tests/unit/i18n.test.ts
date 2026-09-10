import { describe, expect, it } from 'vitest'
import zhCN from '@renderer/i18n/zh-CN'
import enUS from '@renderer/i18n/en-US'

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

describe('i18n 字典完整性', () => {
  it('中英文 key 集合一致', () => {
    expect(Object.keys(flatten(enUS)).sort()).toEqual(Object.keys(flatten(zhCN)).sort())
  })

  it('无空字符串文案', () => {
    for (const [name, dict] of [
      ['zh', zhCN],
      ['en', enUS],
    ] as const) {
      for (const [key, value] of Object.entries(flatten(dict))) {
        expect(value.length, `${name}:${key}`).toBeGreaterThan(0)
      }
    }
  })
})
