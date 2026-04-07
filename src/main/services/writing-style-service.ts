import { join } from 'path'
import { app } from 'electron'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { documentService } from '@main/services/document-service'
import type {
  WritingStyleId,
  WritingStyleTemplate,
  UpdateProjectWritingStyleOutput,
} from '@shared/writing-style-types'

const logger = createLogger('writing-style-service')

interface WritingStyleFileData {
  id: string
  name: string
  description: string
  version: string
  toneGuidance: string
  vocabularyRules: string[]
  forbiddenWords: string[]
  sentencePatterns: string[]
  exampleSnippet?: string
}

function validateStyleFileData(data: unknown, filePath: string): WritingStyleFileData {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`文风模板不是有效 JSON 对象: ${filePath}`)
  }
  const obj = data as Record<string, unknown>

  const requiredStrings = ['id', 'name', 'description', 'version', 'toneGuidance'] as const
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || obj[field] === '') {
      throw new Error(`文风模板缺少必填字段或类型错误: ${field} (${filePath})`)
    }
  }

  const requiredArrays = ['vocabularyRules', 'forbiddenWords', 'sentencePatterns'] as const
  for (const field of requiredArrays) {
    if (!Array.isArray(obj[field])) {
      throw new Error(`文风模板字段必须为数组: ${field} (${filePath})`)
    }
  }

  if (obj.exampleSnippet !== undefined && typeof obj.exampleSnippet !== 'string') {
    throw new Error(`文风模板 exampleSnippet 必须为 string: ${filePath}`)
  }

  return obj as unknown as WritingStyleFileData
}

let styleCache: WritingStyleTemplate[] | null = null

function getBuiltinStyleDir(): string {
  return join(app.getAppPath(), 'resources', 'writing-styles')
}

function resolveCompanyStyleDir(): string | null {
  const candidates = [
    join(app.getAppPath(), 'company-data', 'writing-styles'),
    join(app.getPath('userData'), 'company-data', 'writing-styles'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return null
}

async function scanStyleDir(
  dir: string,
  source: 'built-in' | 'company'
): Promise<Map<string, WritingStyleTemplate>> {
  const results = new Map<string, WritingStyleTemplate>()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return results
  }

  for (const file of files) {
    if (!file.endsWith('.style.json')) continue
    const filePath = join(dir, file)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const data = validateStyleFileData(JSON.parse(raw), filePath)
      results.set(data.id, { ...data, source })
    } catch (err) {
      logger.warn(`文风模板文件解析失败: ${filePath}`, err)
    }
  }
  return results
}

async function loadAllStyles(): Promise<WritingStyleTemplate[]> {
  if (styleCache) return styleCache

  const builtinDir = getBuiltinStyleDir()
  const companyDir = resolveCompanyStyleDir()

  const builtinMap = await scanStyleDir(builtinDir, 'built-in')
  const companyMap = companyDir ? await scanStyleDir(companyDir, 'company') : new Map()

  // Company styles override built-in with same ID
  const merged = new Map(builtinMap)
  for (const [id, style] of companyMap) {
    merged.set(id, style)
  }

  styleCache = Array.from(merged.values())
  return styleCache
}

/** Serialize a WritingStyleTemplate into a prompt-friendly text block */
export function serializeStyleForPrompt(style: WritingStyleTemplate): string {
  const sections: string[] = []

  sections.push(`文风：${style.name}`)
  sections.push(`语气要求：${style.toneGuidance}`)

  if (style.vocabularyRules.length > 0) {
    sections.push(`用语规范：\n${style.vocabularyRules.map((r) => `- ${r}`).join('\n')}`)
  }

  if (style.forbiddenWords.length > 0) {
    sections.push(`禁用词（请勿使用以下词语）：${style.forbiddenWords.join('、')}`)
  }

  if (style.sentencePatterns.length > 0) {
    sections.push(`句式约束：\n${style.sentencePatterns.map((p) => `- ${p}`).join('\n')}`)
  }

  if (style.exampleSnippet) {
    sections.push(`示例段落（参考文风，不要照搬内容）：\n${style.exampleSnippet}`)
  }

  return sections.join('\n\n')
}

export const writingStyleService = {
  async listStyles(): Promise<WritingStyleTemplate[]> {
    return loadAllStyles()
  },

  async getStyle(styleId: WritingStyleId): Promise<WritingStyleTemplate | null> {
    const styles = await loadAllStyles()
    const found = styles.find((s) => s.id === styleId)
    if (found) return found

    // Cache miss — force reload
    styleCache = null
    const reloaded = await loadAllStyles()
    return reloaded.find((s) => s.id === styleId) ?? null
  },

  async getProjectWritingStyle(projectId: string): Promise<WritingStyleTemplate> {
    const metadata = await documentService.getMetadata(projectId)
    const styleId = metadata.writingStyleId ?? 'general'

    const style = await writingStyleService.getStyle(styleId)
    if (style) return style

    // Fallback to general
    if (styleId !== 'general') {
      logger.warn(`文风模板 "${styleId}" 不存在，回退到 general: project=${projectId}`)
      const generalStyle = await writingStyleService.getStyle('general')
      if (generalStyle) return generalStyle
    }

    throw new BidWiseError(
      ErrorCode.CONFIG,
      `内置 general 文风模板缺失，无法提供文风约束: project=${projectId}`
    )
  },

  async updateProjectWritingStyle(
    projectId: string,
    styleId: WritingStyleId
  ): Promise<UpdateProjectWritingStyleOutput> {
    // Validate styleId exists
    const style = await writingStyleService.getStyle(styleId)
    if (!style) {
      throw new ValidationError(`文风模板不存在: ${styleId}`)
    }

    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      writingStyleId: styleId,
    }))

    return { writingStyleId: styleId }
  },

  /** Clear cache (for testing or after company-data sync) */
  clearCache(): void {
    styleCache = null
  },
}
