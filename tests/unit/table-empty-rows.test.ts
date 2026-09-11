// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditorState } from '@yupmark/live-cm/extensions'

/**
 * 回归：GFM 解析器对全空单元格行（| | |）不产出 TableCell，
 * 且新版 lezer-markdown 的 TableHeader 直接挂 TableCell（无 TableRow）。
 * 两者都会导致表格丢样式/表头为空 —— 渲染层必须补齐。
 */
describe('表格空行与表头结构回归', () => {
  it('表头有内容，空行与短行列数补齐到表头', async () => {
    const doc = '功能 | 说明 | 备注\n--- | --- | ---\n截图 | take a screenshot | 截取屏幕并保存\n| | |\n| | | |\n'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: createEditorState(doc, doc.length), parent: host })
    await new Promise((r) => setTimeout(r, 150))

    const wrap = host.querySelector('.cm-table-wrap')
    expect(wrap).toBeTruthy()
    const rows = Array.from(wrap!.querySelectorAll('tr'))
    expect(rows).toHaveLength(4) // 表头 + 3 数据行
    for (const tr of rows) expect(tr.querySelectorAll('th,td')).toHaveLength(3)
    const ths = Array.from(wrap!.querySelectorAll('th'))
    expect(ths.map((t) => t.textContent)).toEqual(['功能', '说明', '备注'])

    view.destroy()
    host.remove()
  })
})
