/**
 * AI Proxy shared types — consumed by ai-proxy service and future agent-orchestrator (Story 2.2)
 */

/** Chat message role */
export type AiRole = 'system' | 'user' | 'assistant'

/** Single chat message */
export interface AiChatMessage {
  role: AiRole
  content: string
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

// ─── Provider-level types ───

/** Unified request sent to a provider adapter */
export interface AiChatRequest {
  messages: AiChatMessage[]
  model: string
  temperature?: number
  maxTokens: number
}

/** Unified response from a provider adapter */
export interface AiChatResponse {
  content: string
  usage: TokenUsage
  model: string
  finishReason: string
}

// ─── Proxy-level types ───

/** Request accepted by aiProxy.call() */
export interface AiProxyRequest {
  messages: AiChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  /** Caller identity for tracing, e.g. 'parse-agent' */
  caller: string
}

/** Response returned by aiProxy.call() */
export interface AiProxyResponse {
  content: string
  usage: TokenUsage
  model: string
  provider: string
  latencyMs: number
}

// ─── Provider configuration ───

export type AiProviderName = 'claude' | 'openai'

export interface AiProxyConfig {
  provider: AiProviderName
  anthropicApiKey?: string
  openaiApiKey?: string
  defaultModel?: string
  desensitizeEnabled: boolean
}

/** Per-provider connection config passed to createProvider() */
export interface ProviderConfig {
  provider: AiProviderName
  apiKey: string
  defaultModel: string
}
