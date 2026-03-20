import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { ProjectRepository } from '@main/db/repositories'
import { ValidationError, BidWiseError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import type { ProjectTable } from '@main/db/schema'
import type { CreateProjectInput, UpdateProjectInput } from '@shared/ipc-types'
import { ErrorCode } from '@shared/constants'

const repo = new ProjectRepository()
const logger = createLogger('project-service')

export const projectService = {
  async create(input: CreateProjectInput): Promise<ProjectTable> {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('项目名称不能为空')
    }

    // Step 1: Generate id and compute rootPath upfront so both are persisted atomically
    const projectId = uuidv4()
    const projectDir = join(app.getPath('userData'), 'data', 'projects', projectId)

    // Step 2: Insert DB record with rootPath included
    const project = await repo.create({
      id: projectId,
      name: input.name.trim(),
      customerName: input.customerName,
      industry: input.industry,
      deadline: input.deadline,
      proposalType: input.proposalType,
      rootPath: projectDir,
    })

    // Step 3: Initialize directory structure
    try {
      mkdirSync(join(projectDir, 'assets'), { recursive: true })
      writeFileSync(join(projectDir, 'proposal.md'), '', 'utf-8')
      writeFileSync(
        join(projectDir, 'proposal.meta.json'),
        JSON.stringify({ annotations: [], scores: [] }),
        'utf-8'
      )
    } catch (err) {
      // FS failed → rollback both DB record and any partial directory
      logger.error(`项目目录创建失败，回滚: ${project.id}`, err)
      try {
        if (existsSync(projectDir)) {
          rmSync(projectDir, { recursive: true, force: true })
        }
      } catch (cleanupErr) {
        logger.error(`目录清理失败: ${projectDir}`, cleanupErr)
      }
      try {
        await repo.delete(project.id)
      } catch (rollbackErr) {
        logger.error(`DB 回滚也失败: ${project.id}`, rollbackErr)
      }
      throw new BidWiseError(
        ErrorCode.FILE_SYSTEM,
        `项目目录创建失败: ${(err as Error).message}`,
        err
      )
    }

    return project
  },

  async get(id: string): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    return repo.findById(id)
  },

  async list(): Promise<ProjectTable[]> {
    return repo.findAll()
  },

  async update(id: string, input: UpdateProjectInput): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new ValidationError('项目名称不能为空')
    }
    const updateData = { ...input }
    if (updateData.name) updateData.name = updateData.name.trim()
    return repo.update(id, updateData)
  },

  async delete(id: string): Promise<void> {
    if (!id) throw new ValidationError('项目 ID 不能为空')

    // Get project to find rootPath for directory cleanup
    let rootPath: string | null = null
    try {
      const project = await repo.findById(id)
      rootPath = project.rootPath
    } catch {
      // Project not found — nothing to delete
    }

    // Delete directory first (best-effort), then DB
    if (rootPath && existsSync(rootPath)) {
      try {
        rmSync(rootPath, { recursive: true, force: true })
      } catch (err) {
        logger.warn(`项目目录删除失败（不阻塞 DB 删除）: ${rootPath}`, err)
      }
    }

    return repo.delete(id)
  },

  async archive(id: string): Promise<ProjectTable> {
    if (!id) throw new ValidationError('项目 ID 不能为空')
    return repo.archive(id)
  },
}
