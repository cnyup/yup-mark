// mermaid flowchart 字符画（TUI.md §16-D18 路线 B）：解析子集 / TD·LR 渲染 / 降级护栏
import { describe, expect, it } from 'vitest'
import type { RenderSegment } from '../src/preview'
import { parseFlowchart, renderMermaidFlowchart } from '../src/mermaid-flowchart'
import { textWidth } from '../src/editor/measure'

const rowsText = (rows: RenderSegment[][]): string[] => rows.map((r) => r.map((s) => s.text).join(''))

const M3 = [
  'graph TD',
  '    A[打开 YupMark] --> B{光标在块内?}',
  '    B -->|是| C[显示源码]',
  '    B -->|否| D[渲染富文本]',
  '    C --> D',
  '    D --> D',
].join('\n')

describe('parseFlowchart', () => {
  it('方向/形状/边标签解析', () => {
    const f = parseFlowchart('flowchart LR\nA[开始] --> B{判断}\nB -->|是| C(圆角)\nC -.-> D([药丸])')
    expect(f).not.toBeNull()
    expect(f!.dir).toBe('LR')
    const by = new Map(f!.nodes.map((n) => [n.id, n]))
    expect(by.get('A')!.shape).toBe('rect')
    expect(by.get('B')!.shape).toBe('diamond')
    expect(by.get('C')!.shape).toBe('round')
    expect(by.get('D')!.shape).toBe('stadium')
    expect(f!.edges[0]).toMatchObject({ from: 'A', to: 'B', label: '' })
    expect(f!.edges[1]!.label).toBe('是')
  })

  it('链式语句 = 多条边', () => {
    expect(parseFlowchart('graph TD\nA --> B --> C')!.edges).toHaveLength(2)
  })

  it('内联/管道/点线/粗线边与开箭头', () => {
    expect(parseFlowchart('graph TD\nA -- 是 --> B')!.edges[0]!.label).toBe('是')
    expect(parseFlowchart('graph TD\nA -. 点 .-> B')!.edges[0]!.label).toBe('点')
    expect(parseFlowchart('graph TD\nA ==> B')!.edges[0]!.arrow).toBe('arrow')
    expect(parseFlowchart('graph TD\nA --- B')!.edges[0]!.arrow).toBe('open')
    expect(parseFlowchart('graph TD\nA --o B')!.edges[0]!.arrow).toBe('arrow')
  })

  it('裸引用以 id 为标签；后置显式定义覆盖', () => {
    const f = parseFlowchart('graph TD\nA --> B\nA[重置]')
    const by = new Map(f!.nodes.map((n) => [n.id, n]))
    expect(by.get('B')!.label).toBe('B')
    expect(by.get('A')!.label).toBe('重置')
  })

  it('引号标签可含括号；实体解码', () => {
    const f = parseFlowchart('graph TD\nA["a [b]"] --> B[x &amp; y]')
    const by = new Map(f!.nodes.map((n) => [n.id, n]))
    expect(by.get('A')!.label).toBe('a [b]')
    expect(by.get('B')!.label).toBe('x & y')
  })

  it('%% 注释与 classDef 等指令行忽略', () => {
    const f = parseFlowchart(['graph TD', '%% 注释', 'classDef cls fill:#f00', 'A --> B'].join('\n'))
    expect(f!.edges).toHaveLength(1)
  })

  it('不支持语法整体返回 null（降级占位框，绝不画错图）', () => {
    expect(parseFlowchart('sequenceDiagram\n  A->>B: hi')).toBeNull()
    expect(parseFlowchart('flowchart BT\nA-->B')).toBeNull()
    expect(parseFlowchart('flowchart RL\nA-->B')).toBeNull()
    expect(parseFlowchart('flowchart TD\nsubgraph x\nA-->B\nend')).toBeNull()
    expect(parseFlowchart('flowchart TD\nA => B')).toBeNull()
    expect(parseFlowchart('')).toBeNull()
  })
})

describe('renderMermaidFlowchart TD', () => {
  it('m3 样例：盒子/菱形/边标签/跳层檐列/自环', () => {
    const art = renderMermaidFlowchart(M3, 80)
    expect(art).not.toBeNull()
    const rows = rowsText(art!)
    expect(rows.some((r) => r.includes('│ 打开 YupMark │'))).toBe(true)
    expect(rows.some((r) => r.includes('光标在块内?'))).toBe(true)
    expect(rows.some((r) => r.includes('是'))).toBe(true)
    expect(rows.some((r) => r.includes('否'))).toBe(true)
    expect(rows.some((r) => r.includes('↓'))).toBe(true)
    expect(rows.some((r) => r.includes('↑'))).toBe(true) // 自环回底边
  })

  it('宽度契约：每行显示宽度不超限、无尾随空格', () => {
    const rows = rowsText(renderMermaidFlowchart(M3, 80)!)
    expect(rows.every((r) => textWidth(r) <= 80)).toBe(true)
    expect(rows.every((r) => r === '' || !r.endsWith(' '))).toBe(true)
  })

  it('回边（环）经右侧檐列进入', () => {
    const rows = rowsText(renderMermaidFlowchart(['flowchart TD', 'A --> B', 'B --> C', 'C --> B'].join('\n'), 60)!)
    expect(rows.some((r) => r.includes('→'))).toBe(true)
    expect(rows.every((r) => textWidth(r) <= 60)).toBe(true)
  })

  it('菱形/体育场形状字符画', () => {
    const rows = rowsText(
      renderMermaidFlowchart('flowchart TD\nS([入口]) --> Q{判断?}\nQ --> E', 60)!,
    )
    expect(rows.some((r) => r.includes('( 入口 )'))).toBe(true)
    expect(rows.some((r) => r.includes('╱'))).toBe(true)
  })
})

describe('renderMermaidFlowchart LR', () => {
  it('横向主流程 + 分支', () => {
    const rows = rowsText(
      renderMermaidFlowchart(
        ['flowchart LR', '开始([开始]) --> 判断{ok?}', '判断 -->|是| 结束[结束]', '判断 -->|否| 重试(重试)'].join('\n'),
        80,
      )!,
    )
    expect(rows.some((r) => r.includes('( 开始 )'))).toBe(true)
    expect(rows.some((r) => r.includes('→'))).toBe(true)
    expect(rows.every((r) => textWidth(r) <= 80)).toBe(true)
  })
})

describe('降级护栏', () => {
  it('非 flowchart / 超宽 / 超大规模 → null（调用方回落占位框）', () => {
    expect(renderMermaidFlowchart('sequenceDiagram\n  A->>B: hi', 80)).toBeNull()
    expect(renderMermaidFlowchart('flowchart TD\nA[很长很长的标签] --> B', 10)).toBeNull()
    const many = ['flowchart TD', ...Array.from({ length: 41 }, (_, i) => `N${i} --> N${i + 1}`)].join('\n')
    expect(renderMermaidFlowchart(many, 80)).toBeNull()
  })
})
