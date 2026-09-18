/**
 * 内联 SVG 图标（16px 线性风格，currentColor 继承主题色）。
 * 无第三方图标库依赖，保持包体精简。
 */
import type { SVGProps } from 'react'

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>

function base(size: number): { width: number; height: number; viewBox: string; fill: string; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' } {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
}

/** 侧栏开关（窗口右上角） */
export function IconPanel(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

/** 文件面板（文件夹） */
export function IconFolder(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

/** 大纲面板（列表行） */
export function IconOutline(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

/** 搜索 */
export function IconSearch(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

/** 新建文件 */
export function IconPlus(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 12h14M12 5v14" />
    </svg>
  )
}

/** 新建文件夹 */
export function IconFolderPlus(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M12 10v6M9 13h6" />
    </svg>
  )
}

/** 树视图 */
export function IconTree(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M21 12h-8M21 6H8M21 18h-8M3 6v4c0 1.1.9 2 2 2h3" />
    </svg>
  )
}

/** 平铺列表视图 */
export function IconList(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

/** 下箭头（操作菜单） */
export function IconChevronDown(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** 关闭/清除 */
export function IconX(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/** 勾选（排序选项） */
export function IconCheck(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** 文档（文件行） */
export function IconDoc(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

/** 修改时间（时钟） */
export function IconClock(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** 创建时间（时钟 + 角标加号） */
export function IconClockPlus(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="11" cy="13" r="8" />
      <path d="M11 9v4l3 2" />
      <path d="M18 2v4M16 4h4" />
    </svg>
  )
}

function textGlyph(label: string): React.ReactNode {
  return (
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="9.5"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
      fontFamily="inherit"
    >
      {label}
    </text>
  )
}

/** 按文件名排序（升序） */
export function IconAZ(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>{textGlyph('A-Z')}</svg>
  )
}

/** 自然排序（降序） */
export function IconZA(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>{textGlyph('Z-A')}</svg>
  )
}

/** 设置（齿轮，侧栏底栏入口） */
export function IconSettings(props: IconProps) {
  const { size = 16, ...rest } = props
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}
