import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { ProjectTable } from '../schema'

export type CreateProjectRepoInput = {
  id?: string
  name: string
  customerName?: string
  industry?: string
  deadline?: string
  proposalType?: string
  rootPath?: string
}

export type UpdateProjectRepoInput = {
  name?: string
  customerName?: string | null
  industry?: string | null
  deadline?: string | null
  proposalType?: string
  rootPath?: string | null
}

export class ProjectRepository {
  async create(input: CreateProjectRepoInput): Promise<ProjectTable> {
    const now = new Date().toISOString()
    const project: ProjectTable = {
      id: input.id ?? uuidv4(),
      name: input.name,
      customerName: input.customerName ?? null,
      industry: input.industry ?? null,
      deadline: input.deadline ?? null,
      proposalType: input.proposalType ?? 'presale-technical',
      sopStage: 'not-started',
      status: 'active',
      rootPath: input.rootPath ?? null,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await getDb().insertInto('projects').values(project).execute()
      return project
    } catch (err) {
      throw new DatabaseError(`项目创建失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<ProjectTable> {
    try {
      const project = await getDb()
        .selectFrom('projects')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (!project) throw new NotFoundError(`项目不存在: ${id}`)
      return project
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`项目查询失败: ${(err as Error).message}`, err)
    }
  }

  async findAll(): Promise<ProjectTable[]> {
    try {
      return await getDb().selectFrom('projects').selectAll().orderBy('updatedAt', 'desc').execute()
    } catch (err) {
      throw new DatabaseError(`项目列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async update(id: string, input: UpdateProjectRepoInput): Promise<ProjectTable> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('projects')
        .set({ ...input, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()
      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`项目不存在: ${id}`)
      }
      return this.findById(id)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`项目更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await getDb().deleteFrom('projects').where('id', '=', id).executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        throw new NotFoundError(`项目不存在: ${id}`)
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`项目删除失败: ${(err as Error).message}`, err)
    }
  }

  async archive(id: string): Promise<ProjectTable> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('projects')
        .set({ status: 'archived', updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()
      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`项目不存在: ${id}`)
      }
      return this.findById(id)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`项目归档失败: ${(err as Error).message}`, err)
    }
  }
}
