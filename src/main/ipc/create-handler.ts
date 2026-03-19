import { ipcMain } from 'electron'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import type { ApiResponse, IpcChannel, IpcChannelMap } from '@shared/ipc-types'

export function createIpcHandler<C extends IpcChannel>(
  channel: C,
  handler: (input: IpcChannelMap[C]['input']) => Promise<IpcChannelMap[C]['output']>
): void {
  ipcMain.handle(channel, async (_event, input) => {
    try {
      const data = await handler(input)
      return { success: true, data } as ApiResponse<IpcChannelMap[C]['output']>
    } catch (error) {
      if (error instanceof BidWiseError) {
        return {
          success: false,
          error: { code: error.code, message: error.message },
        } as ApiResponse<IpcChannelMap[C]['output']>
      }
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      } as ApiResponse<IpcChannelMap[C]['output']>
    }
  })
}
