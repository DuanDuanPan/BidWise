import { describe, it, expect, vi } from 'vitest'
import type { TerminologyEntry } from '@shared/terminology-types'
import { terminologyReplacementService } from '@main/services/terminology-replacement-service'

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

function makeEntry(overrides: Partial<TerminologyEntry> = {}): TerminologyEntry {
  return {
    id: 'term-1',
    sourceTerm: '设备管理',
    targetTerm: '装备全寿命周期管理',
    normalizedSourceTerm: '设备管理',
    category: null,
    description: null,
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('terminologyReplacementService', () => {
  describe('applyReplacements', () => {
    it('replaces a single term correctly', () => {
      const entries = [makeEntry()]
      const result = terminologyReplacementService.applyReplacements(
        '我们提供设备管理解决方案',
        entries
      )

      expect(result.content).toBe('我们提供装备全寿命周期管理解决方案')
      expect(result.replacements).toHaveLength(1)
      expect(result.replacements[0]).toEqual({
        sourceTerm: '设备管理',
        targetTerm: '装备全寿命周期管理',
        count: 1,
      })
      expect(result.totalReplacements).toBe(1)
    })

    it('replaces multiple different terms simultaneously', () => {
      const entries = [
        makeEntry({ id: 'a', sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理' }),
        makeEntry({ id: 'b', sourceTerm: '投标文件', targetTerm: '响应文件' }),
      ]
      const result = terminologyReplacementService.applyReplacements(
        '设备管理需要准备投标文件',
        entries
      )

      expect(result.content).toBe('装备全寿命周期管理需要准备响应文件')
      expect(result.replacements).toHaveLength(2)
      expect(result.totalReplacements).toBe(2)
    })

    it('applies longest match first when entries are sorted by length DESC', () => {
      // Entries must be sorted by sourceTerm length DESC (as noted in the service)
      const entries = [
        makeEntry({
          id: 'long',
          sourceTerm: '设备管理系统',
          targetTerm: '装备综合管理平台',
        }),
        makeEntry({
          id: 'short',
          sourceTerm: '设备管理',
          targetTerm: '装备全寿命周期管理',
        }),
      ]
      const result = terminologyReplacementService.applyReplacements(
        '本次采购设备管理系统',
        entries
      )

      expect(result.content).toBe('本次采购装备综合管理平台')
      expect(result.replacements).toHaveLength(1)
      expect(result.replacements[0].sourceTerm).toBe('设备管理系统')
    })

    it('protects against chain replacement (A->B, B->C keeps A->B only)', () => {
      const entries = [
        makeEntry({ id: '1', sourceTerm: '甲方', targetTerm: '采购方' }),
        makeEntry({ id: '2', sourceTerm: '采购方', targetTerm: '业主单位' }),
      ]
      const result = terminologyReplacementService.applyReplacements('甲方提出需求', entries)

      // "甲方" should become "采购方", NOT "业主单位"
      expect(result.content).toBe('采购方提出需求')
      expect(result.totalReplacements).toBe(1)
    })

    it('returns original text with empty replacements when entries are empty', () => {
      const result = terminologyReplacementService.applyReplacements('保持原文不变', [])

      expect(result.content).toBe('保持原文不变')
      expect(result.replacements).toEqual([])
      expect(result.totalReplacements).toBe(0)
    })

    it('returns empty text directly when text is empty', () => {
      const entries = [makeEntry()]
      const result = terminologyReplacementService.applyReplacements('', entries)

      expect(result.content).toBe('')
      expect(result.replacements).toEqual([])
      expect(result.totalReplacements).toBe(0)
    })

    it('counts multiple occurrences of the same term accurately', () => {
      const entries = [makeEntry()]
      const result = terminologyReplacementService.applyReplacements(
        '设备管理是核心，设备管理很重要，设备管理不可少',
        entries
      )

      expect(result.content).toBe(
        '装备全寿命周期管理是核心，装备全寿命周期管理很重要，装备全寿命周期管理不可少'
      )
      expect(result.replacements).toHaveLength(1)
      expect(result.replacements[0].count).toBe(3)
      expect(result.totalReplacements).toBe(3)
    })

    it('escapes regex special characters in sourceTerm', () => {
      const entries = [
        makeEntry({
          sourceTerm: '版本(V1.0)',
          targetTerm: '版本号V1.0',
          normalizedSourceTerm: '版本(v1.0)',
        }),
      ]
      const result = terminologyReplacementService.applyReplacements(
        '当前版本(V1.0)已发布',
        entries
      )

      expect(result.content).toBe('当前版本号V1.0已发布')
      expect(result.totalReplacements).toBe(1)
    })

    it('escapes dot in sourceTerm without matching arbitrary character', () => {
      const entries = [
        makeEntry({
          sourceTerm: 'v2.0',
          targetTerm: '第二版',
          normalizedSourceTerm: 'v2.0',
        }),
      ]
      const result = terminologyReplacementService.applyReplacements(
        '升级到v2.0版本，不是v2X0',
        entries
      )

      expect(result.content).toBe('升级到第二版版本，不是v2X0')
      expect(result.totalReplacements).toBe(1)
    })
  })

  describe('buildPromptContext', () => {
    it('formats entries with header and arrow notation', () => {
      const entries = [
        makeEntry({ sourceTerm: '设备管理', targetTerm: '装备全寿命周期管理' }),
        makeEntry({ id: '2', sourceTerm: '投标', targetTerm: '响应' }),
      ]

      const result = terminologyReplacementService.buildPromptContext(entries)

      expect(result).toContain('【行业术语规范】')
      expect(result).toContain('- "设备管理" → "装备全寿命周期管理"')
      expect(result).toContain('- "投标" → "响应"')
    })

    it('returns empty string for empty list', () => {
      const result = terminologyReplacementService.buildPromptContext([])
      expect(result).toBe('')
    })
  })
})
