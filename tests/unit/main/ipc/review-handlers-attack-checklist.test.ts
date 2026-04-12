import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateIpcHandler = vi.fn()
const mockGenerate = vi.fn()
const mockGetChecklist = vi.fn()
const mockUpdateItemStatus = vi.fn()

vi.mock('@main/ipc/create-handler', () => ({
  createIpcHandler: (...args: unknown[]) => mockCreateIpcHandler(...args),
}))

vi.mock('@main/services/adversarial-lineup-service', () => ({
  adversarialLineupService: {
    generate: vi.fn(),
    getLineup: vi.fn(),
    updateRoles: vi.fn(),
    confirmLineup: vi.fn(),
  },
}))

vi.mock('@main/services/adversarial-review-service', () => ({
  adversarialReviewService: {
    startExecution: vi.fn(),
    getReview: vi.fn(),
    handleFinding: vi.fn(),
    retryRole: vi.fn(),
  },
}))

vi.mock('@main/services/attack-checklist-service', () => ({
  attackChecklistService: {
    generate: (...args: unknown[]) => mockGenerate(...args),
    getChecklist: (...args: unknown[]) => mockGetChecklist(...args),
    updateItemStatus: (...args: unknown[]) => mockUpdateItemStatus(...args),
  },
}))

describe('review-handlers attack-checklist channels @story-7-5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 11 review channels including 3 new attack-checklist channels', async () => {
    const { registerReviewHandlers } = await import('@main/ipc/review-handlers')
    registerReviewHandlers()

    // Should call createIpcHandler 11 times (8 existing + 3 new)
    expect(mockCreateIpcHandler).toHaveBeenCalledTimes(11)

    const registeredChannels = mockCreateIpcHandler.mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toContain('review:generate-attack-checklist')
    expect(registeredChannels).toContain('review:get-attack-checklist')
    expect(registeredChannels).toContain('review:update-checklist-item-status')
  })

  it('generate-attack-checklist handler delegates to service.generate', async () => {
    const { registerReviewHandlers } = await import('@main/ipc/review-handlers')
    registerReviewHandlers()

    // Find the generate-attack-checklist handler
    const generateCall = mockCreateIpcHandler.mock.calls.find(
      (call: unknown[]) => call[0] === 'review:generate-attack-checklist'
    )
    expect(generateCall).toBeDefined()

    // Call the handler function
    const handler = generateCall![1] as (input: { projectId: string }) => Promise<unknown>
    mockGenerate.mockResolvedValue({ taskId: 'task-1' })
    await handler({ projectId: 'proj-1' })
    expect(mockGenerate).toHaveBeenCalledWith('proj-1')
  })

  it('get-attack-checklist handler delegates to service.getChecklist', async () => {
    const { registerReviewHandlers } = await import('@main/ipc/review-handlers')
    registerReviewHandlers()

    const getCall = mockCreateIpcHandler.mock.calls.find(
      (call: unknown[]) => call[0] === 'review:get-attack-checklist'
    )
    expect(getCall).toBeDefined()

    const handler = getCall![1] as (input: { projectId: string }) => Promise<unknown>
    await handler({ projectId: 'proj-1' })
    expect(mockGetChecklist).toHaveBeenCalledWith('proj-1')
  })

  it('update-checklist-item-status handler delegates to service.updateItemStatus', async () => {
    const { registerReviewHandlers } = await import('@main/ipc/review-handlers')
    registerReviewHandlers()

    const updateCall = mockCreateIpcHandler.mock.calls.find(
      (call: unknown[]) => call[0] === 'review:update-checklist-item-status'
    )
    expect(updateCall).toBeDefined()

    const handler = updateCall![1] as (input: {
      itemId: string
      status: string
    }) => Promise<unknown>
    await handler({ itemId: 'item-1', status: 'addressed' })
    expect(mockUpdateItemStatus).toHaveBeenCalledWith('item-1', 'addressed')
  })
})
