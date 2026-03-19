import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'
import { createIpcHandler } from '@main/ipc/create-handler'
import { BidWiseError, NotFoundError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

describe('createIpcHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers handler on the specified channel', () => {
    const handler = vi.fn()
    createIpcHandler('project:create', handler)

    expect(ipcMain.handle).toHaveBeenCalledWith('project:create', expect.any(Function))
  })

  it('wraps successful result in ApiResponse { success: true, data }', async () => {
    const mockData = { id: '1', name: 'test', createdAt: '', updatedAt: '' }
    const handler = vi.fn().mockResolvedValue(mockData)

    createIpcHandler('project:create', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, { name: 'test', rootPath: '/tmp' })

    expect(result).toEqual({ success: true, data: mockData })
    expect(handler).toHaveBeenCalledWith({ name: 'test', rootPath: '/tmp' })
  })

  it('wraps BidWiseError in ApiResponse { success: false, error: { code, message } }', async () => {
    const handler = vi.fn().mockRejectedValue(new NotFoundError('Project not found'))

    createIpcHandler('project:get', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, 'non-existent-id')

    expect(result).toEqual({
      success: false,
      error: { code: ErrorCode.NOT_FOUND, message: 'Project not found' },
    })
  })

  it('wraps ValidationError with correct error code', async () => {
    const handler = vi.fn().mockRejectedValue(new ValidationError('Name is required'))

    createIpcHandler('project:create', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, { name: '', rootPath: '' })

    expect(result).toEqual({
      success: false,
      error: { code: ErrorCode.VALIDATION, message: 'Name is required' },
    })
  })

  it('wraps unknown Error with UNKNOWN error code', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Something went wrong'))

    createIpcHandler('project:delete', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, 'some-id')

    expect(result).toEqual({
      success: false,
      error: { code: ErrorCode.UNKNOWN, message: 'Something went wrong' },
    })
  })

  it('wraps non-Error thrown value with UNKNOWN code and fallback message', async () => {
    const handler = vi.fn().mockRejectedValue('raw string error')

    createIpcHandler('project:archive', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, 'some-id')

    expect(result).toEqual({
      success: false,
      error: { code: ErrorCode.UNKNOWN, message: 'Unknown error' },
    })
  })

  it('does not leak stack trace in error response', async () => {
    const error = new BidWiseError(ErrorCode.DATABASE, 'DB connection failed')
    const handler = vi.fn().mockRejectedValue(error)

    createIpcHandler('project:list', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).not.toHaveProperty('stack')
      expect(Object.keys(result.error)).toEqual(['code', 'message'])
    }
  })

  it('handles void output channels correctly', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)

    createIpcHandler('project:delete', handler)

    const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
    const result = await registeredCallback({}, 'some-id')

    expect(result).toEqual({ success: true, data: undefined })
  })
})
