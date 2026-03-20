import { createIpcHandler } from './create-handler'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import type { IpcChannel } from '@shared/ipc-types'

type AgentChannel = Extract<IpcChannel, `agent:${string}`>

const agentHandlerMap: { [C in AgentChannel]: () => void } = {
  'agent:execute': () =>
    createIpcHandler('agent:execute', (input) => agentOrchestrator.execute(input)),
  'agent:status': () =>
    createIpcHandler('agent:status', (taskId) => agentOrchestrator.getAgentStatus(taskId)),
}

export type RegisteredAgentChannels = AgentChannel

export function registerAgentHandlers(): void {
  for (const register of Object.values(agentHandlerMap)) {
    register()
  }
}
