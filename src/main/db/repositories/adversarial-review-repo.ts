import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError } from '@main/utils/errors'
import type {
  AdversarialReviewSession,
  AdversarialFinding,
  RoleReviewResult,
  ReviewSessionStatus,
  FindingSeverity,
  FindingStatus,
} from '@shared/adversarial-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

export class AdversarialReviewRepository {
  async saveSession(session: {
    id?: string
    projectId: string
    lineupId: string
    status: ReviewSessionStatus
    roleResults: RoleReviewResult[]
    startedAt: string
    completedAt?: string | null
  }): Promise<AdversarialReviewSession> {
    const now = new Date().toISOString()

    try {
      const existing = await getDb()
        .selectFrom('adversarialReviewSessions')
        .select('id')
        .where('projectId', '=', session.projectId)
        .executeTakeFirst()

      if (existing) {
        await getDb()
          .updateTable('adversarialReviewSessions')
          .set({
            lineupId: session.lineupId,
            status: session.status,
            roleResults: JSON.stringify(session.roleResults),
            startedAt: session.startedAt,
            completedAt: session.completedAt ?? null,
            updatedAt: now,
          })
          .where('id', '=', existing.id)
          .execute()

        return this.findSessionById(existing.id)
      }

      const id = session.id ?? uuidv4()
      await getDb()
        .insertInto('adversarialReviewSessions')
        .values({
          id,
          projectId: session.projectId,
          lineupId: session.lineupId,
          status: session.status,
          roleResults: JSON.stringify(session.roleResults),
          startedAt: session.startedAt,
          completedAt: session.completedAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute()

      return this.findSessionById(id)
    } catch (err) {
      if (err instanceof DatabaseError) throw err
      throw new DatabaseError(`评审会话保存失败: ${(err as Error).message}`, err)
    }
  }

  async findSessionByProjectId(projectId: string): Promise<AdversarialReviewSession | null> {
    try {
      const row = await getDb()
        .selectFrom('adversarialReviewSessions')
        .selectAll()
        .where('projectId', '=', projectId)
        .executeTakeFirst()

      if (!row) return null

      const findings = await this.findFindingsBySessionId(row.id)

      return this.toSession(row, findings)
    } catch (err) {
      throw new DatabaseError(`评审会话查询失败: ${(err as Error).message}`, err)
    }
  }

  async saveFindings(
    findings: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[]
  ): Promise<void> {
    if (findings.length === 0) return
    const now = new Date().toISOString()

    try {
      const values = findings.map((f) => ({
        id: f.id,
        sessionId: f.sessionId,
        roleId: f.roleId,
        roleName: f.roleName,
        severity: f.severity,
        sectionRef: f.sectionRef,
        sectionLocator: f.sectionLocator ? JSON.stringify(f.sectionLocator) : null,
        content: f.content,
        suggestion: f.suggestion,
        reasoning: f.reasoning,
        status: f.status,
        rebuttalReason: f.rebuttalReason,
        contradictionGroupId: f.contradictionGroupId,
        sortOrder: f.sortOrder,
        createdAt: now,
        updatedAt: now,
      }))

      // Batch insert in chunks of 50
      for (let i = 0; i < values.length; i += 50) {
        const chunk = values.slice(i, i + 50)
        await getDb().insertInto('adversarialFindings').values(chunk).execute()
      }
    } catch (err) {
      throw new DatabaseError(`评审发现批量保存失败: ${(err as Error).message}`, err)
    }
  }

  async updateFinding(
    id: string,
    patch: { status: FindingStatus; rebuttalReason: string | null }
  ): Promise<AdversarialFinding> {
    const now = new Date().toISOString()

    try {
      const result = await getDb()
        .updateTable('adversarialFindings')
        .set({
          status: patch.status,
          rebuttalReason: patch.rebuttalReason,
          updatedAt: now,
        })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new DatabaseError(`评审发现不存在: ${id}`)
      }

      return this.findFindingById(id)
    } catch (err) {
      if (err instanceof DatabaseError) throw err
      throw new DatabaseError(`评审发现更新失败: ${(err as Error).message}`, err)
    }
  }

  async deleteFindingsBySessionId(sessionId: string): Promise<void> {
    try {
      await getDb().deleteFrom('adversarialFindings').where('sessionId', '=', sessionId).execute()
    } catch (err) {
      throw new DatabaseError(`评审发现删除失败: ${(err as Error).message}`, err)
    }
  }

  async updateSessionStatus(
    sessionId: string,
    status: ReviewSessionStatus,
    roleResults?: RoleReviewResult[],
    completedAt?: string | null
  ): Promise<void> {
    const now = new Date().toISOString()

    try {
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: now,
      }
      if (roleResults !== undefined) {
        updateData.roleResults = JSON.stringify(roleResults)
      }
      if (completedAt !== undefined) {
        updateData.completedAt = completedAt
      }

      await getDb()
        .updateTable('adversarialReviewSessions')
        .set(updateData)
        .where('id', '=', sessionId)
        .execute()
    } catch (err) {
      throw new DatabaseError(`评审会话状态更新失败: ${(err as Error).message}`, err)
    }
  }

  private async findSessionById(id: string): Promise<AdversarialReviewSession> {
    const row = await getDb()
      .selectFrom('adversarialReviewSessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()

    const findings = await this.findFindingsBySessionId(id)
    return this.toSession(row, findings)
  }

  private async findFindingsBySessionId(sessionId: string): Promise<AdversarialFinding[]> {
    const rows = await getDb()
      .selectFrom('adversarialFindings')
      .selectAll()
      .where('sessionId', '=', sessionId)
      .orderBy('sortOrder', 'asc')
      .execute()

    return rows.map((r) => this.toFinding(r))
  }

  private async findFindingById(id: string): Promise<AdversarialFinding> {
    const row = await getDb()
      .selectFrom('adversarialFindings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()

    return this.toFinding(row)
  }

  private toSession(
    row: {
      id: string
      projectId: string
      lineupId: string
      status: string
      roleResults: string | null
      startedAt: string | null
      completedAt: string | null
    },
    findings: AdversarialFinding[]
  ): AdversarialReviewSession {
    return {
      id: row.id,
      projectId: row.projectId,
      lineupId: row.lineupId,
      status: row.status as ReviewSessionStatus,
      findings,
      roleResults: row.roleResults ? (JSON.parse(row.roleResults) as RoleReviewResult[]) : [],
      startedAt: row.startedAt ?? new Date().toISOString(),
      completedAt: row.completedAt,
    }
  }

  private toFinding(row: {
    id: string
    sessionId: string
    roleId: string
    roleName: string
    severity: string
    sectionRef: string | null
    sectionLocator: string | null
    content: string
    suggestion: string | null
    reasoning: string | null
    status: string
    rebuttalReason: string | null
    contradictionGroupId: string | null
    sortOrder: number
    createdAt: string
    updatedAt: string
  }): AdversarialFinding {
    return {
      id: row.id,
      sessionId: row.sessionId,
      roleId: row.roleId,
      roleName: row.roleName,
      severity: row.severity as FindingSeverity,
      sectionRef: row.sectionRef,
      sectionLocator: row.sectionLocator
        ? (JSON.parse(row.sectionLocator) as ChapterHeadingLocator)
        : null,
      content: row.content,
      suggestion: row.suggestion,
      reasoning: row.reasoning,
      status: row.status as FindingStatus,
      rebuttalReason: row.rebuttalReason,
      contradictionGroupId: row.contradictionGroupId,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
