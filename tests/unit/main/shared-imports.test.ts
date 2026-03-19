import { describe, it, expect } from 'vitest'
import { ErrorCode, APP_NAME } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type { ApiResponse } from '@shared/ipc-types'

describe('shared module imports (main process)', () => {
  it('should import constants', () => {
    expect(APP_NAME).toBe('BidWise')
    expect(ErrorCode.UNKNOWN).toBe('UNKNOWN')
    expect(ErrorCode.VALIDATION).toBe('VALIDATION')
  })

  it('should import IPC channel types', () => {
    expect(IPC_CHANNELS.PROJECT_CREATE).toBe('project:create')
    expect(IPC_CHANNELS.PROJECT_LIST).toBe('project:list')
    expect(IPC_CHANNELS.PROJECT_GET).toBe('project:get')
  })

  it('should use ApiResponse type correctly', () => {
    const success: ApiResponse<string> = { success: true, data: 'test' }
    const failure: ApiResponse<string> = {
      success: false,
      error: { code: 'TEST', message: 'test error' },
    }
    expect(success.success).toBe(true)
    expect(failure.success).toBe(false)
  })
})
