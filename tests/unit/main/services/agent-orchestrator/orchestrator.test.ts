import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode } from '@shared/constants'

// ─── Mocks ───

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockEnqueue = vi.fn()
const mockExecute = vi.fn()
const mockGetStatus = vi.fn()
const mockCancel = vi.fn()
const mockRegisterExecutor = vi.fn()

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    registerExecutor: (...args: unknown[]) => mockRegisterExecutor(...args),
  },
}))

const mockAiProxyCall = vi.fn()

vi.mock('@main/services/ai-proxy', () => ({
  aiProxy: {
    call: (...args: unknown[]) => mockAiProxyCall(...args),
  },
}))

import { AgentOrchestrator } from '@main/services/agent-orchestrator/orchestrator'
import type { AgentHandler, AgentPostProcessor } from '@main/services/agent-orchestrator/orchestrator'

describe('AgentOrchestrator @story-2-2', () => {
  let orchestrator: AgentOrchestrator

  const mockHandler: AgentHandler = vi.fn(async () => ({
    messages: [{ role: 'user' as const, content: 'test prompt' }],
    maxTokens: 4096,
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    orchestrator = new AgentOrchestrator()
    orchestrator.registerAgent('parse', mockHandler)
  })

  describe('registerAgent', () => {
    it('@p1 should register an agent handler', () => {
      const handler: AgentHandler = vi.fn(async () => ({
        messages: [{ role: 'user' as const, content: 'test' }],
      }))
      orchestrator.registerAgent('generate', handler)
      expect(mockRegisterExecutor).toHaveBeenCalledWith(
        { category: 'ai-agent', agentType: 'generate' },
        expect.any(Function)
      )
    })
  })

  describe('execute', () => {
    it('@p0 should throw AGENT_NOT_FOUND for unregistered type', async () => {
      await expect(orchestrator.execute({ agentType: 'generate', context: {} })).rejects.toThrow(
        'Agent type not registered: generate'
      )
    })

    it('@p0 should enqueue task and return taskId immediately', async () => {
      mockEnqueue.mockResolvedValue('task-123')
      mockExecute.mockResolvedValue({})

      const result = await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test' },
      })

      expect(result).toEqual({ taskId: 'task-123' })
      expect(mockEnqueue).toHaveBeenCalledWith({
        category: 'ai-agent',
        agentType: 'parse',
        input: { rfpContent: 'test' },
        priority: 'normal',
      })
    })

    it('@p0 should fire-and-forget taskQueue.execute', async () => {
      mockEnqueue.mockResolvedValue('task-123')
      mockExecute.mockResolvedValue({})

      await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test' },
      })

      expect(mockExecute).toHaveBeenCalledWith('task-123', expect.any(Function), {
        timeoutMs: undefined,
      })
    })

    it('@p0 should call handler and aiProxy.call in executor', async () => {
      mockEnqueue.mockResolvedValue('task-123')

      // Capture the executor function
      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test doc' },
      })

      // Run the captured executor
      mockAiProxyCall.mockResolvedValue({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 1200,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const controller = new AbortController()
      const result = await capturedExecutor!({
        taskId: 'task-123',
        input: { rfpContent: 'test doc' },
        signal: controller.signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })

      // Verify handler was called
      expect(mockHandler).toHaveBeenCalledWith(
        { rfpContent: 'test doc' },
        expect.objectContaining({ signal: controller.signal })
      )

      // Verify aiProxy.call was called with correct caller
      expect(mockAiProxyCall).toHaveBeenCalledWith(
        expect.objectContaining({
          caller: 'parse-agent',
          signal: controller.signal,
        })
      )

      // Verify result shape
      expect(result).toEqual({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 1200,
      })
    })

    it('@p0 should throw AbortError before aiProxy.call when signal aborts after handler', async () => {
      mockEnqueue.mockResolvedValue('task-123')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test doc' },
      })

      const controller = new AbortController()
      mockHandler.mockImplementationOnce(async () => {
        controller.abort()
        return {
          messages: [{ role: 'user' as const, content: 'test prompt' }],
          maxTokens: 4096,
        }
      })

      await expect(
        capturedExecutor!({
          taskId: 'task-123',
          input: { rfpContent: 'test doc' },
          signal: controller.signal,
          updateProgress: vi.fn(),
          setCheckpoint: vi.fn(),
        })
      ).rejects.toMatchObject({ name: 'AbortError' })

      expect(mockAiProxyCall).not.toHaveBeenCalled()
    })

    it('@p1 should use priority from options', async () => {
      mockEnqueue.mockResolvedValue('task-123')
      mockExecute.mockResolvedValue({})

      await orchestrator.execute({
        agentType: 'parse',
        context: {},
        options: { priority: 'high' },
      })

      expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }))
    })

    it('@p0 should propagate timeoutMs to aiProxy.call', async () => {
      mockEnqueue.mockResolvedValue('task-123')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test doc' },
        options: { timeoutMs: 12_345 },
      })

      mockAiProxyCall.mockResolvedValue({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 1200,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const controller = new AbortController()
      await capturedExecutor!({
        taskId: 'task-123',
        input: { rfpContent: 'test doc' },
        signal: controller.signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })

      expect(mockAiProxyCall).toHaveBeenCalledWith(
        expect.objectContaining({
          caller: 'parse-agent',
          signal: controller.signal,
          timeoutMs: 12_345,
        })
      )
    })
  })

  describe('getAgentStatus', () => {
    it('@p1 should return status from task queue', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'task-123',
        category: 'ai-agent',
        status: 'running',
        progress: 50,
        agentType: 'parse',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      })

      const status = await orchestrator.getAgentStatus('task-123')

      expect(status.taskId).toBe('task-123')
      expect(status.status).toBe('running')
      expect(status.progress).toBe(50)
      expect(status.agentType).toBe('parse')
    })

    it('@p1 should parse result from completed task output', async () => {
      const agentResult = {
        content: 'test',
        usage: { promptTokens: 10, completionTokens: 5 },
        latencyMs: 100,
      }
      mockGetStatus.mockResolvedValue({
        id: 'task-123',
        category: 'ai-agent',
        status: 'completed',
        progress: 100,
        agentType: 'parse',
        output: JSON.stringify(agentResult),
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      })

      const status = await orchestrator.getAgentStatus('task-123')
      expect(status.result).toEqual(agentResult)
    })

    it('@p0 should throw AGENT_NOT_FOUND for non-agent tasks', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'task-123',
        category: 'ocr',
        status: 'running',
        progress: 50,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      })

      await expect(orchestrator.getAgentStatus('task-123')).rejects.toThrow(
        'Task task-123 is not an agent task'
      )
    })

    it('@p0 should include error info for failed tasks', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'task-123',
        category: 'ai-agent',
        status: 'failed',
        progress: 0,
        agentType: 'parse',
        error: 'something went wrong',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      })

      const status = await orchestrator.getAgentStatus('task-123')
      expect(status.error).toEqual({
        code: ErrorCode.AGENT_EXECUTE,
        message: 'something went wrong',
      })
    })

    it('@p1 should use TASK_CANCELLED for cancelled task errors', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'task-123',
        category: 'ai-agent',
        status: 'cancelled',
        progress: 25,
        agentType: 'parse',
        error: 'Task cancelled',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      })

      const status = await orchestrator.getAgentStatus('task-123')
      expect(status.error).toEqual({
        code: ErrorCode.TASK_CANCELLED,
        message: 'Task cancelled',
      })
    })
  })

  describe('cancelAgent', () => {
    it('@p1 should delegate to taskQueue.cancel', async () => {
      mockCancel.mockResolvedValue(undefined)

      await orchestrator.cancelAgent('task-123')

      expect(mockCancel).toHaveBeenCalledWith('task-123')
    })
  })

  describe('@story-5-3 postProcessor support', () => {
    it('should call postProcessor after AI response in executor', async () => {
      const postProcessor: AgentPostProcessor = vi.fn(async (result) => ({
        ...result,
        content: result.content + ' [post-processed]',
      }))

      const orch = new AgentOrchestrator()
      orch.registerAgent('generate', mockHandler, postProcessor)

      mockEnqueue.mockResolvedValue('task-pp-1')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orch.execute({ agentType: 'generate', context: { chapterTitle: 'test' } })

      mockAiProxyCall.mockResolvedValue({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 500,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const result = await capturedExecutor!({
        taskId: 'task-pp-1',
        input: { chapterTitle: 'test' },
        signal: new AbortController().signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })

      expect(postProcessor).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'AI response' }),
        { chapterTitle: 'test' },
        expect.any(AbortSignal)
      )
      expect((result as { content: string }).content).toBe('AI response [post-processed]')
    })

    it('should not break agents without postProcessor', async () => {
      mockEnqueue.mockResolvedValue('task-npp-1')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orchestrator.execute({ agentType: 'parse', context: { rfpContent: 'test' } })

      mockAiProxyCall.mockResolvedValue({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 500,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const result = await capturedExecutor!({
        taskId: 'task-npp-1',
        input: { rfpContent: 'test' },
        signal: new AbortController().signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })

      expect((result as { content: string }).content).toBe('AI response')
    })

    it('should use postProcessor from execute() not just registerAgent()', async () => {
      const postProcessor: AgentPostProcessor = vi.fn(async (result) => ({
        ...result,
        content: 'modified',
      }))

      const orch = new AgentOrchestrator()
      orch.registerAgent('generate', mockHandler, postProcessor)

      mockEnqueue.mockResolvedValue('task-exe-1')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      // execute() should also pick up the postProcessor
      await orch.execute({ agentType: 'generate', context: {} })

      mockAiProxyCall.mockResolvedValue({
        content: 'original',
        usage: { promptTokens: 10, completionTokens: 5 },
        latencyMs: 100,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const result = await capturedExecutor!({
        taskId: 'task-exe-1',
        input: {},
        signal: new AbortController().signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })

      expect(postProcessor).toHaveBeenCalled()
      expect((result as { content: string }).content).toBe('modified')
    })
  })

  describe('@story-3-5 global progress hardcode removal', () => {
    it('@p0 should NOT call updateProgress with annotating-sources in executor', async () => {
      mockEnqueue.mockResolvedValue('task-123')

      let capturedExecutor: (ctx: unknown) => Promise<unknown>
      mockExecute.mockImplementation(
        async (_id: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return {}
        }
      )

      await orchestrator.execute({
        agentType: 'parse',
        context: { rfpContent: 'test doc' },
      })

      mockAiProxyCall.mockResolvedValue({
        content: 'AI response',
        usage: { promptTokens: 100, completionTokens: 50 },
        latencyMs: 500,
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      })

      const mockProgress = vi.fn()
      await capturedExecutor!({
        taskId: 'task-123',
        input: { rfpContent: 'test doc' },
        signal: new AbortController().signal,
        updateProgress: mockProgress,
        setCheckpoint: vi.fn(),
      })

      // The orchestrator should NOT inject a global 'annotating-sources' stage
      const progressCalls = mockProgress.mock.calls.map(
        (call: unknown[]) => call[1] as string | undefined
      )
      expect(progressCalls).not.toContain('annotating-sources')
    })
  })
})
