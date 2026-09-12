// 绝对定位帧绘制器单测（run-cli.mjs 注入 ink 的 log-update 替换件）：
// 语义 = 每帧绝对归位、变化行按绝对坐标写、帧变矮清到底、光标绝对锚定、无相对移动。
import { describe, expect, it } from 'vitest'
import { create } from '../scripts/log-update-absolute.mjs'

/** 假终端流：收集写入，TTY 语义 */
function fakeStream() {
  return {
    isTTY: true,
    columns: 100,
    rows: 40,
    written: '',
    write(chunk) {
      this.written += String(chunk)
      return true
    },
  }
}

const ESC = '\u001B['

describe('绝对定位帧绘制器', () => {
  it('首帧：归位 + 全部行绝对定位写入 + 行内擦除', () => {
    const s = fakeStream()
    const log = create(s)
    const r = log('alpha\nbeta')
    expect(r).toBe(true)
    expect(s.written).toContain(`${ESC}1;1H`) // 归位
    expect(s.written).toContain(`${ESC}1;1Halpha${ESC}K`) // 第 1 行
    expect(s.written).toContain(`${ESC}2;1Hbeta${ESC}K`) // 第 2 行
    expect(s.written).not.toContain(`${ESC}KA`) // 擦除不会吞内容
  })

  it('第二帧：只重写变化行，未变行不产生输出', () => {
    const s = fakeStream()
    const log = create(s)
    log('alpha\nbeta\ngamma')
    s.written = ''
    log('alpha\nBETA\ngamma')
    expect(s.written).toContain(`${ESC}2;1HBETA${ESC}K`)
    expect(s.written).not.toContain('alpha')
    expect(s.written).not.toContain('gamma')
    expect(s.written).not.toContain(`${ESC}3;1H`)
  })

  it('帧变矮：底部残留清到底（ESC[0J）', () => {
    const s = fakeStream()
    const log = create(s)
    log('a\nb\nc\nd')
    s.written = ''
    log('a') // 1 行
    expect(s.written).toContain(`${ESC}2;1H${ESC}0J`)
  })

  it('帧变高：新增行按绝对坐标写入', () => {
    const s = fakeStream()
    const log = create(s)
    log('a\nb')
    s.written = ''
    log('a\nb\nc\nd')
    expect(s.written).toContain(`${ESC}3;1Hc${ESC}K`)
    expect(s.written).toContain(`${ESC}4;1Hd${ESC}K`)
  })

  it('无相对移动序列（钳制漂移的根源）', () => {
    const s = fakeStream()
    const log = create(s)
    log('x\ny\nz')
    s.written = ''
    log('x\nY\nz')
    log('x\nY\nZ')
    // 相对移动序列（ESC[nA/B/E）一律不得出现——逐段扫描而非单个正则，
    // 因为模板拼接的 ESC 含未转义 `[` 会退化成字符类；控制字符正则也会触发 lint
    const relMoves = s.written
      .split('\x1b[')
      .slice(1)
      .map((rest) => rest.match(/^\d+[ABE]/) !== null)
    expect(relMoves).not.toContain(true)
  })

  it('光标锚定：setCursorPosition 后帧尾绝对定位（IME 锚点）', () => {
    const s = fakeStream()
    const log = create(s)
    log('hello')
    log.setCursorPosition({ x: 3, y: 0 })
    log('hello')
    expect(s.written).toContain(`${ESC}1;4H${ESC}?25h`) // y+1=1 行, x+1=4 列
  })

  it('光标单独变化：仅定位不重绘内容', () => {
    const s = fakeStream()
    const log = create(s)
    log('hello\nworld')
    s.written = ''
    log.setCursorPosition({ x: 2, y: 1 })
    log('hello\nworld') // 帧内容未变
    expect(s.written).toContain(`${ESC}2;3H`)
    expect(s.written).not.toContain('hello') // 不重写
  })

  it('内容与光标均未变：不写任何输出（willRender/返回 false）', () => {
    const s = fakeStream()
    const log = create(s)
    log('same')
    log.setCursorPosition({ x: 0, y: 0 })
    log('same') // 消费掉 cursorDirty
    s.written = ''
    expect(log.willRender('same')).toBe(false)
    expect(log('same')).toBe(false)
    expect(s.written).toBe('')
  })

  it('clear：归位 + 清屏 + 状态重置（下一帧全量重绘）', () => {
    const s = fakeStream()
    const log = create(s)
    log('a\nb')
    log.clear()
    expect(s.written).toContain(`${ESC}1;1H${ESC}0J`)
    s.written = ''
    log('x\ny')
    expect(s.written).toContain(`${ESC}1;1Hx${ESC}K`)
    expect(s.written).toContain(`${ESC}2;1Hy${ESC}K`)
  })

  it('resize 场景（宽度增大导致全行变化）：每帧独立绝对写，不依赖历史光标', () => {
    const s = fakeStream()
    const log = create(s)
    log('aaa\nbbb')
    // 模拟 maximize：所有行都变了
    s.written = ''
    log('AAA\nBBB')
    expect(s.written).toContain(`${ESC}1;1H`)
    expect(s.written).toContain(`${ESC}1;1HAAA${ESC}K`)
    expect(s.written).toContain(`${ESC}2;1HBBB${ESC}K`)
    const relMoves = s.written
      .split('\x1b[')
      .slice(1)
      .map((rest) => rest.match(/^\d+[ABE]/) !== null)
    expect(relMoves).not.toContain(true)
  })

  it('sync：采纳帧状态不重绘；done 后再 render 重新全量', () => {
    const s = fakeStream()
    const log = create(s)
    log('a')
    log.sync('a\nb') // 外部已画过 b？——采纳状态
    s.written = ''
    log('a\nb')
    expect(s.written).toBe('') // 与采纳状态一致 → 无输出
    log.done()
    s.written = ''
    log('a\nb')
    expect(s.written).toContain(`${ESC}1;1Ha${ESC}K`)
  })
})
