/**
 * AI Proxy service — single entry point for all AI calls.
 * Orchestrates: desensitize → provider call → trace log → restore → return.
 *
 * Security invariant: trace log is written BEFORE restore, so logs never contain plaintext.
 */
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { getAiConfigRecoveryHint, getAiProxyConfig } from '@main/config/app-config'
import { Desensitizer } from '@main/services/ai-proxy/desensitizer'
import { createProvider, getDefaultModel } from '@main/services/ai-proxy/provider-adapter'
import { writeTrace } from '@main/services/ai-proxy/ai-trace-logger'
import { remove as removeMapping } from '@main/services/ai-proxy/mapping-store'
import type { TraceEntry } from '@main/services/ai-proxy/ai-trace-logger'
import type { DesensitizeStats } from '@main/services/ai-proxy/desensitizer'
import type { AiProvider } from '@main/services/ai-proxy/provider-adapter'
import type {
  AiChatMessage,
  AiProxyConfig,
  AiProxyRequest,
  AiProxyResponse,
} from '@shared/ai-types'

const logger = createLogger('ai-proxy')
const TRACE_REDACTED_PLACEHOLDER = '[TRACE_REDACTED]'
const TRACE_DESENSITIZATION_DISABLED_PLACEHOLDER = '[DESENSITIZATION_DISABLED]'

function isAiProxyError(err: unknown): boolean {
  return err instanceof AiProxyError || (err instanceof Error && err.name === 'AiProxyError')
}

function cloneMessages(messages: AiChatMessage[]): AiChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }))
}

function createTracePlaceholderMessages(
  messages: AiChatMessage[],
  placeholder: string
): AiChatMessage[] {
  return messages.map((message) => ({ role: message.role, content: placeholder }))
}

class AiProxyService {
  private desensitizer = new Desensitizer()
  private provider: AiProvider | null = null
  private config: AiProxyConfig | null = null

  private async ensureProvider(): Promise<{ provider: AiProvider; config: AiProxyConfig }> {
    // E2E mock: bypass encrypted config and real provider SDKs entirely
    if (process.env.BIDWISE_E2E_AI_MOCK === 'true') {
      if (!this.provider) {
        const { MockAiProvider } = await import('./mock-provider')
        this.provider = new MockAiProvider()
        this.config = {
          provider: 'claude',
          anthropicApiKey: 'mock-key',
          desensitizeEnabled: false,
        }
        logger.info('AI Proxy using MockAiProvider (BIDWISE_E2E_AI_MOCK=true)')
      }
      return { provider: this.provider, config: this.config! }
    }

    if (!this.config) {
      this.config = await getAiProxyConfig()
    }
    if (!this.provider) {
      const apiKey =
        this.config.provider === 'claude' ? this.config.anthropicApiKey : this.config.openaiApiKey
      if (!apiKey) {
        throw new AiProxyError(
          ErrorCode.AI_PROXY_AUTH,
          `缺少 ${this.config.provider} 的 API Key。${getAiConfigRecoveryHint()}`
        )
      }
      this.provider = createProvider({
        provider: this.config.provider,
        apiKey,
        defaultModel: this.config.defaultModel ?? getDefaultModel(this.config.provider),
        ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {}),
      })
    }
    return { provider: this.provider, config: this.config }
  }

  async call(request: AiProxyRequest): Promise<AiProxyResponse> {
    const start = Date.now()
    let desensitizeStats: DesensitizeStats = { totalReplacements: 0, byType: {} }
    let mappingId = ''
    let messagesToSend = cloneMessages(request.messages)
    let traceMessages = createTracePlaceholderMessages(request.messages, TRACE_REDACTED_PLACEHOLDER)
    let traceProvider = 'unknown'
    let traceModel = request.model ?? 'unknown'

    try {
      const { provider, config } = await this.ensureProvider()
      const model = request.model ?? config.defaultModel ?? getDefaultModel(config.provider)
      traceProvider = config.provider
      traceModel = model

      // Step 1: Desensitize
      if (config.desensitizeEnabled) {
        const result = await this.desensitizer.desensitize(messagesToSend)
        messagesToSend = result.messages
        traceMessages = cloneMessages(result.messages)
        mappingId = result.mappingId
        desensitizeStats = result.stats
      } else {
        traceMessages = createTracePlaceholderMessages(
          messagesToSend,
          TRACE_DESENSITIZATION_DISABLED_PLACEHOLDER
        )
      }

      // Step 2: Provider call
      const response = await provider.chat(
        {
          messages: messagesToSend,
          model,
          temperature: request.temperature,
          maxTokens: request.maxTokens ?? 4096,
        },
        {
          signal: request.signal,
          timeoutMs: request.timeoutMs,
          caller: request.caller,
        }
      )

      const latencyMs = Date.now() - start

      // Step 3: Trace log (BEFORE restore — security invariant)
      const traceEntry: TraceEntry = {
        timestamp: new Date().toISOString(),
        caller: request.caller,
        provider: config.provider,
        model: response.model,
        desensitizedInput: traceMessages,
        outputContent: response.content,
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        latencyMs,
        status: 'success',
        desensitizeStats,
      }
      await writeTrace(traceEntry)

      // Step 4: Restore
      let content = response.content
      if (config.desensitizeEnabled && mappingId) {
        content = await this.desensitizer.restore(response.content, mappingId)
      }

      logger.info(
        `AI call completed: caller=${request.caller} provider=${config.provider} model=${response.model} latency=${latencyMs}ms tokens=${response.usage.promptTokens}+${response.usage.completionTokens} finishReason=${response.finishReason}`
      )

      return {
        content,
        usage: response.usage,
        model: response.model,
        provider: config.provider,
        latencyMs,
        finishReason: response.finishReason,
        termination: response.termination,
      }
    } catch (err) {
      const latencyMs = Date.now() - start

      // Log error trace
      const traceEntry: TraceEntry = {
        timestamp: new Date().toISOString(),
        caller: request.caller,
        provider: traceProvider,
        model: traceModel,
        desensitizedInput: traceMessages,
        outputContent: null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        status: 'error',
        errorCode: isAiProxyError(err) ? (err as AiProxyError).code : ErrorCode.AI_PROXY,
        errorMessage: err instanceof Error ? err.message : String(err),
        desensitizeStats,
      }

      try {
        await writeTrace(traceEntry)
      } catch (logErr) {
        logger.error('Failed to write error trace log', logErr)
      }

      // Clean up mapping if we created one
      if (mappingId) {
        try {
          await removeMapping(mappingId)
        } catch {
          // Best effort cleanup
        }
      }

      if (isAiProxyError(err)) throw err
      throw new AiProxyError(
        ErrorCode.AI_PROXY,
        `AI 调用失败: ${err instanceof Error ? err.message : String(err)}`,
        err
      )
    }
  }

  /** Reset cached provider (for config changes or testing) */
  reset(): void {
    this.provider = null
    this.config = null
  }
}

export const aiProxy = new AiProxyService()
