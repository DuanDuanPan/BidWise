import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError } from '@main/utils/errors'
import type {
  AttackChecklist,
  AttackChecklistItem,
  AttackChecklistItemStatus,
  AttackChecklistItemSeverity,
  AttackChecklistStatus,
} from '@shared/attack-checklist-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

export class AttackChecklistRepository {
  async findByProjectId(projectId: string): Promise<AttackChecklist | null> {
    try {
      const row = await getDb()
        .selectFrom('attackChecklists')
        .selectAll()
        .where('projectId', '=', projectId)
        .executeTakeFirst()

      if (!row) return null

      const items = await this.findItemsByChecklistId(row.id)
      return this.toChecklist(row, items)
    } catch (err) {
      throw new DatabaseError(`攻击清单查询失败: ${(err as Error).message}`, err)
    }
  }

  async saveChecklist(input: {
    id?: string
    projectId: string
    status: AttackChecklistStatus
    generationSource: 'llm' | 'fallback'
    warningMessage?: string | null
    generatedAt?: string | null
  }): Promise<AttackChecklist> {
    const now = new Date().toISOString()

    try {
      const existing = await getDb()
        .selectFrom('attackChecklists')
        .select('id')
        .where('projectId', '=', input.projectId)
        .executeTakeFirst()

      if (existing) {
        await getDb()
          .updateTable('attackChecklists')
          .set({
            status: input.status,
            generationSource: input.generationSource,
            warningMessage: input.warningMessage ?? null,
            generatedAt: input.generatedAt ?? null,
            updatedAt: now,
          })
          .where('id', '=', existing.id)
          .execute()

        const items = await this.findItemsByChecklistId(existing.id)
        return this.toChecklist(
          await getDb()
            .selectFrom('attackChecklists')
            .selectAll()
            .where('id', '=', existing.id)
            .executeTakeFirstOrThrow(),
          items
        )
      }

      const id = input.id ?? uuidv4()
      await getDb()
        .insertInto('attackChecklists')
        .values({
          id,
          projectId: input.projectId,
          status: input.status,
          generationSource: input.generationSource,
          warningMessage: input.warningMessage ?? null,
          generatedAt: input.generatedAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute()

      return this.toChecklist(
        await getDb()
          .selectFrom('attackChecklists')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow(),
        []
      )
    } catch (err) {
      if (err instanceof DatabaseError) throw err
      throw new DatabaseError(`攻击清单保存失败: ${(err as Error).message}`, err)
    }
  }

  async saveItems(
    items: Array<{
      id: string
      checklistId: string
      category: string
      attackAngle: string
      severity: AttackChecklistItemSeverity
      defenseSuggestion: string
      targetSection: string | null
      targetSectionLocator: ChapterHeadingLocator | null
      status: AttackChecklistItemStatus
      sortOrder: number
    }>
  ): Promise<void> {
    if (items.length === 0) return
    const now = new Date().toISOString()

    try {
      const values = items.map((item) => ({
        id: item.id,
        checklistId: item.checklistId,
        category: item.category,
        attackAngle: item.attackAngle,
        severity: item.severity,
        defenseSuggestion: item.defenseSuggestion,
        targetSection: item.targetSection,
        targetSectionLocator: item.targetSectionLocator
          ? JSON.stringify(item.targetSectionLocator)
          : null,
        status: item.status,
        sortOrder: item.sortOrder,
        createdAt: now,
        updatedAt: now,
      }))

      // Batch insert in chunks of 50
      for (let i = 0; i < values.length; i += 50) {
        const chunk = values.slice(i, i + 50)
        await getDb().insertInto('attackChecklistItems').values(chunk).execute()
      }
    } catch (err) {
      throw new DatabaseError(`攻击清单条目批量保存失败: ${(err as Error).message}`, err)
    }
  }

  async deleteItemsByChecklistId(checklistId: string): Promise<void> {
    try {
      await getDb()
        .deleteFrom('attackChecklistItems')
        .where('checklistId', '=', checklistId)
        .execute()
    } catch (err) {
      throw new DatabaseError(`攻击清单条目删除失败: ${(err as Error).message}`, err)
    }
  }

  async updateItemStatus(
    itemId: string,
    status: AttackChecklistItemStatus
  ): Promise<AttackChecklistItem> {
    const now = new Date().toISOString()

    try {
      const result = await getDb()
        .updateTable('attackChecklistItems')
        .set({ status, updatedAt: now })
        .where('id', '=', itemId)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new DatabaseError(`攻击清单条目不存在: ${itemId}`)
      }

      const row = await getDb()
        .selectFrom('attackChecklistItems')
        .selectAll()
        .where('id', '=', itemId)
        .executeTakeFirstOrThrow()

      return this.toItem(row)
    } catch (err) {
      if (err instanceof DatabaseError) throw err
      throw new DatabaseError(`攻击清单条目状态更新失败: ${(err as Error).message}`, err)
    }
  }

  async updateChecklistStatus(
    id: string,
    status: AttackChecklistStatus,
    warningMessage?: string
  ): Promise<void> {
    const now = new Date().toISOString()

    try {
      const updateData: Record<string, unknown> = { status, updatedAt: now }
      if (warningMessage !== undefined) {
        updateData.warningMessage = warningMessage
      }
      if (status === 'generated') {
        updateData.generatedAt = now
      }

      await getDb().updateTable('attackChecklists').set(updateData).where('id', '=', id).execute()
    } catch (err) {
      throw new DatabaseError(`攻击清单状态更新失败: ${(err as Error).message}`, err)
    }
  }

  private async findItemsByChecklistId(checklistId: string): Promise<AttackChecklistItem[]> {
    const rows = await getDb()
      .selectFrom('attackChecklistItems')
      .selectAll()
      .where('checklistId', '=', checklistId)
      .orderBy('sortOrder', 'asc')
      .execute()

    return rows.map((r) => this.toItem(r))
  }

  private toChecklist(
    row: {
      id: string
      projectId: string
      status: string
      generationSource: string
      warningMessage: string | null
      generatedAt: string | null
      createdAt: string
      updatedAt: string
    },
    items: AttackChecklistItem[]
  ): AttackChecklist {
    return {
      id: row.id,
      projectId: row.projectId,
      status: row.status as AttackChecklistStatus,
      items,
      generationSource: row.generationSource as 'llm' | 'fallback',
      warningMessage: row.warningMessage,
      generatedAt: row.generatedAt ?? new Date().toISOString(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private toItem(row: {
    id: string
    checklistId: string
    category: string
    attackAngle: string
    severity: string
    defenseSuggestion: string
    targetSection: string | null
    targetSectionLocator: string | null
    status: string
    sortOrder: number
    createdAt: string
    updatedAt: string
  }): AttackChecklistItem {
    return {
      id: row.id,
      checklistId: row.checklistId,
      category: row.category,
      attackAngle: row.attackAngle,
      severity: row.severity as AttackChecklistItemSeverity,
      defenseSuggestion: row.defenseSuggestion,
      targetSection: row.targetSection,
      targetSectionLocator: row.targetSectionLocator
        ? (JSON.parse(row.targetSectionLocator) as ChapterHeadingLocator)
        : null,
      status: row.status as AttackChecklistItemStatus,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
