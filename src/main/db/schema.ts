// CamelCasePlugin 会自动将这里的 camelCase 映射到 DB 的 snake_case
export interface ProjectTable {
  id: string
  name: string
  customerName: string | null
  deadline: string | null
  proposalType: string
  sopStage: string
  status: string
  industry: string | null
  rootPath: string | null
  createdAt: string
  updatedAt: string
}

// CamelCasePlugin 会自动将这里的 camelCase 映射到 DB 的 snake_case
export interface TaskTable {
  id: string
  category: string
  agentType: string | null
  status: string
  priority: string
  progress: number
  input: string
  output: string | null
  error: string | null
  retryCount: number
  maxRetries: number
  checkpoint: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface RequirementTable {
  id: string
  projectId: string
  sequenceNumber: number
  description: string
  sourcePages: string // JSON array
  category: string
  priority: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface ScoringModelTable {
  id: string
  projectId: string
  totalScore: number
  criteria: string // JSON
  extractedAt: string
  confirmedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface MandatoryItemTable {
  id: string
  projectId: string
  content: string
  sourceText: string
  sourcePages: string // JSON array
  confidence: number
  status: string // 'detected' | 'confirmed' | 'dismissed'
  linkedRequirementId: string | null
  detectedAt: string
  updatedAt: string
}

export interface StrategySeedTable {
  id: string
  projectId: string
  title: string
  reasoning: string
  suggestion: string
  sourceExcerpt: string
  confidence: number
  status: string // 'pending' | 'confirmed' | 'adjusted'
  createdAt: string
  updatedAt: string
}

export interface AnnotationTable {
  id: string
  projectId: string
  sectionId: string
  type: string
  content: string
  author: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface RequirementCertaintyTable {
  id: string
  projectId: string
  requirementId: string
  certaintyLevel: string // 'clear' | 'ambiguous' | 'risky'
  reason: string
  suggestion: string
  confirmed: number // 0 | 1
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TraceabilityLinkTable {
  id: string
  projectId: string
  requirementId: string
  sectionId: string
  sectionTitle: string
  coverageStatus: string // 'covered' | 'partial' | 'uncovered'
  confidence: number // 0-1
  matchReason: string | null
  source: string // 'auto' | 'manual'
  createdAt: string
  updatedAt: string
}

export interface DB {
  projects: ProjectTable
  tasks: TaskTable
  requirements: RequirementTable
  scoringModels: ScoringModelTable
  mandatoryItems: MandatoryItemTable
  strategySeeds: StrategySeedTable
  annotations: AnnotationTable
  requirementCertainties: RequirementCertaintyTable
  traceabilityLinks: TraceabilityLinkTable
}
