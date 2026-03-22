import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { ScoringModel, ScoringCriterion } from '@shared/analysis-types'

function rowToModel(row: {
  id: string
  projectId: string
  totalScore: number
  criteria: string
  extractedAt: string
  confirmedAt: string | null
  version: number
}): ScoringModel {
  return {
    projectId: row.projectId,
    totalScore: row.totalScore,
    criteria: JSON.parse(row.criteria) as ScoringCriterion[],
    extractedAt: row.extractedAt,
    confirmedAt: row.confirmedAt,
    version: row.version,
  }
}

export class ScoringModelRepository {
  async upsert(model: ScoringModel): Promise<ScoringModel> {
    const now = new Date().toISOString()

    try {
      const existing = await getDb()
        .selectFrom('scoringModels')
        .selectAll()
        .where('projectId', '=', model.projectId)
        .executeTakeFirst()

      if (existing) {
        await getDb()
          .updateTable('scoringModels')
          .set({
            totalScore: model.totalScore,
            criteria: JSON.stringify(model.criteria),
            extractedAt: model.extractedAt,
            confirmedAt: model.confirmedAt,
            version: model.version,
            updatedAt: now,
          })
          .where('projectId', '=', model.projectId)
          .execute()
      } else {
        await getDb()
          .insertInto('scoringModels')
          .values({
            id: uuidv4(),
            projectId: model.projectId,
            totalScore: model.totalScore,
            criteria: JSON.stringify(model.criteria),
            extractedAt: model.extractedAt,
            confirmedAt: model.confirmedAt,
            version: model.version,
            createdAt: now,
            updatedAt: now,
          })
          .execute()
      }

      return this.findByProject(model.projectId) as Promise<ScoringModel>
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`评分模型保存失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(projectId: string): Promise<ScoringModel | null> {
    try {
      const row = await getDb()
        .selectFrom('scoringModels')
        .selectAll()
        .where('projectId', '=', projectId)
        .executeTakeFirst()

      if (!row) return null
      return rowToModel(row)
    } catch (err) {
      throw new DatabaseError(`评分模型查询失败: ${(err as Error).message}`, err)
    }
  }

  async updateCriterion(
    projectId: string,
    criterionId: string,
    patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
  ): Promise<ScoringModel> {
    const model = await this.findByProject(projectId)
    if (!model) {
      throw new NotFoundError(`评分模型不存在: projectId=${projectId}`)
    }

    const criterionIndex = model.criteria.findIndex((c) => c.id === criterionId)
    if (criterionIndex === -1) {
      throw new NotFoundError(`评分项不存在: criterionId=${criterionId}`)
    }

    model.criteria[criterionIndex] = {
      ...model.criteria[criterionIndex],
      ...patch,
    }

    // Recalculate weights for all criteria when any maxScore changes
    if (patch.maxScore !== undefined) {
      const totalScore = model.totalScore
      for (const c of model.criteria) {
        c.weight = totalScore > 0 ? c.maxScore / totalScore : 0
      }
    }

    const now = new Date().toISOString()
    try {
      await getDb()
        .updateTable('scoringModels')
        .set({
          criteria: JSON.stringify(model.criteria),
          updatedAt: now,
        })
        .where('projectId', '=', projectId)
        .execute()

      return this.findByProject(projectId) as Promise<ScoringModel>
    } catch (err) {
      throw new DatabaseError(`评分项更新失败: ${(err as Error).message}`, err)
    }
  }

  async confirm(projectId: string): Promise<ScoringModel> {
    const model = await this.findByProject(projectId)
    if (!model) {
      throw new NotFoundError(`评分模型不存在: projectId=${projectId}`)
    }

    const now = new Date().toISOString()
    const confirmedCriteria = model.criteria.map((criterion) => ({
      ...criterion,
      status: 'confirmed' as const,
    }))

    try {
      await getDb()
        .updateTable('scoringModels')
        .set({
          criteria: JSON.stringify(confirmedCriteria),
          confirmedAt: now,
          updatedAt: now,
        })
        .where('projectId', '=', projectId)
        .execute()

      return this.findByProject(projectId) as Promise<ScoringModel>
    } catch (err) {
      throw new DatabaseError(`评分模型确认失败: ${(err as Error).message}`, err)
    }
  }
}
