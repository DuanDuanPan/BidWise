import { createLogger } from '@main/utils/logger'
import type { TerminologyEntry, TerminologyApplyResult } from '@shared/terminology-types'

const logger = createLogger('terminology-replacement-service')

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const terminologyReplacementService = {
  applyReplacements(text: string, entries: TerminologyEntry[]): TerminologyApplyResult {
    if (!text || entries.length === 0) {
      return { content: text, replacements: [], totalReplacements: 0 }
    }

    let workingText = text
    let placeholderIndex = 0
    const placeholderMap = new Map<string, string>() // placeholder → targetTerm
    const replacementMap = new Map<string, { targetTerm: string; count: number }>()

    // Entries should already be sorted by sourceTerm length DESC (longest match first)
    for (const entry of entries) {
      const escapedSource = escapeRegExp(entry.sourceTerm)
      const regex = new RegExp(escapedSource, 'g')
      let matchCount = 0

      workingText = workingText.replace(regex, () => {
        const placeholder = `\uE000${placeholderIndex++}\uE001`
        placeholderMap.set(placeholder, entry.targetTerm)
        matchCount++
        return placeholder
      })

      if (matchCount > 0) {
        replacementMap.set(entry.sourceTerm, {
          targetTerm: entry.targetTerm,
          count: matchCount,
        })
      }
    }

    // Restore placeholders with actual target terms
    for (const [placeholder, target] of placeholderMap) {
      workingText = workingText.split(placeholder).join(target)
    }

    const replacements = Array.from(replacementMap.entries()).map(
      ([sourceTerm, { targetTerm, count }]) => ({
        sourceTerm,
        targetTerm,
        count,
      })
    )

    const totalReplacements = replacements.reduce((sum, r) => sum + r.count, 0)

    if (totalReplacements > 0) {
      logger.info(`术语替换完成: ${totalReplacements} 处替换, ${replacements.length} 个术语命中`)
    }

    return { content: workingText, replacements, totalReplacements }
  },

  buildPromptContext(entries: TerminologyEntry[]): string {
    if (entries.length === 0) {
      return ''
    }

    const lines = entries.map((e) => `- "${e.sourceTerm}" → "${e.targetTerm}"`)
    return `【行业术语规范】请在生成内容时优先使用以下标准术语：\n${lines.join('\n')}`
  },
}
