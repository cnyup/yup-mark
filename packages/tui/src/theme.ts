/**
 * 主题系统（MT4，TUI.md §8）：7 套调色板（与桌面 CSS 变量同源），
 * 颜色 token 在渲染末端解析为 truecolor；亮色主题跟随终端背景（bg=null），
 * 暗色主题（github-dark/dracula）自绘背景（编辑行/面板/弹窗铺 bg）。
 */
export type ThemeName = 'yup' | 'github' | 'notion' | 'newsprint' | 'purple' | 'github-dark' | 'dracula'

export interface Palette {
  label: string
  /** 编辑区背景（null = 透明跟随终端） */
  bg: string | null
  /** 正文前景（null = 终端默认） */
  fg: string | null
  /** 面板/边框/激活强调色 */
  accent: string
  h1: string
  h2: string
  h3: string
  h4: string
  h5: string
  h6: string
  link: string
  codeInline: string
  math: string
  tableActive: string
  searchHit: string
  syntax: {
    keyword: string
    string: string
    number: string
    comment: string
    type: string
    function: string
    attr: string
    tag: string
  }
}

export const THEME_ORDER: ThemeName[] = [
  'yup',
  'github',
  'notion',
  'newsprint',
  'purple',
  'github-dark',
  'dracula',
]

export const PALETTES: Record<ThemeName, Palette> = {
  yup: {
    label: 'Yup 玫粉',
    bg: null,
    fg: null,
    accent: '#d63384',
    h1: '#d63384',
    h2: '#c2255c',
    h3: '#a61e4d',
    h4: '#862e9c',
    h5: '#5f3dc4',
    h6: '#3b5bdb',
    link: '#428bca',
    codeInline: '#d6336c',
    math: '#0ca678',
    tableActive: '#0c8599',
    searchHit: '#e8b339',
    syntax: {
      keyword: '#d63384',
      string: '#0ca678',
      number: '#e8b339',
      comment: '#868e96',
      type: '#0c8599',
      function: '#5f3dc4',
      attr: '#0c8599',
      tag: '#0ca678',
    },
  },
  github: {
    label: 'GitHub 蓝',
    bg: null,
    fg: null,
    accent: '#0969da',
    h1: '#0969da',
    h2: '#0550ae',
    h3: '#1168f0',
    h4: '#8250df',
    h5: '#57606a',
    h6: '#57606a',
    link: '#0969da',
    codeInline: '#953800',
    math: '#1a7f37',
    tableActive: '#0969da',
    searchHit: '#9a6700',
    syntax: {
      keyword: '#cf222e',
      string: '#0a3069',
      number: '#0550ae',
      comment: '#6e7781',
      type: '#953800',
      function: '#8250df',
      attr: '#0550ae',
      tag: '#116829',
    },
  },
  notion: {
    label: 'Notion 墨黑',
    bg: null,
    fg: '#37352f',
    accent: '#37352f',
    h1: '#000000',
    h2: '#1a1a1a',
    h3: '#2f2f2f',
    h4: '#4a4a4a',
    h5: '#6b6b6b',
    h6: '#8a8a8a',
    link: '#37352f',
    codeInline: '#eb5757',
    math: '#0b6bcb',
    tableActive: '#0b6bcb',
    searchHit: '#d9730d',
    syntax: {
      keyword: '#eb5757',
      string: '#0f7b6c',
      number: '#d9730d',
      comment: '#9b9a97',
      type: '#0b6bcb',
      function: '#9065b0',
      attr: '#0b6bcb',
      tag: '#0f7b6c',
    },
  },
  newsprint: {
    label: 'Newsprint 报纸',
    bg: null,
    fg: '#333333',
    accent: '#40597a',
    h1: '#40597a',
    h2: '#40597a',
    h3: '#5a7396',
    h4: '#5a7396',
    h5: '#777777',
    h6: '#777777',
    link: '#40597a',
    codeInline: '#8b5a2b',
    math: '#2f6b4f',
    tableActive: '#40597a',
    searchHit: '#9c6b1f',
    syntax: {
      keyword: '#8b3a3a',
      string: '#2f6b4f',
      number: '#9c6b1f',
      comment: '#999999',
      type: '#40597a',
      function: '#5a5a8a',
      attr: '#40597a',
      tag: '#2f6b4f',
    },
  },
  purple: {
    label: '静谧紫',
    bg: null,
    fg: null,
    accent: '#8250df',
    h1: '#8250df',
    h2: '#6639ba',
    h3: '#9a6fd8',
    h4: '#6f42c1',
    h5: '#8250df',
    h6: '#6e7781',
    link: '#6639ba',
    codeInline: '#6f42c1',
    math: '#1f7a8c',
    tableActive: '#6639ba',
    searchHit: '#b08500',
    syntax: {
      keyword: '#8250df',
      string: '#1f7a8c',
      number: '#b08500',
      comment: '#8b949e',
      type: '#6639ba',
      function: '#9a6fd8',
      attr: '#6639ba',
      tag: '#1f7a8c',
    },
  },
  'github-dark': {
    label: 'GitHub Dark',
    bg: '#0d1117',
    fg: '#e6edf3',
    accent: '#4493f8',
    h1: '#4493f8',
    h2: '#58a6ff',
    h3: '#79c0ff',
    h4: '#bc8cff',
    h5: '#8b949e',
    h6: '#8b949e',
    link: '#58a6ff',
    codeInline: '#ffa657',
    math: '#7ee787',
    tableActive: '#4493f8',
    searchHit: '#e3b341',
    syntax: {
      keyword: '#ff7b72',
      string: '#a5d6ff',
      number: '#79c0ff',
      comment: '#8b949e',
      type: '#ffa657',
      function: '#d2a8ff',
      attr: '#79c0ff',
      tag: '#7ee787',
    },
  },
  dracula: {
    label: 'Dracula',
    bg: '#282a36',
    fg: '#f8f8f2',
    accent: '#bd93f9',
    h1: '#ff79c6',
    h2: '#bd93f9',
    h3: '#8be9fd',
    h4: '#50fa7b',
    h5: '#f1fa8c',
    h6: '#6272a4',
    link: '#8be9fd',
    codeInline: '#ff79c6',
    math: '#50fa7b',
    tableActive: '#bd93f9',
    searchHit: '#f1fa8c',
    syntax: {
      keyword: '#ff79c6',
      string: '#f1fa8c',
      number: '#bd93f9',
      comment: '#6272a4',
      type: '#8be9fd',
      function: '#50fa7b',
      attr: '#50fa7b',
      tag: '#ff79c6',
    },
  },
}

let activeTheme: ThemeName = 'yup'

export function getTheme(): ThemeName {
  return activeTheme
}

export function setTheme(name: ThemeName): void {
  if (PALETTES[name] !== undefined) activeTheme = name
}

export function palette(): Palette {
  return PALETTES[activeTheme] ?? PALETTES.yup
}

/** token/原始色 → ink color；token 表外的原样透传（兼容直接 hex） */
export function resolveColor(token: string | undefined): string | undefined {
  if (token === undefined || token === '') return undefined
  const p = palette()
  switch (token) {
    case 'h1':
      return p.h1
    case 'h2':
      return p.h2
    case 'h3':
      return p.h3
    case 'h4':
      return p.h4
    case 'h5':
      return p.h5
    case 'h6':
      return p.h6
    case 'link':
      return p.link
    case 'codeInline':
      return p.codeInline
    case 'math':
      return p.math
    case 'tableActive':
      return p.tableActive
    case 'searchHit':
      return p.searchHit
    case 'accent':
      return p.accent
    case 'syntaxKeyword':
      return p.syntax.keyword
    case 'syntaxString':
      return p.syntax.string
    case 'syntaxNumber':
      return p.syntax.number
    case 'syntaxComment':
      return p.syntax.comment
    case 'syntaxType':
      return p.syntax.type
    case 'syntaxFunction':
      return p.syntax.function
    case 'syntaxAttr':
      return p.syntax.attr
    case 'syntaxTag':
      return p.syntax.tag
    default:
      return token // 原始色值（hex/终端色名）透传
  }
}

/** 面板/编辑区背景（亮色主题透明） */
export function resolveBg(): string | undefined {
  return palette().bg ?? undefined
}

/** 正文前景 */
export function resolveFg(): string | undefined {
  return palette().fg ?? undefined
}
