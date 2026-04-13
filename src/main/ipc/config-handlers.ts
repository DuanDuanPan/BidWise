import { createIpcHandler } from './create-handler'
import { getAiProxyConfigStatus, saveAiProxyConfig } from '@main/config/app-config'
import { aiProxy } from '@main/services/ai-proxy'
import type { IpcChannel } from '@shared/ipc-types'

type ConfigChannel = Extract<IpcChannel, `config:${string}`>

const configHandlerMap: { [C in ConfigChannel]: () => void } = {
  'config:get-ai-status': () =>
    createIpcHandler('config:get-ai-status', async () => getAiProxyConfigStatus()),
  'config:save-ai': () =>
    createIpcHandler('config:save-ai', async (input) => {
      await saveAiProxyConfig(input)
      aiProxy.reset()
    }),
}

export type RegisteredConfigChannels = ConfigChannel

export function registerConfigHandlers(): void {
  for (const register of Object.values(configHandlerMap)) {
    register()
  }
}
