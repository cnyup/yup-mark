/**
 * TUI 侧编辑器状态工厂（MT0）。
 *
 * 解析器配置与内核 extensions.ts 的 baseExtensions 对齐
 * （markdownLanguage 自带 GFM：表格/删除线/任务列表；外加代码块嵌语言与行内数学），
 * 但不挂 view 专属扩展（lineWrapping/keymap/liveRender 视图层）——
 * TUI 的装饰经 buildLiveDecorations 直取，不经 EditorView。
 *
 * MT1 起本文件将生长为事务调度宿主（dispatch 包装、字段同步、视口维护）。
 */
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { mathSyntax } from '@yupmark/live-cm/mathSyntax'
import { sourceModeField, focusModeField, typewriterModeField } from '@yupmark/live-cm/viewModes'

/** 创建无头编辑状态：doc + 光标位置（默认文末） */
export function docState(doc: string, anchor?: number): EditorState {
  // 行尾归一化：CM6 建 doc 时把 \r\n 折叠成 \n，原始长度算的 anchor 会越界
  const normalized = doc.replace(/\r\n?/g, '\n')
  return EditorState.create({
    doc: normalized,
    extensions: [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: mathSyntax,
        addKeymap: false, // 键位由 TUI 的 keys.ts 翻译（MT1），不要 CM 的 DOM 键表
      }),
      // 视图三件套字段（无头可 dispatch；桌面在 liveRender 内注册，TUI 显式挂载）
      sourceModeField,
      focusModeField,
      typewriterModeField,
    ],
    selection: { anchor: Math.min(anchor ?? normalized.length, normalized.length) },
  })
}
