/**
 * Radix Dialog 封装：外壳 DOM 结构与既有 CSS 类名一致（.modal-overlay + .modal），
 * 只借 Radix 的焦点圈定 / Esc / 外点关闭 / aria 与滚动锁定。视觉零改动。
 */
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode, RefObject } from 'react'

export function Modal({
  onClose,
  initialFocus,
  children,
}: {
  /** Esc / 点击遮罩 / 关闭按钮 → 统一回调 */
  onClose: () => void
  /** 打开时聚焦的元素（如 PromptModal 的输入框）；缺省聚焦首个可聚焦元素 */
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <div className="modal-overlay" />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          onOpenAutoFocus={(e) => {
            if (initialFocus?.current) {
              e.preventDefault()
              initialFocus.current.focus()
            }
          }}
        >
          <div className="modal">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
