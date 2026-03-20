import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode } from '@shared/constants'

// ─── Mocks ───

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
      unlink: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  }
})

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockChat = vi.fn()
vi.mock('@main/services/ai-proxy/provider-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/services/ai-proxy/provider-adapter')>()
  return {
    ...actual,
    createProvider: vi.fn(() => ({
      name: 'claude',
      chat: mockChat,
    })),
  }
})

const mockGetConfig = vi.fn()
vi.mock('@main/config/app-config', () => ({
  getAiProxyConfig: () => mockGetConfig(),
}))

const mockWriteTrace = vi.fn().mockResolvedValue(undefined)
vi.mock('@main/services/ai-proxy/ai-trace-logger', () => ({
  writeTrace: (...args: unknown[]) => mockWriteTrace(...args),
}))

const TRACE_REDACTED_PLACEHOLDER = '[TRACE_REDACTED]'
const TRACE_DESENSITIZATION_DISABLED_PLACEHOLDER = '[DESENSITIZATION_DISABLED]'

/**
 * Helper to create an error object that looks like AiProxyError to the module under test.
 * We cannot use the test-file's AiProxyError class because vi.resetModules() causes
 * instanceof checks to fail across module boundaries.
 */
function makeProxyError(code: string, message: string): Error {
  const err = new Error(message)
  err.name = 'AiProxyError'
  ;(err as { code: string }).code = code
  return err
}

describe('aiProxy', () => {
  let aiProxy: typeof import('@main/services/ai-proxy/index').aiProxy

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    mockGetConfig.mockResolvedValue({
      provider: 'claude',
      anthropicApiKey: 'test-key',
      desensitizeEnabled: true,
      defaultModel: 'claude-sonnet-4-20250514',
    })

    mockChat.mockResolvedValue({
      content: 'AI response with {{COMPANY_1}}',
      usage: { promptTokens: 100, completionTokens: 50 },
      model: 'claude-sonnet-4-20250514',
      finishReason: 'end_turn',
    })

    const mod = await import('@main/services/ai-proxy/index')
    aiProxy = mod.aiProxy
    aiProxy.reset()
  })

  describe('complete flow', () => {
    it('desensitize → call → log → restore → return', async () => {
      const response = await aiProxy.call({
        messages: [{ role: 'user', content: '分析华为技术有限公司的方案' }],
        caller: 'test-agent',
      })

      expect(response.content).toBeDefined()
      expect(response.provider).toBe('claude')
      expect(response.latencyMs).toBeGreaterThanOrEqual(0)
      expect(response.usage).toBeDefined()
    })

    it('trace log is written before restore (contains desensitizedInput and outputContent)', async () => {
      await aiProxy.call({
        messages: [{ role: 'user', content: '华为技术有限公司的预算¥100万' }],
        caller: 'test-agent',
      })

      expect(mockWriteTrace).toHaveBeenCalledTimes(1)
      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.desensitizedInput).toBeDefined()
      expect(traceEntry.outputContent).toBeDefined()
      expect(traceEntry.status).toBe('success')
      // Verify desensitized input doesn't contain original text
      const inputStr = JSON.stringify(traceEntry.desensitizedInput)
      expect(inputStr).not.toContain('华为技术有限公司')
    })

    it('returns restored content to caller', async () => {
      mockChat.mockResolvedValue({
        content: 'Result for {{COMPANY_1}}',
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'claude-sonnet-4-20250514',
        finishReason: 'end_turn',
      })

      const response = await aiProxy.call({
        messages: [{ role: 'user', content: '华为技术有限公司的方案' }],
        caller: 'test-agent',
      })

      expect(response.content).toBeDefined()
      expect(response.model).toBe('claude-sonnet-4-20250514')
    })
  })

  describe('desensitizeEnabled=false', () => {
    it('skips desensitization when disabled and keeps trace redacted', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'claude',
        anthropicApiKey: 'test-key',
        desensitizeEnabled: false,
        defaultModel: 'claude-sonnet-4-20250514',
      })
      aiProxy.reset()

      mockChat.mockResolvedValue({
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5 },
        model: 'claude-sonnet-4-20250514',
        finishReason: 'end_turn',
      })

      const response = await aiProxy.call({
        messages: [{ role: 'user', content: '华为技术有限公司' }],
        caller: 'test-agent',
      })

      expect(response.content).toBe('Response')
      // Chat should have been called with original content (no desensitization)
      const chatCall = mockChat.mock.calls[0][0]
      expect(chatCall.messages[0].content).toBe('华为技术有限公司')

      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.status).toBe('success')
      expect(traceEntry.desensitizedInput).toEqual([
        { role: 'user', content: TRACE_DESENSITIZATION_DISABLED_PLACEHOLDER },
      ])
      expect(JSON.stringify(traceEntry.desensitizedInput)).not.toContain('华为技术有限公司')
    })

    it('writes placeholder trace on error when desensitization is disabled', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'claude',
        anthropicApiKey: 'test-key',
        desensitizeEnabled: false,
        defaultModel: 'claude-sonnet-4-20250514',
      })
      aiProxy.reset()

      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_PROVIDER, 'provider error'))

      await aiProxy
        .call({
          messages: [{ role: 'user', content: '华为技术有限公司的预算¥300万' }],
          caller: 'test-agent',
        })
        .catch(() => undefined)

      const chatCall = mockChat.mock.calls[0][0]
      expect(chatCall.messages[0].content).toBe('华为技术有限公司的预算¥300万')

      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.status).toBe('error')
      expect(traceEntry.desensitizedInput).toEqual([
        { role: 'user', content: TRACE_DESENSITIZATION_DISABLED_PLACEHOLDER },
      ])
      const inputStr = JSON.stringify(traceEntry.desensitizedInput)
      expect(inputStr).not.toContain('华为技术有限公司')
      expect(inputStr).not.toContain('¥300万')
    })
  })

  describe('provider switching', () => {
    it('works with OpenAI config', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'openai',
        openaiApiKey: 'openai-key',
        desensitizeEnabled: true,
        defaultModel: 'gpt-4o',
      })
      aiProxy.reset()

      mockChat.mockResolvedValue({
        content: 'OpenAI response',
        usage: { promptTokens: 10, completionTokens: 5 },
        model: 'gpt-4o',
        finishReason: 'stop',
      })

      const response = await aiProxy.call({
        messages: [{ role: 'user', content: 'hello' }],
        caller: 'test-agent',
      })

      expect(response.content).toBe('OpenAI response')
    })
  })

  describe('error handling', () => {
    it('throws AiProxyError on timeout after retries', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'AI 调用超时'))

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })

    it('logs error trace on failure', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'timeout'))

      try {
        await aiProxy.call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
      } catch {
        // expected
      }

      expect(mockWriteTrace).toHaveBeenCalledTimes(1)
      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.status).toBe('error')
      expect(traceEntry.errorCode).toBeDefined()
    })

    it('error trace has null outputContent when provider never responded', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'timeout'))

      try {
        await aiProxy.call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
      } catch {
        // expected
      }

      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.outputContent).toBeNull()
      expect(traceEntry.inputTokens).toBe(0)
      expect(traceEntry.outputTokens).toBe(0)
    })

    it('preserves AiProxyError code through the proxy', async () => {
      // The proxy checks err.name === 'AiProxyError' to preserve codes
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'timeout'))

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })

    it('maps error codes correctly: rate limit', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_RATE_LIMIT, 'rate limit'))

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })

    it('maps error codes correctly: auth failure', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_AUTH, 'unauthorized'))

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })

    it('maps error codes correctly: provider error', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_PROVIDER, 'provider error'))

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })

    it('error trace uses desensitized messages, not original plaintext', async () => {
      mockChat.mockRejectedValue(makeProxyError(ErrorCode.AI_PROXY_PROVIDER, 'provider error'))

      try {
        await aiProxy.call({
          messages: [{ role: 'user', content: '华为技术有限公司的预算¥300万' }],
          caller: 'test-agent',
        })
      } catch {
        // expected
      }

      expect(mockWriteTrace).toHaveBeenCalledTimes(1)
      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.status).toBe('error')
      // The desensitizedInput must NOT contain original plaintext
      const inputStr = JSON.stringify(traceEntry.desensitizedInput)
      expect(inputStr).not.toContain('华为技术有限公司')
      expect(inputStr).not.toContain('¥300万')
    })

    it('writes redacted trace when config loading fails before desensitization', async () => {
      mockGetConfig.mockRejectedValue(makeProxyError(ErrorCode.CONFIG, 'config missing'))
      aiProxy.reset()

      await aiProxy
        .call({
          messages: [{ role: 'user', content: '华为技术有限公司的预算¥300万' }],
          caller: 'test-agent',
        })
        .catch(() => undefined)

      expect(mockChat).not.toHaveBeenCalled()

      const traceEntry = mockWriteTrace.mock.calls[0][0]
      expect(traceEntry.status).toBe('error')
      expect(traceEntry.errorCode).toBe(ErrorCode.CONFIG)
      expect(traceEntry.desensitizedInput).toEqual([
        { role: 'user', content: TRACE_REDACTED_PLACEHOLDER },
      ])
      const inputStr = JSON.stringify(traceEntry.desensitizedInput)
      expect(inputStr).not.toContain('华为技术有限公司')
      expect(inputStr).not.toContain('¥300万')
    })

    it('writes redacted trace when desensitization throws before provider call', async () => {
      const { Desensitizer } = await import('@main/services/ai-proxy/desensitizer')
      const desensitizeSpy = vi
        .spyOn(Desensitizer.prototype, 'desensitize')
        .mockRejectedValue(new Error('desensitize failed'))

      try {
        await aiProxy
          .call({
            messages: [{ role: 'user', content: '华为技术有限公司的预算¥300万' }],
            caller: 'test-agent',
          })
          .catch(() => undefined)

        expect(mockChat).not.toHaveBeenCalled()

        const traceEntry = mockWriteTrace.mock.calls[0][0]
        expect(traceEntry.status).toBe('error')
        expect(traceEntry.desensitizedInput).toEqual([
          { role: 'user', content: TRACE_REDACTED_PLACEHOLDER },
        ])
        const inputStr = JSON.stringify(traceEntry.desensitizedInput)
        expect(inputStr).not.toContain('华为技术有限公司')
        expect(inputStr).not.toContain('¥300万')
      } finally {
        desensitizeSpy.mockRestore()
      }
    })

    it('passes signal and timeoutMs from AiProxyRequest to provider.chat()', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'claude',
        anthropicApiKey: 'test-key',
        desensitizeEnabled: false,
        defaultModel: 'claude-sonnet-4-20250514',
      })
      aiProxy.reset()

      const controller = new AbortController()

      await aiProxy.call({
        caller: 'test-agent',
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 1024,
        signal: controller.signal,
        timeoutMs: 90000,
      })

      expect(mockChat).toHaveBeenCalledTimes(1)
      const [, options] = mockChat.mock.calls[0]
      expect(options).toEqual(
        expect.objectContaining({
          signal: controller.signal,
          timeoutMs: 90000,
        })
      )
    })

    it('passes undefined signal/timeoutMs when not provided in request', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'claude',
        anthropicApiKey: 'test-key',
        desensitizeEnabled: false,
        defaultModel: 'claude-sonnet-4-20250514',
      })
      aiProxy.reset()

      await aiProxy.call({
        caller: 'test-agent',
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 1024,
      })

      expect(mockChat).toHaveBeenCalledTimes(1)
      const [, options] = mockChat.mock.calls[0]
      expect(options.signal).toBeUndefined()
      expect(options.timeoutMs).toBeUndefined()
    })

    it('throws AiProxyError when API key is missing', async () => {
      mockGetConfig.mockResolvedValue({
        provider: 'claude',
        anthropicApiKey: undefined,
        desensitizeEnabled: true,
      })
      aiProxy.reset()

      const err = await aiProxy
        .call({
          messages: [{ role: 'user', content: 'test' }],
          caller: 'test-agent',
        })
        .catch((e) => e)

      expect(err.name).toBe('AiProxyError')
    })
  })
})
