import type { PreloadApi } from '@shared/ipc-types'

declare global {
  interface Window {
    api: PreloadApi
  }
}
