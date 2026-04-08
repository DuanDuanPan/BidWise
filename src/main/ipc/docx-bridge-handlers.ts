import { createIpcHandler } from './create-handler'
import { docxBridgeService } from '@main/services/docx-bridge'
import type { IpcChannel } from '@shared/ipc-types'

type DocxBridgeChannel = Extract<IpcChannel, `docx:${string}`>

const docxBridgeHandlerMap: { [C in DocxBridgeChannel]: () => void } = {
  'docx:render': () =>
    createIpcHandler('docx:render', (input) => docxBridgeService.renderDocx(input)),
  'docx:health': () => createIpcHandler('docx:health', () => docxBridgeService.getHealth()),
}

export type RegisteredDocxBridgeChannels = DocxBridgeChannel

export function registerDocxBridgeHandlers(): void {
  for (const register of Object.values(docxBridgeHandlerMap)) {
    register()
  }
}
