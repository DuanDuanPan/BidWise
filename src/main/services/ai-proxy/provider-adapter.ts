/**
 * Multi-provider adapter layer — Claude / OpenAI seamless switching.
 * Each provider translates unified AiChatRequest/Response to native SDK format.
 *
 * The adapter defends against four stream termination states uniformly across
 * providers, so business code never has to guess:
 *
 *   - completed  : natural end (stop / end_turn / tool_use)
 *   - truncated  : max_tokens / length cap hit — content may be partial/empty,
 *                  business layer decides whether to escalate maxTokens
 *   - aborted    : stream was interrupted (idle timeout, upstream cancel,
 *                  network). Retried by withRetry unless upstream cancelled.
 *   - incomplete : no finish_reason observed and no error — server closed
 *                  connection early; retried.
 *
 * Thinking-model support (Gemini pro, DeepSeek-R1, future Claude thinking):
 *   - `reasoning_content` / thinking chunks keep the idle watchdog alive but
 *     are NEVER promoted to the returned `content`. Thinking text is the
 *     model's scratch space, not its answer; handing it back as "content"
 *     produces malformed output (e.g. prose with `<svg` mentions but no
 *     valid SVG tree). reasoningChars is surfaced on termination for
 *     diagnostics.
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import type {
  AiChatRequest,
  AiChatResponse,
  AiChatMessage,
  ProviderConfig,
  StreamTermination,
} from '@shared/ai-types'

const streamLogger = createLogger('ai-proxy:stream')

// Heartbeat thresholds: log progress on whichever hits first. Token-level logs
// would spam (thousands per diagram); time+chars keeps monitoring actionable.
const STREAM_HEARTBEAT_INTERVAL_MS = 3000
const STREAM_HEARTBEAT_CHAR_STEP = 4096

// Idle watchdog: if no delta (content OR reasoning) arrives for this long,
// abort so withRetry can kick in instead of blocking until the outer task
// timeout fires. 180s accommodates thinking models (Gemini pro / R1) that
// silently reason for 60–120s before emitting any content tokens.
// Non-thinking models stream first delta in <5s and never trip this.
const STREAM_IDLE_TIMEOUT_MS = 180_000

/**
 * Link an upstream AbortSignal to a fresh controller so the provider can
 * abort on its own (e.g. idle timeout) without racing with the caller.
 * Upstream aborts forward to the internal controller; internal aborts do not
 * propagate upward. Caller must invoke cleanup() after the request completes
 * to avoid leaking listeners on long-lived signals.
 */
function linkAbort(upstream?: AbortSignal): {
  controller: AbortController
  cleanup: () => void
} {
  const controller = new AbortController()
  if (!upstream) return { controller, cleanup: () => undefined }
  if (upstream.aborted) {
    controller.abort(upstream.reason)
    return { controller, cleanup: () => undefined }
  }
  const forward = (): void => controller.abort(upstream.reason)
  upstream.addEventListener('abort', forward, { once: true })
  return { controller, cleanup: () => upstream.removeEventListener('abort', forward) }
}

const IDLE_TIMEOUT_MARKER = 'stream idle timeout after'

function createStreamHeartbeat(
  caller: string,
  opts?: { idleMs?: number; controller?: AbortController }
): {
  onContentDelta: (delta: string) => void
  onReasoningDelta: (delta: string) => void
  onEnd: (accumulated: string, extra?: Record<string, unknown>) => void
  dispose: () => void
} {
  const startedAt = Date.now()
  let totalChars = 0
  let totalReasoningChars = 0
  let lastLogMs = startedAt
  let lastLogChars = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const idleMs = opts?.idleMs
  const controller = opts?.controller

  const armIdle = (): void => {
    if (!idleMs || !controller) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      streamLogger.warn(
        `stream idle timeout caller=${caller} after ${idleMs}ms — aborting ` +
          `(contentChars=${totalChars}, reasoningChars=${totalReasoningChars})`
      )
      controller.abort(new Error(`${IDLE_TIMEOUT_MARKER} ${idleMs}ms`))
    }, idleMs)
  }

  streamLogger.info(`stream start caller=${caller}`)
  armIdle()

  return {
    onContentDelta(delta: string) {
      totalChars += delta.length
      const now = Date.now()
      if (
        now - lastLogMs >= STREAM_HEARTBEAT_INTERVAL_MS ||
        totalChars - lastLogChars >= STREAM_HEARTBEAT_CHAR_STEP
      ) {
        const elapsed = ((now - startedAt) / 1000).toFixed(1)
        const charsPerSec = Math.round(totalChars / Math.max((now - startedAt) / 1000, 0.001))
        streamLogger.info(
          `stream heartbeat caller=${caller} elapsed=${elapsed}s chars=${totalChars} rate=${charsPerSec}/s`
        )
        lastLogMs = now
        lastLogChars = totalChars
      }
      armIdle()
    },
    onReasoningDelta(delta: string) {
      // Thinking tokens don't count toward content char heartbeat (separate
      // field so operators can tell a thinking-only stall from a silent one),
      // but they MUST reset the idle watchdog — otherwise a model in a long
      // reasoning phase gets killed mid-thought. See header for rationale.
      totalReasoningChars += delta.length
      const now = Date.now()
      if (now - lastLogMs >= STREAM_HEARTBEAT_INTERVAL_MS) {
        const elapsed = ((now - startedAt) / 1000).toFixed(1)
        streamLogger.info(
          `stream heartbeat (reasoning) caller=${caller} elapsed=${elapsed}s reasoningChars=${totalReasoningChars} contentChars=${totalChars}`
        )
        lastLogMs = now
      }
      armIdle()
    },
    onEnd(accumulated: string, extra?: Record<string, unknown>) {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
      const merged = { ...(extra ?? {}), reasoningChars: totalReasoningChars }
      const extraStr =
        ' ' +
        Object.entries(merged)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      streamLogger.info(
        `stream end caller=${caller} elapsed=${elapsed}s chars=${accumulated.length}${extraStr}`
      )
    },
    dispose() {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    },
  }
}

/**
 * Map a raw provider finishReason to a normalized termination, with context
 * about whether the iteration loop errored or the controller aborted.
 *
 * Upstream cancel (caller's AbortSignal) vs idle timeout (our controller) vs
 * network tear-down produce different retry policies; this function
 * centralizes the decision so Claude and OpenAI paths stay consistent.
 */
function classifyTermination(args: {
  iterError: unknown
  controllerAborted: boolean
  upstreamAborted: boolean
  finishReason: string | null
  reasoningChars: number
}): StreamTermination {
  const { iterError, controllerAborted, upstreamAborted, finishReason, reasoningChars } = args
  const base = {
    finishReason,
    ...(reasoningChars > 0 ? { reasoningChars } : {}),
  }

  // Only treat abort as decisive if it actually interrupted iteration.
  // An abort that fires after the stream already yielded its final chunk
  // (race between upstream cancel and stream completion) should not
  // invalidate a good response.
  if (iterError) {
    if (controllerAborted) {
      if (upstreamAborted) return { kind: 'aborted', abortCause: 'upstream-cancel', ...base }
      const msg = iterError instanceof Error ? iterError.message.toLowerCase() : ''
      if (msg.includes('idle timeout')) {
        return { kind: 'aborted', abortCause: 'idle-timeout', ...base }
      }
      return { kind: 'aborted', abortCause: 'network', ...base }
    }
    // Iteration threw without our controller aborting — network or SDK bug.
    return { kind: 'incomplete', ...base }
  }

  // Stream iterated to completion without exception.
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    return { kind: 'truncated', ...base }
  }
  if (finishReason === null) {
    // No finish_reason AND no error. If the controller was aborted, the
    // stream was cut short mid-flight; otherwise the server closed the
    // connection early. Both retry as 'incomplete' / 'aborted'.
    if (controllerAborted) {
      if (upstreamAborted) return { kind: 'aborted', abortCause: 'upstream-cancel', ...base }
      return { kind: 'aborted', abortCause: 'idle-timeout', ...base }
    }
    return { kind: 'incomplete', ...base }
  }
  return { kind: 'completed', ...base }
}

// No default timeout — upstream (task-queue) controls timeout via options.timeoutMs

// ─── Provider call options ───

export interface AiProviderCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
  caller?: string
}

// ─── Provider interface ───

export interface AiProvider {
  readonly name: string
  chat(request: AiChatRequest, options?: AiProviderCallOptions): Promise<AiChatResponse>
}

// ─── Retry logic ───

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

function isRetryable(err: unknown, signal?: AbortSignal): boolean {
  // Never retry if the caller's signal was aborted (cancellation or timeout from upstream)
  if (signal?.aborted) return false
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('timeout')) return true
    // 'aborted' without signal.aborted means a transient network abort, not caller cancel
    if (msg.includes('aborted')) return true
    if (msg.includes('empty ai response')) return true
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

async function withRetry(
  fn: () => Promise<AiChatResponse>,
  signal?: AbortSignal
): Promise<AiChatResponse> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES && isRetryable(err, signal)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay)
          // If signal aborts during backoff, resolve immediately to exit
          if (signal) {
            const onAbort = (): void => {
              clearTimeout(timer)
              resolve()
            }
            if (signal.aborted) {
              clearTimeout(timer)
              resolve()
              return
            }
            signal.addEventListener('abort', onAbort, { once: true })
          }
        })
        // After backoff, check if signal was aborted before retrying
        if (signal?.aborted) {
          throw classifyError(err)
        }
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

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
  }

  async chat(request: AiChatRequest, options?: AiProviderCallOptions): Promise<AiChatResponse> {
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

      // Streaming required when maxTokens large enough that request may exceed
      // 10 min — SDK refuses non-streaming calls past that threshold
      // (expectedTimeout = 60*60*maxTokens/128000 > 600s → ~21333 tokens).
      // Skill diagram pipeline uses 65536+, so always stream and collect.
      const { controller, cleanup } = linkAbort(options?.signal)
      const heartbeat = createStreamHeartbeat(options?.caller ?? 'claude', {
        idleMs: STREAM_IDLE_TIMEOUT_MS,
        controller,
      })
      let reasoningChars = 0
      try {
        const stream = this.client.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(system ? { system } : {}),
            messages,
          },
          {
            ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
            signal: controller.signal,
          }
        )
        if (typeof stream.on === 'function') {
          stream.on('text', (delta: string) => heartbeat.onContentDelta(delta))
          // Claude extended thinking emits 'thinking' events; reset idle so
          // long thought phases don't get killed even though no text flows.
          // Safe no-op if the model isn't in thinking mode.
          try {
            stream.on('thinking', (delta: string) => {
              reasoningChars += delta.length
              heartbeat.onReasoningDelta(delta)
            })
          } catch {
            /* SDK version without 'thinking' event — ignore */
          }
        }
        let iterError: unknown = null
        let stopReason: string | null = null
        let content = ''
        let inputTokens = 0
        let outputTokens = 0
        let model = request.model
        try {
          const response = await stream.finalMessage()
          content = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('')
          stopReason = response.stop_reason ?? null
          inputTokens = response.usage.input_tokens
          outputTokens = response.usage.output_tokens
          model = response.model
        } catch (err) {
          iterError = err
        }

        const termination = classifyTermination({
          iterError,
          controllerAborted: controller.signal.aborted,
          upstreamAborted: options?.signal?.aborted ?? false,
          finishReason: stopReason,
          reasoningChars,
        })

        heartbeat.onEnd(content, {
          inputTokens,
          outputTokens,
          stopReason: stopReason ?? 'unknown',
          termination: termination.kind,
          ...(termination.abortCause ? { abortCause: termination.abortCause } : {}),
        })

        // Truncation is a valid outcome (partial content). Return it so the
        // business layer can escalate maxTokens; do NOT throw.
        if (termination.kind === 'truncated') {
          return {
            content,
            usage: { promptTokens: inputTokens, completionTokens: outputTokens },
            model,
            finishReason: stopReason ?? 'max_tokens',
            termination,
          }
        }
        if (termination.kind === 'completed' && content.length > 0) {
          return {
            content,
            usage: { promptTokens: inputTokens, completionTokens: outputTokens },
            model,
            finishReason: stopReason ?? 'end_turn',
            termination,
          }
        }

        // Upstream cancel: propagate original error, do not wrap as retryable.
        if (
          termination.kind === 'aborted' &&
          termination.abortCause === 'upstream-cancel' &&
          iterError
        ) {
          throw iterError
        }

        // Everything else (idle abort, incomplete, network error, completed
        // with empty content) is retryable at this tier.
        if (iterError) throw iterError
        throw new Error(
          `Empty AI response: termination=${termination.kind} stopReason=${stopReason ?? 'null'} ` +
            `outputTokens=${outputTokens} reasoningChars=${reasoningChars}`
        )
      } finally {
        heartbeat.dispose()
        cleanup()
      }
    }, options?.signal)
  }
}

// ─── OpenAI Provider ───

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai'
  private client: OpenAI

  private baseURL: string

  constructor(apiKey: string, baseURL?: string) {
    this.baseURL = baseURL ?? '(SDK default)'
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    })
  }

  async chat(request: AiChatRequest, options?: AiProviderCallOptions): Promise<AiChatResponse> {
    return withRetry(async () => {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
        request.messages.map((msg: AiChatMessage) => ({
          role: msg.role,
          content: msg.content,
        }))

      // Stream for parity with Claude path: long generations stay responsive,
      // heartbeat logs expose progress, and there is no silent >10 min wait.
      // `stream_options.include_usage` makes usage arrive in the final chunk.
      const { controller, cleanup } = linkAbort(options?.signal)
      const heartbeat = createStreamHeartbeat(options?.caller ?? 'openai', {
        idleMs: STREAM_IDLE_TIMEOUT_MS,
        controller,
      })
      streamLogger.info(
        `openai request baseURL=${this.baseURL} model=${request.model} caller=${options?.caller ?? 'openai'}`
      )
      try {
        const stream = await this.client.chat.completions.create(
          {
            model: request.model,
            messages,
            max_tokens: request.maxTokens,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            stream: true,
            stream_options: { include_usage: true },
          },
          {
            ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
            signal: controller.signal,
          }
        )

        let content = ''
        let reasoningChars = 0
        let model = request.model
        let finishReason: string | null = null
        let promptTokens = 0
        let completionTokens = 0
        let chunkIndex = 0
        let loggedShape = false
        let iterError: unknown = null

        try {
          for await (const chunk of stream) {
            chunkIndex += 1
            // One-shot diagnostic: proxies carry text in delta.content,
            // delta.reasoning_content (R1 / Gemini convention), or (non-stream
            // fake) message.content. Log first chunks so operators can see
            // which field a given backend populates.
            if (!loggedShape && chunkIndex <= 3) {
              try {
                const dump = JSON.stringify(chunk).slice(0, 600)
                streamLogger.info(
                  `stream chunk[${chunkIndex}] caller=${options?.caller ?? 'openai'} shape=${dump}`
                )
                if (chunkIndex >= 2) loggedShape = true
              } catch {
                /* ignore stringify errors */
              }
            }

            if (chunk.model) model = chunk.model
            const choice = chunk.choices?.[0]
            if (choice) {
              const delta = choice.delta as
                | { content?: unknown; reasoning_content?: unknown }
                | undefined
              const deltaContent = delta?.content
              if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                content += deltaContent
                heartbeat.onContentDelta(deltaContent)
              }
              // Thinking tokens keep the idle watchdog alive but are NOT
              // promoted to content. See header comment for why this matters
              // (e.g. prose mentioning `<svg` with no closing tag).
              const deltaReasoning = delta?.reasoning_content
              if (typeof deltaReasoning === 'string' && deltaReasoning.length > 0) {
                reasoningChars += deltaReasoning.length
                heartbeat.onReasoningDelta(deltaReasoning)
              }
              if (choice.finish_reason) finishReason = choice.finish_reason
            }
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens ?? promptTokens
              completionTokens = chunk.usage.completion_tokens ?? completionTokens
            }
          }
        } catch (err) {
          iterError = err
        }

        const termination = classifyTermination({
          iterError,
          controllerAborted: controller.signal.aborted,
          upstreamAborted: options?.signal?.aborted ?? false,
          finishReason,
          reasoningChars,
        })

        heartbeat.onEnd(content, {
          promptTokens,
          completionTokens,
          finishReason: finishReason ?? 'unknown',
          termination: termination.kind,
          ...(termination.abortCause ? { abortCause: termination.abortCause } : {}),
        })

        if (reasoningChars > 0 && content.length === 0) {
          streamLogger.warn(
            `stream produced only reasoning (${reasoningChars} chars) with empty content ` +
              `caller=${options?.caller ?? 'openai'} termination=${termination.kind} ` +
              `finishReason=${finishReason ?? 'null'} — NOT used as answer, retry will follow`
          )
        }

        // Truncation: return partial content and let business layer escalate
        // maxTokens (withRetry would retry with the same cap and burn money).
        if (termination.kind === 'truncated') {
          return {
            content,
            usage: { promptTokens, completionTokens },
            model,
            finishReason: finishReason ?? 'length',
            termination,
          }
        }

        if (termination.kind === 'completed' && content.length > 0) {
          return {
            content,
            usage: { promptTokens, completionTokens },
            model,
            finishReason: finishReason ?? 'stop',
            termination,
          }
        }

        if (
          termination.kind === 'aborted' &&
          termination.abortCause === 'upstream-cancel' &&
          iterError
        ) {
          throw iterError
        }

        if (iterError) throw iterError
        throw new Error(
          `Empty AI response: termination=${termination.kind} ` +
            `finishReason=${finishReason ?? 'null'} chunks=${chunkIndex} ` +
            `outputTokens=${completionTokens} reasoningChars=${reasoningChars}`
        )
      } finally {
        heartbeat.dispose()
        cleanup()
      }
    }, options?.signal)
  }
}

// ─── Factory ───

const DEFAULT_MODELS: Record<string, string> = {
  claude: 'claude-opus-4-6',
  openai: 'gpt-4o',
}

export function createProvider(config: ProviderConfig): AiProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config.apiKey, config.baseURL)
    case 'openai':
      return new OpenAiProvider(config.apiKey, config.baseURL)
    default:
      throw new AiProxyError(
        ErrorCode.AI_PROXY_PROVIDER,
        `不支持的 AI Provider: ${config.provider as string}`
      )
  }
}

export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] ?? 'claude-opus-4-6'
}
