// 键位翻译层单测（MT1）：真实 session.dispatch 链路验证
import { describe, expect, it } from 'vitest'
import type { Key } from 'ink'
import { EditorSession } from '../src/editor/session'
import { continueListPrefix, handleKey, type KeyContext } from '../src/editor/keys'

function makeKey(over: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...over,
  }
}

function makeSession(doc: string, anchor = doc.length): EditorSession {
  return new EditorSession(null, doc, anchor)
}

function makeCtx(height = 24): KeyContext {
  let goal: number | null = null
  return {
    height,
    get goalColumn() {
      return goal
    },
    set goalColumn(v: number | null) {
      goal = v
    },
    setGoalColumn(v: number | null) {
      goal = v
    },
  }
}

const head = (s: EditorSession): number => s.state.selection.main.head
const text = (s: EditorSession): string => s.doc

describe('continueListPrefix（列表续写规则）', () => {
  it('无序列表', () => {
    expect(continueListPrefix('- 项目')).toBe('- ')
    expect(continueListPrefix('  * 缩进项')).toBe('  * ')
  })
  it('有序列表自动递增', () => {
    expect(continueListPrefix('3. 第三')).toBe('4. ')
    expect(continueListPrefix('12) 项')).toBe('13) ')
  })
  it('任务列表续写为未勾选', () => {
    expect(continueListPrefix('- [x] 完成')).toBe('- [ ] ')
  })
  it('空列表项 → 退出列表', () => {
    expect(continueListPrefix('- ')).toBe('')
    expect(continueListPrefix('1. ')).toBe('')
  })
  it('非列表行 → null（普通换行）', () => {
    expect(continueListPrefix('普通段落')).toBeNull()
  })
})

describe('输入与删除', () => {
  it('可打印字符插入光标处', () => {
    const s = makeSession('ab', 1)
    handleKey(s, 'X', makeKey(), makeCtx())
    expect(text(s)).toBe('aXb')
    expect(head(s)).toBe(2)
  })

  it('多字符整串（粘贴）', () => {
    const s = makeSession('ab', 2)
    handleKey(s, '中文粘贴', makeKey(), makeCtx())
    expect(text(s)).toBe('ab中文粘贴')
  })

  it('选中后输入 = 替换选区', () => {
    const s = makeSession('abcdef', 4)
    s.dispatch({ selection: { anchor: 1, head: 4 } }) // bcd
    handleKey(s, 'XY', makeKey(), makeCtx())
    expect(text(s)).toBe('aXYef')
  })

  it('Backspace 删前字符（CJK 整字）', () => {
    const s = makeSession('a中文', 3)
    handleKey(s, '', makeKey({ backspace: true }), makeCtx())
    expect(text(s)).toBe('a中')
    expect(head(s)).toBe(2)
  })

  it('Backspace 行首 = 并入上一行', () => {
    const s = makeSession('one\ntwo', 4)
    handleKey(s, '', makeKey({ backspace: true }), makeCtx())
    expect(text(s)).toBe('onetwo')
    expect(head(s)).toBe(3)
  })

  it('Delete 删后字符', () => {
    const s = makeSession('ab', 1)
    handleKey(s, '', makeKey({ delete: true }), makeCtx())
    expect(text(s)).toBe('a')
  })
})

describe('回车与列表续写', () => {
  it('普通行回车 = 换行', () => {
    const s = makeSession('ab', 1)
    handleKey(s, '', makeKey({ return: true }), makeCtx())
    expect(text(s)).toBe('a\nb')
  })

  it('- 列表回车续写', () => {
    const s = makeSession('- 项', 3)
    handleKey(s, '', makeKey({ return: true }), makeCtx())
    expect(text(s)).toBe('- 项\n- ')
  })

  it('有序列表回车递增编号', () => {
    const s = makeSession('2. 项', 4)
    handleKey(s, '', makeKey({ return: true }), makeCtx())
    expect(text(s)).toBe('2. 项\n3. ')
  })

  it('空列表项回车退出列表', () => {
    const s = makeSession('文字\n- ', 5)
    handleKey(s, '', makeKey({ return: true }), makeCtx())
    expect(text(s)).toBe('文字\n')
    expect(head(s)).toBe(3)
  })
})

describe('光标移动', () => {
  it('左右移动跨行', () => {
    const s = makeSession('ab\ncd', 3)
    handleKey(s, '', makeKey({ leftArrow: true }), makeCtx())
    expect(head(s)).toBe(2) // 上一行行尾
    handleKey(s, '', makeKey({ rightArrow: true }), makeCtx())
    expect(head(s)).toBe(3)
  })

  it('上下移动保持目标视觉列（CJK）', () => {
    // 第一行 '中文x'（列宽 0..5，x 后 = 列 5），第二行 '中xxxx'
    const s = makeSession('中文x\n中xxxx', 3) // 光标在 x 后
    handleKey(s, '', makeKey({ downArrow: true }), makeCtx())
    // 下列 col5 → '中xxx' 后（index 4）
    expect(head(s)).toBe('中文x\n'.length + 4)
  })

  it('Home/End 行首行尾', () => {
    const s = makeSession('hello', 3)
    handleKey(s, '', makeKey({ end: true }), makeCtx())
    expect(head(s)).toBe(5)
    handleKey(s, '', makeKey({ home: true }), makeCtx())
    expect(head(s)).toBe(0)
  })

  it('Shift+Left 扩展选区，Esc 收起', () => {
    const s = makeSession('abcd', 3)
    handleKey(s, '', makeKey({ leftArrow: true, shift: true }), makeCtx())
    expect(s.state.selection.main.anchor).toBe(3)
    expect(head(s)).toBe(2)
    handleKey(s, '', makeKey({ escape: true }), makeCtx())
    expect(s.state.selection.main.anchor).toBe(head(s))
  })

  it('Ctrl+左右按词跳', () => {
    const s = makeSession('foo bar baz', 11)
    handleKey(s, 'left', makeKey({ ctrl: true }), makeCtx())
    expect(head(s)).toBe(8)
    handleKey(s, 'left', makeKey({ ctrl: true }), makeCtx())
    expect(head(s)).toBe(4)
    handleKey(s, 'right', makeKey({ ctrl: true }), makeCtx())
    expect(head(s)).toBe(7)
  })

  it('Ctrl+Home/End 文档首尾', () => {
    const s = makeSession('a\nb\nc', 3)
    handleKey(s, 'end', makeKey({ ctrl: true }), makeCtx())
    expect(head(s)).toBe(5)
    handleKey(s, 'home', makeKey({ ctrl: true }), makeCtx())
    expect(head(s)).toBe(0)
  })
})

describe('壳层动作', () => {
  it('Ctrl+S → save，Ctrl+Q → exit，其余 none', () => {
    const s = makeSession('x', 1)
    const ctx = makeCtx()
    expect(handleKey(s, 's', makeKey({ ctrl: true }), ctx)).toBe('save')
    expect(handleKey(s, 'q', makeKey({ ctrl: true }), ctx)).toBe('exit')
    expect(handleKey(s, 'z', makeKey({ ctrl: true }), ctx)).toBe('none')
  })

  it('q 是普通字符（编辑器里可输入）', () => {
    const s = makeSession('', 0)
    handleKey(s, 'q', makeKey(), makeCtx())
    expect(text(s)).toBe('q')
  })
})

describe('EditorSession（状态容器）', () => {
  it('dispatch 自增版本并触发订阅', () => {
    const s = makeSession('a', 1)
    let fired = 0
    const off = s.subscribe(() => {
      fired++
    })
    s.dispatch({ changes: { from: 1, insert: 'b' } })
    expect(s.version).toBe(1)
    expect(fired).toBe(1)
    expect(text(s)).toBe('ab')
    off()
    s.dispatch({ selection: { anchor: 0 } })
    expect(fired).toBe(1)
    expect(s.version).toBe(2)
  })

  it('subscribeDoc 仅文档变化时触发（纯选区不触发）', () => {
    const s = makeSession('a', 1)
    let docEvents = 0
    const off = s.subscribeDoc(() => {
      docEvents++
    })
    s.dispatch({ selection: { anchor: 0 } })
    expect(docEvents).toBe(0)
    s.dispatch({ changes: { from: 1, insert: '!' } })
    expect(docEvents).toBe(1)
    off()
    s.dispatch({ changes: { from: 1, insert: '?' } })
    expect(docEvents).toBe(1)
  })
})
