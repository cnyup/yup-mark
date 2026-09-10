/// <reference types="vite/client" />
import type { YupmarkApi } from '@shared/ipc'

declare global {
  interface Window {
    yupmark: YupmarkApi
  }
}

export {}
