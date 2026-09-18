/**
 * Radix Tooltip 封装：替代原 data-tip 纯 CSS 提示（补键盘聚焦可达性）。
 * 视觉沿用原 ::after 样式（.tip 类），方位映射 data-tip-pos → side。
 */
import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function Tip({
  text,
  side = 'right',
  children,
}: {
  text: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
}) {
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side={side} sideOffset={8} className="tip">
            {text}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
