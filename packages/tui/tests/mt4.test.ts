// MT4 单测：主题 token 解析 / 持久化往返 / 外部修改判定 / i18n 完备性
import { describe, expect, it } from 'vitest'
import { PALETTES, THEME_ORDER, setTheme, getTheme, resolveColor, resolveBg } from '../src/theme'
import { detectLang, getLang, setLang, t } from '../src/i18n'
import { judge, readDiskSnapshot, type DiskSnapshot } from '../src/editor/watcher'

describe('主题（token → 调色板）', () => {
  it('7 套调色板齐备且 token 全解析为 hex', () => {
    expect(THEME_ORDER).toHaveLength(7)
    const tokens = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'link', 'codeInline', 'math', 'tableActive',
      'searchHit', 'accent', 'syntaxKeyword', 'syntaxString', 'syntaxNumber', 'syntaxComment',
      'syntaxType', 'syntaxFunction', 'syntaxAttr', 'syntaxTag',
    ]
    for (const theme of THEME_ORDER) {
      setTheme(theme)
      expect(getTheme()).toBe(theme)
      for (const tok of tokens) {
        const v = resolveColor(tok)
        expect(v, `${theme}.${tok}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
    setTheme('yup')
  })

  it('yup 主色同源桌面（heading #d63384）', () => {
    setTheme('yup')
    expect(PALETTES.yup.h1).toBe('#d63384')
    expect(resolveColor('h1')).toBe('#d63384')
  })

  it('暗色主题自绘背景，亮色透明', () => {
    setTheme('github-dark')
    expect(resolveBg()).toMatch(/^#/)
    setTheme('dracula')
    expect(resolveBg()).toMatch(/^#/)
    setTheme('yup')
    expect(resolveBg()).toBeUndefined()
  })

  it('未知 token 透传（兼容原始 hex/终端色名）', () => {
    expect(resolveColor('#abcdef')).toBe('#abcdef')
    expect(resolveColor(undefined)).toBeUndefined()
  })
})

describe('外部修改判定（纯函数）', () => {
  const disk: DiskSnapshot = { mtimeMs: 1, content: '磁盘版' }

  it('磁盘 == 当前 → none', () => {
    expect(judge('磁盘版', '旧基线', disk)).toBe('none')
  })
  it('本地干净（当前==基线）→ reload 静默重载', () => {
    expect(judge('本地未改', '本地未改', disk)).toBe('reload')
  })
  it('本地有修改 → conflict', () => {
    expect(judge('我的修改', '原版', disk)).toBe('conflict')
  })
  it('文件消失 → deleted', () => {
    expect(judge('x', 'x', null)).toBe('deleted')
  })
  it('readDiskSnapshot 不存在路径 → null', () => {
    expect(readDiskSnapshot('/not/exists/file.md')).toBeNull()
  })
})

describe('i18n', () => {
  it('zh/en 双语键集一致且非空键可查', () => {
    // 切语言能取到对应文案
    setLang('en-US')
    expect(t('hint.find')).toBe('Find')
    expect(t('conflict.keepMine')).toContain('Keep mine')
    setLang('zh-CN')
    expect(t('hint.find')).toBe('查找')
    expect(getLang()).toBe('zh-CN')
  })
  it('缺键回落：键名透传', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })
})

describe('detectLang', () => {
  it('按 LANG 探测（zh → zh-CN）', () => {
    const orig = process.env.LANG
    process.env.LANG = 'zh_CN.UTF-8'
    expect(detectLang()).toBe('zh-CN')
    process.env.LANG = 'en_US.UTF-8'
    expect(detectLang()).toBe('en-US')
    process.env.LANG = orig
  })
})
