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

export interface DB {
  projects: ProjectTable
  tasks: TaskTable
  requirements: RequirementTable
  scoringModels: ScoringModelTable
  mandatoryItems: MandatoryItemTable
  strategySeeds: StrategySeedTable
}
