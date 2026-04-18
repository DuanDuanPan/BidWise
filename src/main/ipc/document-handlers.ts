import { ipcMain, type IpcMainEvent } from 'electron'
import { createIpcHandler } from './create-handler'
import { documentService } from '@main/services/document-service'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type {
  ApiResponse,
  DocumentSaveOutput,
  DocumentSaveSyncInput,
  IpcChannel,
} from '@shared/ipc-types'

type DocumentChannel = Extract<IpcChannel, `document:${string}`>

const documentHandlerMap: { [C in DocumentChannel]: () => void } = {
  'document:load': () =>
    createIpcHandler('document:load', ({ projectId }) => documentService.load(projectId)),
  'document:save': () =>
    createIpcHandler('document:save', ({ projectId, content, debugContext, debugTrail }) =>
      documentService.save(projectId, content, debugContext, debugTrail)
    ),
  'document:get-metadata': () =>
    createIpcHandler('document:get-metadata', ({ projectId }) =>
      documentService.getMetadata(projectId)
    ),
  'document:mark-skeleton-confirmed': () =>
    createIpcHandler('document:mark-skeleton-confirmed', ({ projectId }) =>
      documentService.markSkeletonConfirmed(projectId)
    ),
}

export type RegisteredDocumentChannels = DocumentChannel

function handleDocumentSaveSync(event: IpcMainEvent, input: DocumentSaveSyncInput): void {
  try {
    const data = documentService.saveSync(
      input.projectId,
      input.rootPath,
      input.content,
      input.debugContext,
      input.debugTrail
    )
    event.returnValue = { success: true, data } as ApiResponse<DocumentSaveOutput>
  } catch (error) {
    if (error instanceof BidWiseError) {
      event.returnValue = {
        success: false,
        error: { code: error.code, message: error.message },
      } as ApiResponse<DocumentSaveOutput>
      return
    }

    event.returnValue = {
      success: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    } as ApiResponse<DocumentSaveOutput>
  }
}

function registerDocumentSaveSyncHandler(): void {
  ipcMain.removeListener(IPC_CHANNELS.DOCUMENT_SAVE_SYNC, handleDocumentSaveSync)
  ipcMain.on(IPC_CHANNELS.DOCUMENT_SAVE_SYNC, handleDocumentSaveSync)
}

export function registerDocumentHandlers(): void {
  for (const register of Object.values(documentHandlerMap)) {
    register()
  }
  registerDocumentSaveSyncHandler()
}
