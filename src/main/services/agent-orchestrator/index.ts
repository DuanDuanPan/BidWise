export { AgentOrchestrator } from './orchestrator'
export type { AgentHandler, AiRequestParams } from './orchestrator'
import { AgentOrchestrator } from './orchestrator'
import { parseAgentHandler } from './agents/parse-agent'
import { generateAgentHandler } from './agents/generate-agent'

export const agentOrchestrator = new AgentOrchestrator()

// Register Alpha agents
agentOrchestrator.registerAgent('parse', parseAgentHandler)
agentOrchestrator.registerAgent('generate', generateAgentHandler)
