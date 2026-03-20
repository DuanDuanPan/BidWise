/**
 * Multi-provider adapter layer — Claude / OpenAI seamless switching.
 * Each provider translates unified AiChatRequest/Response to native SDK format.
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import type { AiChatRequest, AiChatResponse, AiChatMessage, ProviderConfig } from '@shared/ai-types'

const TIMEOUT_MS = 30_000

// ─── Provider interface ───

export interface AiProvider {
  readonly name: string
  chat(request: AiChatRequest): Promise<AiChatResponse>
}

// ─── Retry logic ───

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('aborted')) return true
  }
  // Check HTTP status from SDK errors
  const status = (err as { status?: number }).status
  if (status !== undefined) {
    if (status === 429) return true
    if (status >= 500 && status < 600) return true
  }
  return false
}

function classifyError(err: unknown): AiProxyError {
  const status = (err as { status?: number }).status
  const msg = err instanceof Error ? err.message : String(err)

  if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
    return new AiProxyError(ErrorCode.AI_PROXY_TIMEOUT, `AI 调用超时: ${msg}`, err)
  }
  if (status === 429) {
    return new AiProxyError(ErrorCode.AI_PROXY_RATE_LIMIT, `AI API 频率限制: ${msg}`, err)
  }
  if (status === 401 || status === 403) {
    return new AiProxyError(ErrorCode.AI_PROXY_AUTH, `AI API 认证失败: ${msg}`, err)
  }
  return new AiProxyError(ErrorCode.AI_PROXY_PROVIDER, `AI Provider 错误: ${msg}`, err)
}

async function withRetry(fn: () => Promise<AiChatResponse>): Promise<AiChatResponse> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      throw classifyError(err)
    }
  }
  throw classifyError(lastError)
}

// ─── Claude Provider ───

export class ClaudeProvider implements AiProvider {
  readonly name = 'claude'
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    return withRetry(async () => {
      // Extract system message if present
      let system: string | undefined
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

      for (const msg of request.messages) {
        if (msg.role === 'system') {
          system = msg.content
        } else {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
        }
      }

      const response = await this.client.messages.create(
        {
          model: request.model,
          max_tokens: request.maxTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(system ? { system } : {}),
          messages,
        },
        { timeout: TIMEOUT_MS }
      )

      const content =
        response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('') || ''

      return {
        content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason ?? 'unknown',
      }
    })
  }
}

// ─── OpenAI Provider ───

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    return withRetry(async () => {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
        request.messages.map((msg: AiChatMessage) => ({
          role: msg.role,
          content: msg.content,
        }))

      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          messages,
          max_tokens: request.maxTokens,
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
        { timeout: TIMEOUT_MS }
      )

      const choice = response.choices[0]
      return {
        content: choice?.message?.content ?? '',
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
        finishReason: choice?.finish_reason ?? 'unknown',
      }
    })
  }
}

// ─── Factory ───

const DEFAULT_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
}

export function createProvider(config: ProviderConfig): AiProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config.apiKey)
    case 'openai':
      return new OpenAiProvider(config.apiKey)
    default:
      throw new AiProxyError(
        ErrorCode.AI_PROXY_PROVIDER,
        `不支持的 AI Provider: ${config.provider as string}`
      )
  }
}

export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] ?? 'claude-sonnet-4-20250514'
}
