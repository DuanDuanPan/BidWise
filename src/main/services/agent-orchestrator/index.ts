export { AgentOrchestrator } from './orchestrator'
export type { AgentHandler, AiRequestParams } from './orchestrator'
import { AgentOrchestrator } from './orchestrator'
import { parseAgentHandler } from './agents/parse-agent'
import { generateAgentHandler } from './agents/generate-agent'
import { extractAgentHandler } from './agents/extract-agent'
import { seedAgentHandler } from './agents/seed-agent'

export const agentOrchestrator = new AgentOrchestrator()

// Register Alpha agents
agentOrchestrator.registerAgent('parse', parseAgentHandler)
agentOrchestrator.registerAgent('generate', generateAgentHandler)
agentOrchestrator.registerAgent('extract', extractAgentHandler)
agentOrchestrator.registerAgent('seed', seedAgentHandler)
