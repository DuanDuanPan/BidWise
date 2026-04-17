import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'

// Mock SDKs
const mockCreate = vi.fn()
const mockCompletionsCreate = vi.fn()
const mockAnthropicConstructor = vi.fn()
const mockOpenAIConstructor = vi.fn()

// Streaming providers need mocks shaped like real streams:
//   - Claude: stream(body, opts) → { on, finalMessage }
//   - OpenAI: chat.completions.create(body, opts) → async iterable of chunks
// Route both through the existing mockCreate / mockCompletionsCreate so test
// setups using mockResolvedValue / mockRejectedValue keep working.
async function toOpenAiStream(value: unknown): Promise<AsyncIterable<Record<string, unknown>>> {
  if (
    value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  ) {
    return value as AsyncIterable<Record<string, unknown>>
  }
  const v = value as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    model?: string
  }
  const choice = v?.choices?.[0]
  const content = choice?.message?.content
  const finishReason = choice?.finish_reason ?? null
  const chunks: Array<Record<string, unknown>> = []
  if (typeof content === 'string' && content.length > 0) {
    chunks.push({
      model: v?.model,
      choices: [{ delta: { content }, finish_reason: null }],
    })
  }
  chunks.push({
    model: v?.model,
    choices: [{ delta: {}, finish_reason: finishReason }],
    ...(v?.usage ? { usage: v.usage } : {}),
  })
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    },
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: (body: unknown, opts: unknown) => ({
          on: () => undefined,
          finalMessage: () => mockCreate(body, opts),
        }),
      }

      constructor(options: unknown) {
        mockAnthropicConstructor(options)
      }
    },
  }
})

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: async (body: unknown, opts: unknown) => {
            const result = await mockCompletionsCreate(body, opts)
            return toOpenAiStream(result)
          },
        },
      }

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
        // No explicit timeout — upstream controls via options.timeoutMs.
        // signal is always present (internal linked controller for idle watchdog).
        expect.objectContaining({ signal: expect.any(AbortSignal) })
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
          stream: true,
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
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
    // Providers now always pass an internal linked AbortSignal to the SDK so
    // the idle watchdog can abort streams without racing the caller's signal.
    // Tests verify: (a) upstream aborts observed mid-flight propagate, and
    // (b) timeoutMs passes through verbatim while signal is always present.
    it('ClaudeProvider passes timeoutMs and forwards upstream aborts to SDK signal', async () => {
      let capturedSdkSignal: AbortSignal | undefined
      mockCreate.mockImplementation((_body, opts) => {
        capturedSdkSignal = opts?.signal
        // Abort upstream BEFORE chat finalMessage resolves, so the link is still
        // active (post-resolution cleanup removes the forwarder).
        upstreamController.abort(new Error('caller cancel'))
        return Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
        })
      })

      const upstreamController = new AbortController()
      const provider = new ClaudeProvider('key')
      await provider.chat(
        {
          messages: [{ role: 'user', content: 'test' }],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 1024,
        },
        { signal: upstreamController.signal, timeoutMs: 60000 }
      )

      const sdkOptions = mockCreate.mock.calls[0][1]
      expect(sdkOptions.timeout).toBe(60000)
      expect(capturedSdkSignal).toBeInstanceOf(AbortSignal)
      expect(capturedSdkSignal?.aborted).toBe(true)
    })

    it('ClaudeProvider still supplies a signal and no timeout when neither is provided', async () => {
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
      expect(sdkOptions.signal).toBeInstanceOf(AbortSignal)
      expect(sdkOptions).not.toHaveProperty('timeout')
    })

    it('OpenAiProvider passes timeoutMs and forwards upstream aborts to SDK signal', async () => {
      let capturedSdkSignal: AbortSignal | undefined
      const upstreamController = new AbortController()
      mockCompletionsCreate.mockImplementation((_body, opts) => {
        capturedSdkSignal = opts?.signal
        upstreamController.abort(new Error('caller cancel'))
        return Promise.resolve({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          model: 'gpt-4o',
        })
      })

      const provider = new OpenAiProvider('key')
      await provider.chat(
        {
          messages: [{ role: 'user', content: 'test' }],
          model: 'gpt-4o',
          maxTokens: 1024,
        },
        { signal: upstreamController.signal, timeoutMs: 120000 }
      )

      const sdkOptions = mockCompletionsCreate.mock.calls[0][1]
      expect(sdkOptions.timeout).toBe(120000)
      expect(capturedSdkSignal).toBeInstanceOf(AbortSignal)
      expect(capturedSdkSignal?.aborted).toBe(true)
    })

    it('OpenAiProvider still supplies a signal and no timeout when neither is provided', async () => {
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
      expect(sdkOptions.signal).toBeInstanceOf(AbortSignal)
      expect(sdkOptions).not.toHaveProperty('timeout')
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

  // ─── Stream termination classification ───
  //
  // Regression suite for the "No closing </svg>" failure mode observed with
  // gemini-3.1-pro-preview: the stream emitted only `reasoning_content` until
  // idle timeout fired, then a legacy fallback promoted thinking text into
  // `content`, producing prose that mentioned `<svg` with no closing tag.
  // The new contract: reasoning is NEVER used as answer, and the four
  // termination states (completed / truncated / aborted / incomplete) let the
  // business layer pick the correct retry strategy.
  describe('stream termination classification', () => {
    function chunkStream(
      chunks: Array<Record<string, unknown>>
    ): AsyncIterable<Record<string, unknown>> {
      return {
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c
        },
      }
    }

    it('OpenAiProvider: returns completed termination on normal stop', async () => {
      mockCompletionsCreate.mockResolvedValue(
        chunkStream([
          { model: 'gpt-4o', choices: [{ delta: { content: 'hello' }, finish_reason: null }] },
          {
            model: 'gpt-4o',
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ])
      )

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(res.content).toBe('hello')
      expect(res.termination.kind).toBe('completed')
      expect(res.termination.finishReason).toBe('stop')
    })

    it('OpenAiProvider: returns truncated termination on finish_reason=length without retrying', async () => {
      mockCompletionsCreate.mockResolvedValue(
        chunkStream([
          { model: 'gpt-4o', choices: [{ delta: { content: 'partial' }, finish_reason: null }] },
          {
            model: 'gpt-4o',
            choices: [{ delta: {}, finish_reason: 'length' }],
            usage: { prompt_tokens: 10, completion_tokens: 1024 },
          },
        ])
      )

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        model: 'gpt-4o',
        maxTokens: 1024,
      })

      expect(res.content).toBe('partial')
      expect(res.termination.kind).toBe('truncated')
      expect(res.termination.finishReason).toBe('length')
      // Adapter must NOT retry a truncation — business layer escalates budget.
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(1)
    })

    it('OpenAiProvider: reasoning_content is NEVER promoted to content', async () => {
      // Simulates gemini-3.1-pro-preview dumping thinking tokens while never
      // emitting real content, then closing with finish_reason=stop.
      // Old code turned reasoning into answer (→ "No closing </svg>" crash).
      // New code must treat this as empty content + completed → retry 4×.
      mockCompletionsCreate.mockResolvedValue(
        chunkStream([
          {
            model: 'gemini-3.1-pro-preview',
            choices: [
              {
                delta: { reasoning_content: 'I will draft an <svg> flowchart...' },
                finish_reason: null,
              },
            ],
          },
          {
            model: 'gemini-3.1-pro-preview',
            choices: [
              {
                delta: { reasoning_content: 'First the nodes, then the edges.' },
                finish_reason: null,
              },
            ],
          },
          {
            model: 'gemini-3.1-pro-preview',
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 0 },
          },
        ])
      )

      const provider = new OpenAiProvider('key')
      try {
        await provider.chat({
          messages: [{ role: 'user', content: 'draw' }],
          model: 'gemini-3.1-pro-preview',
          maxTokens: 1024,
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AiProxyError)
        // Error surface must reveal the reasoning-only state so operators can
        // diagnose without re-reading jsonl traces.
        expect((err as Error).message).toMatch(/reasoningChars=\d+/)
        expect((err as Error).message).not.toContain('<svg>')
      }
      // withRetry burns 4 attempts on retryable empty content.
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(4)
    }, 30000)

    it('OpenAiProvider: reasoning_content delta counts toward reasoningChars', async () => {
      mockCompletionsCreate.mockResolvedValue(
        chunkStream([
          {
            model: 'gpt-x',
            choices: [{ delta: { reasoning_content: 'thinking' }, finish_reason: null }],
          },
          {
            model: 'gpt-x',
            choices: [{ delta: { content: 'answer' }, finish_reason: null }],
          },
          {
            model: 'gpt-x',
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          },
        ])
      )

      const provider = new OpenAiProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        model: 'gpt-x',
        maxTokens: 512,
      })

      expect(res.content).toBe('answer')
      expect(res.termination.kind).toBe('completed')
      expect(res.termination.reasoningChars).toBe('thinking'.length)
    })

    it('ClaudeProvider: returns truncated termination on stop_reason=max_tokens', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'partial body' }],
        usage: { input_tokens: 100, output_tokens: 1024 },
        model: 'claude-opus-4-6',
        stop_reason: 'max_tokens',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        model: 'claude-opus-4-6',
        maxTokens: 1024,
      })

      expect(res.content).toBe('partial body')
      expect(res.termination.kind).toBe('truncated')
      expect(res.termination.finishReason).toBe('max_tokens')
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('ClaudeProvider: returns completed termination with end_turn', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'done' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
      })

      const provider = new ClaudeProvider('key')
      const res = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        model: 'claude-opus-4-6',
        maxTokens: 1024,
      })

      expect(res.termination.kind).toBe('completed')
      expect(res.termination.finishReason).toBe('end_turn')
    })
  })
})
