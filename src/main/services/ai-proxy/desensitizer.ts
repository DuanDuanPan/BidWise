/**
 * Regex-based desensitization service (Alpha baseline).
 * NER model enhancement deferred to Beta.
 * Security-first: prefer false positives over leaks.
 */
import { v4 as uuidv4 } from 'uuid'
import * as mappingStore from '@main/services/ai-proxy/mapping-store'
import type { AiChatMessage } from '@shared/ai-types'

// ─── Types ───

export interface DesensitizeStats {
  totalReplacements: number
  byType: Record<string, number>
}

export interface DesensitizeResult {
  messages: AiChatMessage[]
  mappingId: string
  stats: DesensitizeStats
}

// ─── Regex rules ───

interface Rule {
  type: string
  pattern: RegExp
}

/**
 * Order matters: more specific patterns first to avoid partial matches.
 * Each pattern uses global flag for multi-match within a single content string.
 */
const RULES: Rule[] = [
  // ID card (18 digits, last may be X)
  {
    type: 'IDCARD',
    pattern: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
  },
  // Email
  { type: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Contract / project number (letter-digit-dash pattern like HT-2026-001)
  { type: 'CONTRACT', pattern: /\b[A-Za-z]{1,6}[-/][A-Za-z0-9]{1,10}[-/][A-Za-z0-9]{1,10}\b/g },
  // IP address
  {
    type: 'TECHPARAM',
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  },
  // Version number (v2.3.4, MySQL 8.0.36, etc.)
  { type: 'TECHPARAM', pattern: /\bv?\d+\.\d+(?:\.\d+)+\b/g },
  // Phone (11-digit mobile or landline with area code)
  { type: 'PHONE', pattern: /(?:(?:\+86|86)[-\s]?)?1[3-9]\d{9}\b/g },
  { type: 'PHONE', pattern: /\b0\d{2,3}[-\s]?\d{7,8}\b/g },
  // Amount (¥/$/ chinese-style)
  { type: 'AMOUNT', pattern: /[¥￥$]\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?[万亿元千百十])?/g },
  { type: 'AMOUNT', pattern: /\d[\d,]*(?:\.\d{1,2})?\s?[万亿元](?:[整正])?/g },
  // Chinese capital amount
  { type: 'AMOUNT', pattern: /[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]{2,}[元圆][整正]?/g },
  // Company name (Chinese characters + common suffixes)
  {
    type: 'COMPANY',
    pattern:
      /[\u4e00-\u9fa5]{2,15}(?:集团|股份|有限公司|有限责任公司|科技|技术|信息|工程|实业|控股|投资|咨询|服务)(?:有限公司|有限责任公司|公司|集团)?/g,
  },
  // Person name (common Chinese surnames + 1-3 chars)
  {
    type: 'PERSON',
    pattern:
      /(?<=[，。、；：""''（）\s]|^)(?:王|李|张|刘|陈|杨|赵|黄|周|吴|徐|孙|胡|朱|高|林|何|郭|马|罗|梁|宋|郑|谢|韩|唐|冯|于|董|萧|程|曹|袁|邓|许|傅|沈|曾|彭|吕|苏|卢|蒋|蔡|贾|丁|魏|薛|叶|阎|余|潘|杜|戴|夏|钟|汪|田|任|姜|范|方|石|姚|谭|廖|邹|熊|金|陆|郝|孔|白|崔|康|毛|邱|秦|江|史|顾|侯|邵|孟|龙|万|段|雷|钱|汤|尹|黎|易|常|武|乔|贺|赖|龚|文)[\u4e00-\u9fa5]{1,3}(?=[，。、；：""''（）\s]|$)/g,
  },
]

// ─── Desensitizer class ───

export class Desensitizer {
  /**
   * Replace sensitive fields in all messages with placeholders.
   * All messages share the same mappingId and counter (globally unique placeholders).
   */
  async desensitize(messages: AiChatMessage[]): Promise<DesensitizeResult> {
    const mappingId = uuidv4()
    const mapping = new Map<string, string>()
    let counter = 0
    const stats: DesensitizeStats = { totalReplacements: 0, byType: {} }

    // Track already-replaced positions to avoid double-matching
    const desensitized: AiChatMessage[] = messages.map((msg) => {
      let content = msg.content

      // Collect all matches with positions, then replace longest-first / earliest-first
      interface Match {
        type: string
        start: number
        end: number
        original: string
      }
      const matches: Match[] = []

      for (const rule of RULES) {
        // Reset lastIndex for global regex
        rule.pattern.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = rule.pattern.exec(content)) !== null) {
          matches.push({
            type: rule.type,
            start: m.index,
            end: m.index + m[0].length,
            original: m[0],
          })
        }
      }

      // Sort: longest first, then earliest
      matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)

      // Remove overlapping matches (keep longer/earlier)
      const accepted: Match[] = []
      const used = new Set<number>()
      for (const match of matches) {
        let overlap = false
        for (let i = match.start; i < match.end; i++) {
          if (used.has(i)) {
            overlap = true
            break
          }
        }
        if (!overlap) {
          accepted.push(match)
          for (let i = match.start; i < match.end; i++) used.add(i)
        }
      }

      // Sort accepted by position (reverse) for safe replacement
      accepted.sort((a, b) => b.start - a.start)

      for (const match of accepted) {
        counter++
        const placeholder = `{{${match.type}_${counter}}}`
        mapping.set(placeholder, match.original)
        content = content.substring(0, match.start) + placeholder + content.substring(match.end)
        stats.totalReplacements++
        stats.byType[match.type] = (stats.byType[match.type] || 0) + 1
      }

      return { role: msg.role, content }
    })

    if (mapping.size > 0) {
      await mappingStore.save(mappingId, mapping)
    }

    return { messages: desensitized, mappingId, stats }
  }

  /**
   * Restore placeholders in AI response content back to original values.
   * After restoration, cleans up the mapping from memory and disk.
   */
  async restore(content: string, mappingId: string): Promise<string> {
    let mapping: Map<string, string>
    try {
      mapping = await mappingStore.load(mappingId)
    } catch {
      // No mapping found — likely no replacements were made
      return content
    }

    let restored = content
    for (const [placeholder, original] of mapping) {
      // Use split+join for safe literal replacement (no regex special chars issue)
      restored = restored.split(placeholder).join(original)
    }

    await mappingStore.remove(mappingId)
    return restored
  }
}
