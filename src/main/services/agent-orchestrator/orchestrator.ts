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

/** AI request parameters returned by agent handlers */
export interface AiRequestParams {
  messages: AiChatMessage[]
  model?: string
  maxTokens?: number
  temperature?: number
}

/** Agent handler — builds prompt/params only, does NOT call ai-proxy */
export type AgentHandler = (
  context: Record<string, unknown>,
  options: {
    signal: AbortSignal
    updateProgress: (progress: number, message?: string) => void
  }
) => Promise<AiRequestParams>

export class AgentOrchestrator {
  private agents = new Map<AgentType, AgentHandler>()

  registerAgent(type: AgentType, handler: AgentHandler): void {
    this.agents.set(type, handler)
    taskQueue.registerExecutor(
      { category: 'ai-agent', agentType: type },
      this.createExecutor(type, handler)
    )
    logger.info(`Agent registered: ${type}`)
  }

  private createExecutor(
    agentType: AgentType,
    handler: AgentHandler,
    timeoutMs?: number
  ): TaskExecutor {
    return async (ctx: TaskExecutorContext) => {
      throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

      try {
        const params = await handler(ctx.input as Record<string, unknown>, {
          signal: ctx.signal,
          updateProgress: ctx.updateProgress,
        })
        throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

        const caller = `${agentType}-agent`
        const response = await aiProxy.call({
          ...params,
          caller,
          signal: ctx.signal,
          timeoutMs,
        })
        throwIfAborted(ctx.signal, `Agent ${agentType} task cancelled`)

        const result: AgentExecuteResult = {
          content: response.content,
          usage: response.usage,
          latencyMs: response.latencyMs,
        }
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

  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
    const handler = this.agents.get(request.agentType)
    if (!handler) {
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
    const executor = this.createExecutor(request.agentType, handler, timeoutMs)
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
