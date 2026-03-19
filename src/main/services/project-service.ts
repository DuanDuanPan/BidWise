import { ProjectRepository } from '@main/db/repositories'
import { ValidationError } from '@main/utils/errors'
import type { ProjectTable } from '@main/db/schema'
import type { CreateProjectInput, UpdateProjectInput } from '@shared/ipc-types'

const repo = new ProjectRepository()

export class ProjectService {
  async create(input: CreateProjectInput): Promise<ProjectTable> {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('项目名称不能为空')
    }
    return repo.create({
      name: input.name.trim(),
      customerName: input.customerName,
      deadline: input.deadline,
      proposalType: input.proposalType,
      rootPath: input.rootPath,
    })
  }

  async findById(id: string): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    return repo.findById(id)
  }

  async findAll(): Promise<ProjectTable[]> {
    return repo.findAll()
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new ValidationError('项目名称不能为空')
    }
    const updateData = { ...input }
    if (updateData.name) updateData.name = updateData.name.trim()
    return repo.update(id, updateData)
  }

  async delete(id: string): Promise<void> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    return repo.delete(id)
  }

  async archive(id: string): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    return repo.archive(id)
  }
}
