// CamelCasePlugin 会自动将这里的 camelCase 映射到 DB 的 snake_case
export interface ProjectTable {
  id: string
  name: string
  customerName: string | null
  deadline: string | null
  proposalType: string
  sopStage: string
  status: string
  rootPath: string | null
  createdAt: string
  updatedAt: string
}

export interface DB {
  projects: ProjectTable
}
