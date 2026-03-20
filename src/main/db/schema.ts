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

export interface DB {
  projects: ProjectTable
  tasks: TaskTable
}
