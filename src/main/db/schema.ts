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
  parentId: string | null
  assignee: string | null
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

export interface NotificationTable {
  id: string
  projectId: string
  projectName: string
  sectionId: string
  annotationId: string
  targetUser: string
  type: string
  title: string
  summary: string
  read: number
  createdAt: string
}

export interface AssetsTable {
  id: string
  projectId: string | null
  title: string
  summary: string
  content: string
  assetType: string // 'text' | 'diagram' | 'table' | 'case'
  sourceProject: string | null
  sourceSection: string | null
  createdAt: string
  updatedAt: string
}

export interface TagsTable {
  id: string
  name: string
  normalizedName: string
  createdAt: string
}

export interface AssetTagsTable {
  assetId: string
  tagId: string
}

export interface AdversarialLineupsTable {
  id: string
  projectId: string
  roles: string // JSON array of AdversarialRole[]
  status: string // 'generated' | 'confirmed'
  generationSource: string // 'llm' | 'fallback'
  warningMessage: string | null
  generatedAt: string
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdversarialReviewSessionsTable {
  id: string
  projectId: string
  lineupId: string
  status: string // 'running' | 'completed' | 'partial' | 'failed'
  roleResults: string | null // JSON
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdversarialFindingsTable {
  id: string
  sessionId: string
  roleId: string
  roleName: string
  severity: string // 'critical' | 'major' | 'minor'
  sectionRef: string | null
  sectionLocator: string | null // JSON
  content: string
  suggestion: string | null
  reasoning: string | null
  status: string // 'pending' | 'accepted' | 'rejected' | 'needs-decision'
  rebuttalReason: string | null
  contradictionGroupId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AttackChecklistsTable {
  id: string
  projectId: string
  status: string // 'generating' | 'generated' | 'failed'
  generationSource: string // 'llm' | 'fallback'
  warningMessage: string | null
  generatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AttackChecklistItemsTable {
  id: string
  checklistId: string
  category: string
  attackAngle: string
  severity: string // 'critical' | 'major' | 'minor'
  defenseSuggestion: string
  targetSection: string | null
  targetSectionLocator: string | null // JSON serialized ChapterHeadingLocator
  status: string // 'unaddressed' | 'addressed' | 'dismissed'
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TerminologyEntriesTable {
  id: string
  sourceTerm: string
  targetTerm: string
  normalizedSourceTerm: string
  category: string | null
  description: string | null
  isActive: number // 0 | 1
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
  notifications: NotificationTable
  assets: AssetsTable
  tags: TagsTable
  assetTags: AssetTagsTable
  adversarialLineups: AdversarialLineupsTable
  adversarialReviewSessions: AdversarialReviewSessionsTable
  adversarialFindings: AdversarialFindingsTable
  attackChecklists: AttackChecklistsTable
  attackChecklistItems: AttackChecklistItemsTable
  terminologyEntries: TerminologyEntriesTable
}
