/// <reference types="vite/client" />
import type { SoyupmarkApi } from '@shared/ipc'

declare global {
  interface Window {
    soyupmark: SoyupmarkApi
  }
}

export {}
