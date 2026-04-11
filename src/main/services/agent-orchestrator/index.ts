export { AgentOrchestrator } from './orchestrator'
export type { AgentHandler, AiRequestParams } from './orchestrator'
import { AgentOrchestrator } from './orchestrator'
import { parseAgentHandler } from './agents/parse-agent'
import { generateAgentHandler } from './agents/generate-agent'
import { extractAgentHandler } from './agents/extract-agent'
import { seedAgentHandler } from './agents/seed-agent'
import { attributeSourcesAgentHandler } from './agents/attribute-sources-agent'
import { validateBaselineAgentHandler } from './agents/validate-baseline-agent'
import { fogMapAgentHandler } from './agents/fog-map-agent'
import { traceabilityAgentHandler } from './agents/traceability-agent'
import { adversarialAgentHandler } from './agents/adversarial-agent'

export const agentOrchestrator = new AgentOrchestrator()

// Register Alpha agents
agentOrchestrator.registerAgent('parse', parseAgentHandler)
agentOrchestrator.registerAgent('generate', generateAgentHandler)
agentOrchestrator.registerAgent('extract', extractAgentHandler)
agentOrchestrator.registerAgent('seed', seedAgentHandler)
agentOrchestrator.registerAgent('attribute-sources', attributeSourcesAgentHandler)
agentOrchestrator.registerAgent('validate-baseline', validateBaselineAgentHandler)
agentOrchestrator.registerAgent('fog-map', fogMapAgentHandler)
agentOrchestrator.registerAgent('traceability', traceabilityAgentHandler)
agentOrchestrator.registerAgent('adversarial', adversarialAgentHandler)
