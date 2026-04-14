import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { aiProxy } from '@main/services/ai-proxy'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutor, TaskExecutorContext } from '@main/services/task-queue'
import type {
  AgentType,
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentStatus,
  AgentExecuteResult,
  AiChatMessage,
} from '@shared/ai-types'

const logger = createLogger('agent-orchestrator')

function isAgentResult(result: AiRequestParams | AgentHandlerResult): result is AgentHandlerResult {
  return typeof result === 'object' && result !== null && 'kind' in result && 'value' in result
}

function unwrapAiRequestParams(result: AiRequestParams | AgentHandlerResult): AiRequestParams {
  if (isAgentResult(result)) {
    if (result.kind === 'params') {
      return result.value
    }
    throw new BidWiseError(
      ErrorCode.AGENT_EXECUTE,
      'Agent handler returned a final result where ai params were expected'
    )
  }
  return result
}

/** AI request parameters returned by agent handlers */
export interface AiRequestParams {
  messages: AiChatMessage[]
  model?: string
  maxTokens?: number
  temperature?: number
}

export type AgentHandlerResult =
  | { kind: 'params'; value: AiRequestParams }
  | { kind: 'result'; value: AgentExecuteResult }

type AiProxyLike = Pick<typeof aiProxy, 'call'>

/** Agent handler — may either return prompt params or execute via ai-proxy directly */
export type AgentHandler = (
  context: Record<string, unknown>,
  options: {
    signal: AbortSignal
    updateProgress: (progress: number, message?: string, payload?: unknown) => void
    aiProxy?: AiProxyLike
    setCheckpoint?: (data: unknown) => Promise<void>
    checkpoint?: unknown
  }
) => Promise<AiRequestParams | AgentHandlerResult>

/** Optional post-processor applied to AI results after generation */
export type AgentPostProcessor = (
  result: AgentExecuteResult,
  context: Record<string, unknown>,
  signal: AbortSignal
) => Promise<AgentExecuteResult>

export class AgentOrchestrator {
  private agents = new Map<
    AgentType,
    { handler: AgentHandler; postProcessor?: AgentPostProcessor }
  >()

  registerAgent(type: AgentType, handler: AgentHandler, postProcessor?: AgentPostProcessor): void {
    this.agents.set(type, { handler, postProcessor })
    taskQueue.registerExecutor(
      { category: 'ai-agent', agentType: type },
      this.createExecutor(type, handler, undefined, postProcessor)
    )
    logger.info(`Agent registered: ${type}`)
  }

  private createExecutor(
    agentType: AgentType,
    handler: AgentHandler,
    timeoutMs?: number,
    postProcessor?: AgentPostProcessor
  ): TaskExecutor {
    return async (ctx: TaskExecutorContext) => {
      throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

      try {
        logger.info(
          `Task executor start: agentType=${agentType}, taskId=${ctx.taskId ?? 'unknown'}`
        )
        const handlerResult = await handler(ctx.input as Record<string, unknown>, {
          signal: ctx.signal,
          updateProgress: ctx.updateProgress,
          aiProxy,
          setCheckpoint: ctx.setCheckpoint,
          checkpoint: ctx.checkpoint,
        })
        throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

        let result: AgentExecuteResult
        if (isAgentResult(handlerResult) && handlerResult.kind === 'result') {
          logger.info(
            `Task executor handler returned direct result: agentType=${agentType}, contentLen=${handlerResult.value.content.length}`
          )
          result = handlerResult.value
        } else {
          const params = unwrapAiRequestParams(handlerResult)
          const caller = `${agentType}-agent`
          const response = await aiProxy.call({
            ...params,
            caller,
            signal: ctx.signal,
            timeoutMs,
          })
          throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

          result = {
            content: response.content,
            usage: response.usage,
            latencyMs: response.latencyMs,
          }
        }

        if (postProcessor) {
          logger.info(
            `Task executor running postProcessor: agentType=${agentType}, inputContentLen=${result.content.length}`
          )
          result = await postProcessor(result, ctx.input as Record<string, unknown>, ctx.signal)
          throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)
          logger.info(
            `Task executor postProcessor done: agentType=${agentType}, outputContentLen=${result.content.length}`
          )
        }

        logger.info(
          `Task executor complete: agentType=${agentType}, finalContentLen=${result.content.length}`
        )
        return result
      } catch (err) {
        if (ctx.signal.aborted || isAbortError(err)) throw err
        if (err instanceof BidWiseError) throw err
        throw new BidWiseError(
          ErrorCode.AGENT_EXECUTE,
          `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
          err
        )
      }
    }
  }

  /**
   * Execute an agent task with an optional completion callback.
   * The callback fires in the main process after the task finishes
   * (success, failure, or cancellation) — used by batch orchestration
   * to chain sub-chapter tasks.
   */
  async executeWithCallback(
    request: AgentExecuteRequest,
    onComplete: (
      taskId: string,
      result: { status: 'completed' | 'failed' | 'cancelled'; content?: string; error?: string }
    ) => void
  ): Promise<AgentExecuteResponse> {
    const registered = this.agents.get(request.agentType)
    if (!registered) {
      throw new BidWiseError(
        ErrorCode.AGENT_NOT_FOUND,
        `Agent type not registered: ${request.agentType}`
      )
    }

    const taskId = await taskQueue.enqueue({
      category: 'ai-agent',
      agentType: request.agentType,
      input: request.context,
      priority: request.options?.priority ?? 'normal',
      maxRetries: request.options?.maxRetries,
    })

    const timeoutMs = request.options?.timeoutMs
    const executor = this.createExecutor(
      request.agentType,
      registered.handler,
      timeoutMs,
      registered.postProcessor
    )
    taskQueue
      .execute(taskId, executor, { timeoutMs })
      .then(async (taskRecord) => {
        if (taskRecord.status === 'completed' && taskRecord.output) {
          try {
            const parsed = JSON.parse(taskRecord.output) as { content?: string }
            onComplete(taskId, { status: 'completed', content: parsed.content })
          } catch {
            onComplete(taskId, { status: 'completed', content: taskRecord.output })
          }
        } else if (taskRecord.status === 'failed') {
          onComplete(taskId, { status: 'failed', error: taskRecord.error })
        } else if (taskRecord.status === 'cancelled') {
          onComplete(taskId, { status: 'cancelled', error: taskRecord.error })
        }
      })
      .catch((err) => {
        logger.error(`Background task ${taskId} error (with callback):`, err)
        onComplete(taskId, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      })

    return { taskId }
  }

  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
    const registered = this.agents.get(request.agentType)
    if (!registered) {
      throw new BidWiseError(
        ErrorCode.AGENT_NOT_FOUND,
        `Agent type not registered: ${request.agentType}`
      )
    }

    // Enqueue task
    const taskId = await taskQueue.enqueue({
      category: 'ai-agent',
      agentType: request.agentType,
      input: request.context,
      priority: request.options?.priority ?? 'normal',
      maxRetries: request.options?.maxRetries,
    })

    // Fire-and-forget background execution
    const timeoutMs = request.options?.timeoutMs
    const executor = this.createExecutor(
      request.agentType,
      registered.handler,
      timeoutMs,
      registered.postProcessor
    )
    taskQueue.execute(taskId, executor, { timeoutMs }).catch((err) => {
      // Background execution error — already handled by task-queue status
      logger.error(`Background task ${taskId} error:`, err)
    })

    return { taskId }
  }

  async getAgentStatus(taskId: string): Promise<AgentStatus> {
    const task = await taskQueue.getStatus(taskId)

    if (task.category !== 'ai-agent') {
      throw new BidWiseError(
        ErrorCode.AGENT_NOT_FOUND,
        `Task ${taskId} is not an agent task (category: ${task.category})`
      )
    }

    let result: AgentExecuteResult | undefined
    if (task.status === 'completed' && task.output) {
      try {
        result = JSON.parse(task.output) as AgentExecuteResult
      } catch {
        // output might not be valid JSON
      }
    }

    let error: { code: string; message: string } | undefined
    if (task.error) {
      error = {
        code: task.status === 'cancelled' ? ErrorCode.TASK_CANCELLED : ErrorCode.AGENT_EXECUTE,
        message: task.error,
      }
    }

    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      agentType: task.agentType as AgentType,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      result,
      error,
    }
  }

  async cancelAgent(taskId: string): Promise<void> {
    await taskQueue.cancel(taskId)
  }
}
