// mermaid sequenceDiagram 字符画（TUI.md §16-D18）：解析子集 / 渲染结构 / 降级护栏
import { describe, expect, it } from 'vitest'
import type { RenderSegment } from '../src/preview'
import { parseSequenceDiagram, renderMermaidSequence } from '../src/mermaid-sequence'
import { textWidth } from '../src/editor/measure'

const rowsText = (rows: RenderSegment[][]): string[] => rows.map((r) => r.map((s) => s.text).join(''))

const M3 = [
  'sequenceDiagram',
  '    participant U as 用户',
  '    participant E as 编辑器',
  '    U->>E: 输入中文',
  '    E-->>U: 组合期间锁定源码态',
  '    U->>E: 确认输入',
  '    E-->>U: 移开后恢复渲染',
].join('\n')

describe('parseSequenceDiagram', () => {
  it('participant/actor 声明与 as 别名', () => {
    const d = parseSequenceDiagram('sequenceDiagram\nparticipant U as 用户\nactor S')
    expect(d).not.toBeNull()
    expect(d!.participants).toEqual([
      { id: 'U', label: '用户' },
      { id: 'S', label: 'S' },
    ])
  })

  it('消息四类箭头 + 激活前缀剥除', () => {
    const d = parseSequenceDiagram(
      ['sequenceDiagram', 'A->>B: t1', 'A-->>B: t2', 'A-xB: t3', 'A--)B: t4', 'A->>+B: t5'].join('\n'),
    )
    expect(d).not.toBeNull()
    const msgs = d!.items.filter((it) => it.kind === 'message')
    expect(msgs).toHaveLength(5)
    expect(msgs[0]).toMatchObject({ from: 'A', to: 'B', line: 'solid', head: 'filled' })
    expect(msgs[1]).toMatchObject({ line: 'dashed', head: 'filled' })
    expect(msgs[2]).toMatchObject({ head: 'cross' })
    expect(msgs[3]).toMatchObject({ head: 'open' })
    expect(msgs[4]).toMatchObject({ to: 'B' }) // + 已剥除
  })

  it('结构行忽略（autonumber/activate/loop/alt/end）且块内消息平铺', () => {
    const d = parseSequenceDiagram(
      ['sequenceDiagram', 'autonumber', 'loop 最多三次', 'A->>B: 心跳', 'end', 'activate B', 'deactivate B'].join('\n'),
    )
    expect(d).not.toBeNull()
    expect(d!.items).toHaveLength(1)
  })

  it('Note 三种定位', () => {
    const d = parseSequenceDiagram(
      ['sequenceDiagram', 'Note over A,B: 双点', 'Note left of A: 左', 'Note right of B: 右'].join('\n'),
    )
    expect(d).not.toBeNull()
    expect(d!.items).toEqual([
      { kind: 'note', where: 'over', ids: ['A', 'B'], label: '双点' },
      { kind: 'note', where: 'left', ids: ['A'], label: '左' },
      { kind: 'note', where: 'right', ids: ['B'], label: '右' },
    ])
  })

  it('非 sequenceDiagram / 未知语法 → null', () => {
    expect(parseSequenceDiagram('flowchart TD\nA-->B')).toBeNull()
    expect(parseSequenceDiagram('sequenceDiagram\nA 不认识的行')).toBeNull()
    expect(parseSequenceDiagram('')).toBeNull()
  })
})

describe('renderMermaidSequence', () => {
  it('m3 样例：双参与者盒 + 生命线 + 实线/虚线箭头 + 标签', () => {
    const rows = rowsText(renderMermaidSequence(M3, 90)!)
    expect(rows[0]).toMatch(/┌.*┐/)
    expect(rows.some((r) => r.includes('│ 用户') && r.includes('编辑器'))).toBe(true)
    expect(rows.filter((r) => r.includes('│')).length).toBeGreaterThan(3) // 生命线
    expect(rows.some((r) => r.includes('输入中文'))).toBe(true)
    expect(rows.some((r) => r.includes('▶'))).toBe(true) // 实线箭头
    expect(rows.some((r) => r.includes('┄'))).toBe(true) // 虚线箭头
    expect(rows.some((r) => r.includes('◀'))).toBe(true) // 反向虚线箭头
  })

  it('宽度契约：每行显示宽度不超限、无尾随空格', () => {
    const rows = rowsText(renderMermaidSequence(M3, 90)!)
    expect(rows.every((r) => textWidth(r) <= 90)).toBe(true)
    expect(rows.every((r) => r === '' || !r.endsWith(' '))).toBe(true)
  })

  it('自环消息渲染回勾', () => {
    const rows = rowsText(renderMermaidSequence('sequenceDiagram\nA->>A: 自言自语', 40)!)
    expect(rows.some((r) => r.includes('──┐'))).toBe(true)
    expect(rows.some((r) => r.includes('←──┘'))).toBe(true)
    expect(rows.some((r) => r.includes('自言自语'))).toBe(true)
  })

  it('Note over 双点跨参与者、left 贴边钳制', () => {
    const rows = rowsText(
      renderMermaidSequence(
        ['sequenceDiagram', 'participant A as 甲', 'participant B as 乙', 'Note over A,B: 覆盖', 'A->>B: hi'].join('\n'),
        60,
      )!,
    )
    const labelIdx = rows.findIndex((r) => r.includes('覆盖'))
    expect(labelIdx).toBeGreaterThan(0)
    expect(rows[labelIdx - 1]).toContain('┌') // 盒顶边
    expect(rows[labelIdx]).toContain('覆盖') // 盒标签行
    expect(rows[labelIdx]).toContain('│') // 盒边框
    expect(rows[labelIdx + 1]).toContain('└') // 盒底边
  })

  it('title 渲染、actor 同 participant', () => {
    const rows = rowsText(
      renderMermaidSequence('sequenceDiagram\ntitle 流程\nactor U as 用户\nU->>U: x', 40)!,
    )
    expect(rows.some((r) => r.includes('流程'))).toBe(true)
  })

  it('降级护栏：超宽 / 参与者过多 → null（回落占位框）', () => {
    expect(renderMermaidSequence(M3, 10)).toBeNull()
    const many = ['sequenceDiagram', ...Array.from({ length: 9 }, (_, i) => `participant P${i}`)].join('\n')
    expect(renderMermaidSequence(many, 200)).toBeNull()
  })
})
