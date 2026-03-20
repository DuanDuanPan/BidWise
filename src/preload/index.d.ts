import type { FullPreloadApi } from '@shared/ipc-types'

declare global {
  interface Window {
    api: FullPreloadApi
  }
}
