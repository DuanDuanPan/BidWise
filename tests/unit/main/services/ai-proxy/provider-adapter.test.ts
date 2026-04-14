import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'

// Mock SDKs
const mockCreate = vi.fn()
const mockCompletionsCreate = vi.fn()
const mockAnthropicConstructor = vi.fn()
const mockOpenAIConstructor = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }

      constructor(options: unknown) {
        mockAnthropicConstructor(options)
      }
    },
  }
})

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCompletionsCreate } }

      constructor(options: unknown) {
        mockOpenAIConstructor(options)
      }
    },
  }
})

describe('provider-adapter', () => {
  let createProvider: typeof import('@main/services/ai-proxy/provider-adapter').createProvider
  let ClaudeProvider: typeof import('@main/services/ai-proxy/provider-adapter').ClaudeProvider
  let OpenAiProvider: typeof import('@main/services/ai-proxy/provider-adapter').OpenAiProvider

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@main/services/ai-proxy/provider-adapter')
    createProvider = mod.createProvider
    ClaudeProvider = mod.ClaudeProvider
    OpenAiProvider = mod.OpenAiProvider
  })

  describe('ClaudeProvider', () => {
    it('extracts system message and maps request format', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'AI response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('test-key')
      const response = await provider.chat({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful',
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
        }),
        {} // No default timeout — upstream controls via options.timeoutMs
      )

      expect(response.content).toBe('AI response')
      expect(response.usage.promptTokens).toBe(100)
      expect(response.usage.completionTokens).toBe(50)
      expect(response.finishReason).toBe('end_turn')
    })

    it('handles request without system message', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 512,
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.system).toBeUndefined()
    })

    it('maps token usage correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 200, output_tokens: 100 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })

      expect(res.usage).toEqual({ promptTokens: 200, completionTokens: 100 })
    })
  })

  describe('OpenAiProvider', () => {
    it('maps request and response format', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'OpenAI response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
        model: 'gpt-4o',
      })

      const provider = new OpenAiProvider('test-key')
      const response = await provider.chat({
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(mockCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Hello' },
          ],
          model: 'gpt-4o',
          max_tokens: 1024,
        }),
        {} // No default timeout — upstream controls via options.timeoutMs
      )

      expect(response.content).toBe('OpenAI response')
      expect(response.usage.promptTokens).toBe(80)
      expect(response.usage.completionTokens).toBe(40)
      expect(response.finishReason).toBe('stop')
    })

    it('maps token usage correctly', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 25 },
        model: 'gpt-4o',
      })

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(res.usage).toEqual({ promptTokens: 50, completionTokens: 25 })
    })

    it('passes custom baseURL to OpenAI SDK when provided', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
        model: 'MiniMax-M2.7-highspeed',
      })

      const provider = new OpenAiProvider('test-key', 'https://minimax.a7m.com.cn/v1')
      await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'MiniMax-M2.7-highspeed',
        maxTokens: 1024,
      })

      expect(mockOpenAIConstructor).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'https://minimax.a7m.com.cn/v1',
      })
    })

    it('retries when chat.completion payload is missing choices', async () => {
      mockCompletionsCreate
        .mockResolvedValueOnce({
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          model: 'gpt-4o',
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Recovered response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
          model: 'gpt-4o',
        })

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(res.content).toBe('Recovered response')
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(2)
    })

    it('retries when assistant message content is empty', async () => {
      mockCompletionsCreate
        .mockResolvedValueOnce({
          choices: [{ message: { role: 'assistant' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          model: 'gpt-4o',
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Recovered content' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
          model: 'gpt-4o',
        })

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(res.content).toBe('Recovered content')
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(2)
    })
  })

  describe('createProvider factory', () => {
    it('creates ClaudeProvider for claude config', () => {
      const provider = createProvider({
        provider: 'claude',
        apiKey: 'key',
        defaultModel: 'claude-sonnet-4-20250514',
      })
      expect(provider.name).toBe('claude')
    })

    it('creates OpenAiProvider for openai config', () => {
      const provider = createProvider({
        provider: 'openai',
        apiKey: 'key',
        defaultModel: 'gpt-4o',
        baseURL: 'https://minimax.a7m.com.cn/v1',
      })
      expect(provider.name).toBe('openai')
      expect(mockOpenAIConstructor).toHaveBeenLastCalledWith({
        apiKey: 'key',
        baseURL: 'https://minimax.a7m.com.cn/v1',
      })
    })

    it('throws AiProxyError for invalid provider', () => {
      expect(() =>
        createProvider({ provider: 'invalid' as 'claude', apiKey: 'key', defaultModel: 'model' })
      ).toThrow(AiProxyError)
    })
  })

  describe('signal/timeoutMs propagation', () => {
    it('ClaudeProvider passes timeoutMs and signal to SDK call', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const controller = new AbortController()
      const provider = new ClaudeProvider('key')
      await provider.chat(
        {
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        },
        { signal: controller.signal, timeoutMs: 60000 }
      )

      const sdkOptions = mockCreate.mock.calls[0][1]
      expect(sdkOptions).toEqual(
        expect.objectContaining({ timeout: 60000, signal: controller.signal })
      )
    })

    it('ClaudeProvider omits timeout/signal from SDK options when not provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })

      const sdkOptions = mockCreate.mock.calls[0][1]
      expect(sdkOptions).toEqual({})
      expect(sdkOptions).not.toHaveProperty('timeout')
      expect(sdkOptions).not.toHaveProperty('signal')
    })

    it('OpenAiProvider passes timeoutMs and signal to SDK call', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4o',
      })

      const controller = new AbortController()
      const provider = new OpenAiProvider('key')
      await provider.chat(
        {
          messages: [{ role: 'user', content: 'test' }],
          model: 'gpt-4o',
          maxTokens: 1024,
        },
        { signal: controller.signal, timeoutMs: 120000 }
      )

      const sdkOptions = mockCompletionsCreate.mock.calls[0][1]
      expect(sdkOptions).toEqual(
        expect.objectContaining({ timeout: 120000, signal: controller.signal })
      )
    })

    it('OpenAiProvider omits timeout/signal from SDK options when not provided', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4o',
      })

      const provider = new OpenAiProvider('key')
      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      const sdkOptions = mockCompletionsCreate.mock.calls[0][1]
      expect(sdkOptions).toEqual({})
      expect(sdkOptions).not.toHaveProperty('timeout')
      expect(sdkOptions).not.toHaveProperty('signal')
    })
  })

  describe('retry logic', () => {
    it('retries on timeout errors', async () => {
      const timeoutErr = Object.assign(new Error('Request timeout'), { status: undefined })
      timeoutErr.message = 'timeout'
      mockCreate.mockRejectedValueOnce(timeoutErr).mockResolvedValue({
        content: [{ type: 'text', text: 'recovered' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })

      expect(res.content).toBe('recovered')
      expect(mockCreate).toHaveBeenCalledTimes(2)
    })

    it('retries on 5xx errors', async () => {
      const serverErr = Object.assign(new Error('Internal Server Error'), { status: 500 })
      mockCreate.mockRejectedValueOnce(serverErr).mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })
      expect(res.content).toBe('ok')
    })

    it('retries on 429 rate limit', async () => {
      const rateLimitErr = Object.assign(new Error('Rate limit'), { status: 429 })
      mockCreate.mockRejectedValueOnce(rateLimitErr).mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
      })
      expect(res.content).toBe('ok')
    })

    it('does NOT retry on 401 auth errors', async () => {
      const authErr = Object.assign(new Error('Unauthorized'), { status: 401 })
      mockCreate.mockRejectedValue(authErr)

      const provider = new ClaudeProvider('key')
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        })
      ).rejects.toThrow(AiProxyError)

      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on 400 bad request', async () => {
      const badReq = Object.assign(new Error('Bad Request'), { status: 400 })
      mockCreate.mockRejectedValue(badReq)

      const provider = new ClaudeProvider('key')
      await expect(
        provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        })
      ).rejects.toThrow(AiProxyError)

      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('throws AI_PROXY_TIMEOUT after exhausting retries on timeout', async () => {
      const timeoutErr = new Error('Request timeout')
      mockCreate.mockRejectedValue(timeoutErr)

      const provider = new ClaudeProvider('key')
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AiProxyError)
        expect((err as AiProxyError).code).toBe(ErrorCode.AI_PROXY_TIMEOUT)
      }
    }, 30000)

    it('throws AI_PROXY_AUTH on 403 errors', async () => {
      const forbiddenErr = Object.assign(new Error('Forbidden'), { status: 403 })
      mockCreate.mockRejectedValue(forbiddenErr)

      const provider = new ClaudeProvider('key')
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AiProxyError)
        expect((err as AiProxyError).code).toBe(ErrorCode.AI_PROXY_AUTH)
      }
    })

    it('throws AI_PROXY_RATE_LIMIT on 429 after exhausting retries', async () => {
      const rateLimitErr = Object.assign(new Error('Rate limit'), { status: 429 })
      mockCreate.mockRejectedValue(rateLimitErr)

      const provider = new ClaudeProvider('key')
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AiProxyError)
        expect((err as AiProxyError).code).toBe(ErrorCode.AI_PROXY_RATE_LIMIT)
      }
    }, 30000)

    it('throws AI_PROXY_PROVIDER after exhausting retries on empty OpenAI content', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4o',
      })

      const provider = new OpenAiProvider('key')
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'test' }],
          model: 'gpt-4o',
          maxTokens: 1024,
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AiProxyError)
        expect((err as AiProxyError).code).toBe(ErrorCode.AI_PROXY_PROVIDER)
        expect((err as Error).message).toContain('Empty AI response')
      }

      expect(mockCompletionsCreate).toHaveBeenCalledTimes(4)
    }, 30000)
  })
})
