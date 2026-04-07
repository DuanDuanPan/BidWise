import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateIpcHandler = vi.hoisted(() => vi.fn())
const mockWritingStyleService = vi.hoisted(() => ({
  listStyles: vi.fn(),
  getStyle: vi.fn(),
  updateProjectWritingStyle: vi.fn(),
  getProjectWritingStyle: vi.fn(),
  clearCache: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('@main/ipc/create-handler', () => ({
  createIpcHandler: (...args: unknown[]) => mockCreateIpcHandler(...args),
}))

vi.mock('@main/services/writing-style-service', () => ({
  writingStyleService: mockWritingStyleService,
}))

import { registerWritingStyleHandlers } from '@main/ipc/writing-style-handlers'

describe('@story-3-6 writing-style-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all three writing-style channels', () => {
    registerWritingStyleHandlers()
    expect(mockCreateIpcHandler).toHaveBeenCalledTimes(3)
  })

  it('registers writing-style:list channel', () => {
    registerWritingStyleHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const listCall = calls.find((c: unknown[]) => c[0] === 'writing-style:list')
    expect(listCall).toBeDefined()
  })

  it('registers writing-style:get channel', () => {
    registerWritingStyleHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const getCall = calls.find((c: unknown[]) => c[0] === 'writing-style:get')
    expect(getCall).toBeDefined()
  })

  it('registers writing-style:update-project channel', () => {
    registerWritingStyleHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const updateCall = calls.find((c: unknown[]) => c[0] === 'writing-style:update-project')
    expect(updateCall).toBeDefined()
  })

  it('writing-style:list handler delegates to writingStyleService.listStyles', async () => {
    const mockStyles = [{ id: 'general', name: '通用文风' }]
    mockWritingStyleService.listStyles.mockResolvedValue(mockStyles)
    registerWritingStyleHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'writing-style:list'
    )?.[1] as () => Promise<unknown>
    const result = await handler()
    expect(mockWritingStyleService.listStyles).toHaveBeenCalled()
    expect(result).toEqual({ styles: mockStyles })
  })

  it('writing-style:get handler delegates to writingStyleService.getStyle', async () => {
    const mockStyle = { id: 'military', name: '军工文风' }
    mockWritingStyleService.getStyle.mockResolvedValue(mockStyle)
    registerWritingStyleHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'writing-style:get'
    )?.[1] as (input: { styleId: string }) => Promise<unknown>
    const result = await handler({ styleId: 'military' })
    expect(mockWritingStyleService.getStyle).toHaveBeenCalledWith('military')
    expect(result).toEqual({ style: mockStyle })
  })

  it('writing-style:update-project handler delegates to writingStyleService.updateProjectWritingStyle', async () => {
    mockWritingStyleService.updateProjectWritingStyle.mockResolvedValue({
      writingStyleId: 'military',
    })
    registerWritingStyleHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'writing-style:update-project'
    )?.[1] as (input: { projectId: string; writingStyleId: string }) => Promise<unknown>
    const result = await handler({ projectId: 'proj-1', writingStyleId: 'military' })
    expect(mockWritingStyleService.updateProjectWritingStyle).toHaveBeenCalledWith(
      'proj-1',
      'military'
    )
    expect(result).toEqual({ writingStyleId: 'military' })
  })
})
