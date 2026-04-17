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

// ─── Stream termination ───

/**
 * Classification of how a streamed provider response actually ended. Provider
 * adapters must set this regardless of upstream field naming so business code
 * (retry, budget escalation, error surface) can behave consistently across
 * Claude / OpenAI / Gemini / DeepSeek / MiniMax and thinking vs non-thinking
 * models.
 */
export type StreamTerminationKind =
  | 'completed' // Model finished naturally (stop / end_turn / tool_use)
  | 'truncated' // Model hit max_tokens / length cap (content may be partial or empty)
  | 'aborted' // Stream was aborted (idle timeout, upstream cancel, network)
  | 'incomplete' // Stream ended with no finish_reason / unknown server state

export interface StreamTermination {
  kind: StreamTerminationKind
  /** Raw finish_reason / stop_reason from provider, null if absent */
  finishReason: string | null
  /** For kind='aborted': what triggered the abort */
  abortCause?: 'idle-timeout' | 'upstream-cancel' | 'network'
  /**
   * Diagnostic only: bytes of `reasoning_content` (thinking tokens) observed
   * during the stream. Never used as `content`; thinking text is model scratch
   * space, not the answer. Non-zero here with an empty `content` typically
   * signals the model is still thinking or ran out of budget in thought.
   */
  reasoningChars?: number
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
  termination: StreamTermination
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
  /** External abort signal — propagated to Provider SDK for cancel support */
  signal?: AbortSignal
  /** Per-call timeout in ms — propagated to Provider SDK; default set by task-queue (900_000) */
  timeoutMs?: number
}

/** Response returned by aiProxy.call() */
export interface AiProxyResponse {
  content: string
  usage: TokenUsage
  model: string
  provider: string
  latencyMs: number
  finishReason: string
  termination: StreamTermination
}

// ─── Provider configuration ───

export type AiProviderName = 'claude' | 'openai'

export interface AiProxyConfig {
  provider: AiProviderName
  anthropicApiKey?: string
  openaiApiKey?: string
  /** Shared base URL — applies to whichever provider is active */
  baseUrl?: string
  /** @deprecated Use baseUrl. Kept for backwards-compat with existing encrypted configs */
  openaiBaseUrl?: string
  defaultModel?: string
  desensitizeEnabled: boolean
}

export interface AiConfigStatus {
  configured: boolean
  configPath: string
  provider?: AiProviderName
  defaultModel?: string
  baseUrl?: string
  desensitizeEnabled: boolean
  hasApiKey: boolean
  lastError?: string
}

export interface SaveAiProxyConfigInput {
  provider: AiProviderName
  apiKey?: string
  defaultModel?: string
  baseUrl?: string
  desensitizeEnabled?: boolean
}

/** Per-provider connection config passed to createProvider() */
export interface ProviderConfig {
  provider: AiProviderName
  apiKey: string
  defaultModel: string
  baseURL?: string
}

// ─── Agent Orchestrator types (Story 2.2) ───

/** Alpha agent types — Beta extends with 'scoring' | 'gap' */
export type AgentType =
  | 'parse'
  | 'generate'
  | 'extract'
  | 'seed'
  | 'attribute-sources'
  | 'validate-baseline'
  | 'fog-map'
  | 'traceability'
  | 'adversarial'
  | 'adversarial-review'
  | 'attack-checklist'
  | 'skill'
  | 'skill-diagram'
  | 'chapter-summary'

/** Task status state machine */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Task priority levels */
export type TaskPriority = 'low' | 'normal' | 'high'

/** Whitelist categories for async task queue */
export type TaskCategory =
  | 'ai'
  | 'ai-agent'
  | 'ocr'
  | 'import'
  | 'export'
  | 'git-sync'
  | 'semantic-search'

/** Progress event pushed from main → renderer via webContents.send */
export interface TaskProgressEvent {
  taskId: string
  progress: number
  message?: string
  payload?: unknown
}

/** Task record persisted in SQLite tasks table */
export interface TaskRecord {
  id: string
  category: TaskCategory
  agentType?: AgentType
  status: TaskStatus
  priority: TaskPriority
  progress: number
  input: string
  output?: string
  error?: string
  retryCount: number
  maxRetries: number
  checkpoint?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

/** Options for agent execution */
export interface AgentExecuteOptions {
  priority?: TaskPriority
  timeoutMs?: number
  /** Max task-queue retries (0 = no queue-level retry, provider handles retries). */
  maxRetries?: number
}

/** Request to execute an agent */
export interface AgentExecuteRequest {
  agentType: AgentType
  context: Record<string, unknown>
  options?: AgentExecuteOptions
}

/** Synchronous response from execute() — task enqueued */
export interface AgentExecuteResponse {
  taskId: string
}

/** Final result when agent task completes */
export interface AgentExecuteResult {
  content: string
  usage: TokenUsage
  latencyMs: number
  /** Provider reported by ai-proxy when the handler uses the default AI path (Story 3.12). */
  provider?: string
  /** Model id reported by the provider response (Story 3.12). */
  model?: string
}

/** Agent status query response */
export interface AgentStatus {
  taskId: string
  status: TaskStatus
  progress: number
  agentType: AgentType
  createdAt: string
  updatedAt: string
  result?: AgentExecuteResult
  error?: { code: string; message: string }
}
