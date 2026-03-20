import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

const mockHandle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
    }
  },
}))

const mockExecute = vi.fn()
const mockGetAgentStatus = vi.fn()

vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockExecute(...args),
    getAgentStatus: (...args: unknown[]) => mockGetAgentStatus(...args),
  },
}))

import { registerAgentHandlers } from '@main/ipc/agent-handlers'

describe('agent-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register agent:execute and agent:status handlers', () => {
    registerAgentHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('agent:execute')
    expect(registeredChannels).toContain('agent:status')
  })

  it('agent:execute handler should dispatch to orchestrator.execute', async () => {
    registerAgentHandlers()

    const executeHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'agent:execute'
    )?.[1]
    expect(executeHandler).toBeDefined()

    mockExecute.mockResolvedValue({ taskId: 'task-123' })

    const input = { agentType: 'parse', context: { rfpContent: 'test' } }
    const result = await executeHandler({}, input)

    expect(result).toEqual({ success: true, data: { taskId: 'task-123' } })
    expect(mockExecute).toHaveBeenCalledWith(input)
  })

  it('agent:status handler should dispatch to orchestrator.getAgentStatus', async () => {
    registerAgentHandlers()

    const statusHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'agent:status')?.[1]
    expect(statusHandler).toBeDefined()

    const mockStatus = {
      taskId: 'task-123',
      status: 'running',
      progress: 50,
      agentType: 'parse',
    }
    mockGetAgentStatus.mockResolvedValue(mockStatus)

    const result = await statusHandler({}, 'task-123')

    expect(result).toEqual({ success: true, data: mockStatus })
    expect(mockGetAgentStatus).toHaveBeenCalledWith('task-123')
  })

  it('should wrap errors as ApiResponse error format', async () => {
    registerAgentHandlers()

    const executeHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'agent:execute'
    )?.[1]

    const { BidWiseError } = await import('@main/utils/errors')
    mockExecute.mockRejectedValue(new BidWiseError('AGENT_NOT_FOUND', 'Agent not found'))

    const result = await executeHandler({}, { agentType: 'unknown', context: {} })

    expect(result).toEqual({
      success: false,
      error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found' },
    })
  })
})
