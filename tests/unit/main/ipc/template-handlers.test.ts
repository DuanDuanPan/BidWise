import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateIpcHandler = vi.hoisted(() => vi.fn())
const mockTemplateService = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  generateSkeleton: vi.fn(),
  persistSkeleton: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('@main/ipc/create-handler', () => ({
  createIpcHandler: (...args: unknown[]) => mockCreateIpcHandler(...args),
}))

vi.mock('@main/services/template-service', () => ({
  templateService: mockTemplateService,
}))

import { registerTemplateHandlers } from '@main/ipc/template-handlers'

describe('template-handlers @story-3-3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all four template channels', () => {
    registerTemplateHandlers()
    expect(mockCreateIpcHandler).toHaveBeenCalledTimes(4)
  })

  it('registers template:list channel', () => {
    registerTemplateHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const listCall = calls.find((c: unknown[]) => c[0] === 'template:list')
    expect(listCall).toBeDefined()
  })

  it('registers template:get channel', () => {
    registerTemplateHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const getCall = calls.find((c: unknown[]) => c[0] === 'template:get')
    expect(getCall).toBeDefined()
  })

  it('registers template:generate-skeleton channel', () => {
    registerTemplateHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const genCall = calls.find((c: unknown[]) => c[0] === 'template:generate-skeleton')
    expect(genCall).toBeDefined()
  })

  it('registers template:persist-skeleton channel', () => {
    registerTemplateHandlers()
    const calls = mockCreateIpcHandler.mock.calls
    const persistCall = calls.find((c: unknown[]) => c[0] === 'template:persist-skeleton')
    expect(persistCall).toBeDefined()
  })

  it('template:list handler delegates to templateService.listTemplates', async () => {
    mockTemplateService.listTemplates.mockResolvedValue([])
    registerTemplateHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'template:list'
    )?.[1] as () => Promise<unknown>
    await handler()
    expect(mockTemplateService.listTemplates).toHaveBeenCalled()
  })

  it('template:get handler delegates to templateService.getTemplate', async () => {
    mockTemplateService.getTemplate.mockResolvedValue({})
    registerTemplateHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'template:get'
    )?.[1] as (input: { templateId: string }) => Promise<unknown>
    await handler({ templateId: 'test' })
    expect(mockTemplateService.getTemplate).toHaveBeenCalledWith('test')
  })

  it('template:generate-skeleton handler delegates to templateService.generateSkeleton', async () => {
    const input = { projectId: 'p1', templateId: 't1' }
    mockTemplateService.generateSkeleton.mockResolvedValue({})
    registerTemplateHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'template:generate-skeleton'
    )?.[1] as (input: unknown) => Promise<unknown>
    await handler(input)
    expect(mockTemplateService.generateSkeleton).toHaveBeenCalledWith(input)
  })

  it('template:persist-skeleton handler delegates to templateService.persistSkeleton', async () => {
    const input = { projectId: 'p1', templateId: 't1', skeleton: [] }
    mockTemplateService.persistSkeleton.mockResolvedValue({})
    registerTemplateHandlers()
    const handler = mockCreateIpcHandler.mock.calls.find(
      (c: unknown[]) => c[0] === 'template:persist-skeleton'
    )?.[1] as (input: unknown) => Promise<unknown>
    await handler(input)
    expect(mockTemplateService.persistSkeleton).toHaveBeenCalledWith(input)
  })
})
