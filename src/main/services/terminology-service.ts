import { app, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TerminologyRepository } from '@main/db/repositories/terminology-repo'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { createLogger } from '@main/utils/logger'
import type {
  TerminologyEntry,
  CreateTerminologyInput,
  UpdateTerminologyInput,
  TerminologyListFilter,
  BatchCreateResult,
  TerminologyExportData,
  TerminologyExportOutput,
} from '@shared/terminology-types'

const logger = createLogger('terminology-service')
const repo = new TerminologyRepository()

// In-memory cache for active entries
let activeEntriesCache: TerminologyEntry[] | null = null

function invalidateCache(): void {
  activeEntriesCache = null
}

function normalizeSourceTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase()
}

export const terminologyService = {
  async list(filter?: TerminologyListFilter): Promise<TerminologyEntry[]> {
    return repo.list(filter)
  },

  async create(input: CreateTerminologyInput): Promise<TerminologyEntry> {
    const normalizedSourceTerm = normalizeSourceTerm(input.sourceTerm)
    const existing = await repo.findByNormalizedSourceTerm(normalizedSourceTerm)
    if (existing) {
      throw new BidWiseError(
        ErrorCode.DUPLICATE,
        `该术语已存在（已有映射：${existing.targetTerm}）`
      )
    }

    const entry = await repo.create({
      sourceTerm: input.sourceTerm.trim(),
      targetTerm: input.targetTerm.trim(),
      normalizedSourceTerm,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
      isActive: input.isActive === false ? 0 : 1,
    })

    invalidateCache()
    logger.info(`术语创建: ${input.sourceTerm} → ${input.targetTerm}`)
    return entry
  },

  async update(input: UpdateTerminologyInput): Promise<TerminologyEntry> {
    const fields: Record<string, unknown> = {}

    if (input.sourceTerm !== undefined) {
      const normalizedSourceTerm = normalizeSourceTerm(input.sourceTerm)
      // Check for conflicts with other entries
      const existing = await repo.findByNormalizedSourceTerm(normalizedSourceTerm)
      if (existing && existing.id !== input.id) {
        throw new BidWiseError(
          ErrorCode.DUPLICATE,
          `该术语已存在（已有映射：${existing.targetTerm}）`
        )
      }
      fields.sourceTerm = input.sourceTerm.trim()
      fields.normalizedSourceTerm = normalizedSourceTerm
    }

    if (input.targetTerm !== undefined) {
      fields.targetTerm = input.targetTerm.trim()
    }

    if (input.category !== undefined) {
      fields.category = input.category?.trim() || null
    }

    if (input.description !== undefined) {
      fields.description = input.description?.trim() || null
    }

    if (input.isActive !== undefined) {
      fields.isActive = input.isActive ? 1 : 0
    }

    const entry = await repo.update(input.id, fields)
    invalidateCache()
    return entry
  },

  async delete(id: string): Promise<void> {
    await repo.delete(id)
    invalidateCache()
    logger.info(`术语删除: ${id}`)
  },

  async batchCreate(entries: CreateTerminologyInput[]): Promise<BatchCreateResult> {
    let created = 0
    const duplicates: string[] = []
    const seenNormalized = new Set<string>()

    for (const entry of entries) {
      const normalized = normalizeSourceTerm(entry.sourceTerm)

      // Deduplicate within this batch
      if (seenNormalized.has(normalized)) {
        duplicates.push(entry.sourceTerm)
        continue
      }

      // Check DB
      const existing = await repo.findByNormalizedSourceTerm(normalized)
      if (existing) {
        duplicates.push(entry.sourceTerm)
        seenNormalized.add(normalized)
        continue
      }

      seenNormalized.add(normalized)

      await repo.create({
        sourceTerm: entry.sourceTerm.trim(),
        targetTerm: entry.targetTerm.trim(),
        normalizedSourceTerm: normalized,
        category: entry.category?.trim() || null,
        description: entry.description?.trim() || null,
        isActive: entry.isActive === false ? 0 : 1,
      })
      created++
    }

    invalidateCache()
    logger.info(`批量导入完成: 创建 ${created} 条, 跳过 ${duplicates.length} 条重复`)
    return { created, duplicates }
  },

  async getActiveEntries(): Promise<TerminologyEntry[]> {
    if (activeEntriesCache) {
      return activeEntriesCache
    }
    const entries = await repo.findActive()
    activeEntriesCache = entries
    return entries
  },

  async buildExportData(): Promise<TerminologyExportData> {
    // Export ALL entries (including disabled) for Git sync compatibility
    const allEntries = await repo.list()
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      entries: allEntries.map((e) => ({
        sourceTerm: e.sourceTerm,
        targetTerm: e.targetTerm,
        category: e.category,
        description: e.description,
        isActive: e.isActive,
      })),
    }
  },

  async exportToFile(): Promise<TerminologyExportOutput> {
    const data = await this.buildExportData()

    // Prefer company-data/terminology/ as default save directory if it exists
    let defaultPath = 'terminology-export.json'
    const candidates = [
      join(app.getAppPath(), 'company-data', 'terminology'),
      join(app.getPath('userData'), 'company-data', 'terminology'),
    ]
    for (const dir of candidates) {
      if (existsSync(dir)) {
        defaultPath = join(dir, 'terminology-export.json')
        break
      }
    }

    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { cancelled: true, entryCount: data.entries.length }
    }

    await writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
    logger.info(`术语导出: ${data.entries.length} 条 → ${result.filePath}`)
    return { cancelled: false, outputPath: result.filePath, entryCount: data.entries.length }
  },

  async importFromJson(data: TerminologyExportData): Promise<BatchCreateResult> {
    const entries: CreateTerminologyInput[] = data.entries.map((e) => ({
      sourceTerm: e.sourceTerm,
      targetTerm: e.targetTerm,
      category: e.category ?? undefined,
      description: e.description ?? undefined,
      isActive: e.isActive,
    }))
    return this.batchCreate(entries)
  },
}
