/**
 * @yupmark/live-cm 的种子模块（M1 起承载块级实时渲染引擎）。
 * 本目录约束：纯 TypeScript，零 React、零 Electron 依赖。
 */
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { markdownHighlighting } from './highlight'
import { languages } from '@codemirror/language-data'
import { liveRender, tableAndFormatKeys } from './engine'
import { mathSyntax } from './mathSyntax'

/** 基础编辑能力：Markdown 语言 + GFM + 行内数学、历史、换行、源码高亮、查找替换 + 实时渲染引擎 */
export function baseExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    history(),
    markdownHighlighting,
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      extensions: mathSyntax,
      addKeymap: true,
    }),
    // 查找替换（面板样式由外壳 CSS 覆盖为 Typora 风）；Typora 键位（⌘F/⌥⌘F/Ctrl+H）在 tableAndFormatKeys
    search({ top: true }),
    tableAndFormatKeys,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    liveRender(),
  ]
}

/** 创建编辑器状态（用于测试与初始化）；anchor 指定初始光标位置，extra 附加扩展 */
export function createEditorState(doc: string, anchor?: number, extra?: Extension[]): EditorState {
  return EditorState.create({
    doc,
    extensions: extra ? [...baseExtensions(), ...extra] : baseExtensions(),
    selection: anchor === undefined ? undefined : { anchor },
  })
}
