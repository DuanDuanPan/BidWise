import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockList = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

vi.mock('@main/services/annotation-service', () => ({
  annotationService: {
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
    list: mockList,
  },
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { BidWiseError }
})

vi.mock('@shared/constants', () => ({
  ErrorCode: { UNKNOWN: 'UNKNOWN' },
}))

import { registerAnnotationHandlers } from '@main/ipc/annotation-handlers'

describe('annotation-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all four annotation channels', () => {
    registerAnnotationHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('annotation:create')
    expect(registeredChannels).toContain('annotation:update')
    expect(registeredChannels).toContain('annotation:delete')
    expect(registeredChannels).toContain('annotation:list')
    expect(registeredChannels).toHaveLength(4)
  })

  it('annotation:create handler wraps response in success envelope', async () => {
    mockCreate.mockResolvedValue({ id: 'ann-1', content: 'test' })
    registerAnnotationHandlers()

    const createHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'annotation:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await createHandler(
      {},
      { projectId: 'p1', sectionId: 's1', type: 'human', content: 'test', author: 'u1' }
    )

    expect(result).toEqual({ success: true, data: { id: 'ann-1', content: 'test' } })
  })

  it('annotation:create handler wraps error in failure envelope', async () => {
    mockCreate.mockRejectedValue(new Error('fail'))
    registerAnnotationHandlers()

    const createHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'annotation:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await createHandler(
      {},
      { projectId: 'p1', sectionId: 's1', type: 'human', content: 'test', author: 'u1' }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'UNKNOWN', message: 'fail' },
    })
  })

  it('annotation:delete handler passes id from input', async () => {
    mockDelete.mockResolvedValue(undefined)
    registerAnnotationHandlers()

    const deleteHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'annotation:delete'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    await deleteHandler({}, { id: 'ann-1' })

    expect(mockDelete).toHaveBeenCalledWith('ann-1')
  })
})
