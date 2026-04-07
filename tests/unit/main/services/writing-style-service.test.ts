import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

const mockReaddir = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())
const mockExistsSync = vi.hoisted(() => vi.fn())
const mockApp = vi.hoisted(() => ({
  getAppPath: vi.fn().mockReturnValue('/app'),
  getPath: vi.fn().mockReturnValue('/user-data'),
}))

vi.mock('electron', () => ({ app: mockApp }))
vi.mock('fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))
vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
}))

const mockDocumentService = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  getMetadata: vi.fn(),
  saveSync: vi.fn(),
  updateMetadata: vi.fn(),
}))
vi.mock('@main/services/document-service', () => ({
  documentService: mockDocumentService,
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
      this.name = 'BidWiseError'
    }
  }
  class ValidationError extends BidWiseError {
    constructor(message: string) {
      super('VALIDATION', message)
      this.name = 'ValidationError'
    }
  }
  return { BidWiseError, ValidationError }
})

import { writingStyleService, serializeStyleForPrompt } from '@main/services/writing-style-service'
import type { WritingStyleTemplate } from '@shared/writing-style-types'

const MILITARY_STYLE = {
  id: 'military',
  name: '军工文风',
  description: '军工文风描述',
  version: '1.0',
  toneGuidance: '严谨、精确',
  vocabularyRules: ['使用"保障"而非"保证"'],
  forbiddenWords: ['非常', '大概'],
  sentencePatterns: ['多用"本系统"作为主语'],
  exampleSnippet: '本系统采用分布式架构。',
}

const GENERAL_STYLE = {
  id: 'general',
  name: '通用文风',
  description: '通用文风描述',
  version: '1.0',
  toneGuidance: '专业、清晰',
  vocabularyRules: [],
  forbiddenWords: [],
  sentencePatterns: [],
}

describe('@story-3-6 writingStyleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writingStyleService.clearCache()
    mockExistsSync.mockReturnValue(false)
  })

  describe('listStyles', () => {
    it('@p0 should scan built-in directory for .style.json files', async () => {
      mockReaddir.mockResolvedValue(['military.style.json', 'general.style.json', 'readme.txt'])
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('military')) return Promise.resolve(JSON.stringify(MILITARY_STYLE))
        return Promise.resolve(JSON.stringify(GENERAL_STYLE))
      })

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(2)
      expect(styles.find((s) => s.id === 'military')?.source).toBe('built-in')
      expect(styles.find((s) => s.id === 'general')?.source).toBe('built-in')
    })

    it('@p0 should set source from directory, not from file content', async () => {
      mockReaddir.mockResolvedValue(['military.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify({ ...MILITARY_STYLE, source: 'company' }))

      const styles = await writingStyleService.listStyles()

      // source should be overridden to 'built-in' regardless of file content
      expect(styles[0].source).toBe('built-in')
    })

    it('@p1 should fall back to cwd resources when app path resources are absent', async () => {
      const cwdStyleDir = join(process.cwd(), 'resources', 'writing-styles')
      mockExistsSync.mockImplementation((path: string) => path === cwdStyleDir)
      mockReaddir.mockResolvedValue(['general.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(GENERAL_STYLE))

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(1)
      expect(mockReaddir).toHaveBeenCalledWith(cwdStyleDir)
    })

    it('@p1 should override built-in with company styles of same id', async () => {
      mockExistsSync.mockReturnValue(true)

      const builtinMilitary = { ...MILITARY_STYLE }
      const companyMilitary = { ...MILITARY_STYLE, name: '公司军工文风' }

      mockReaddir
        .mockResolvedValueOnce(['military.style.json']) // built-in
        .mockResolvedValueOnce(['military.style.json']) // company

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(builtinMilitary))
        .mockResolvedValueOnce(JSON.stringify(companyMilitary))

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(1)
      expect(styles[0].name).toBe('公司军工文风')
      expect(styles[0].source).toBe('company')
    })

    it('@p1 should re-scan on each call to discover new company styles', async () => {
      mockReaddir.mockResolvedValue(['general.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(GENERAL_STYLE))

      await writingStyleService.listStyles()
      await writingStyleService.listStyles()

      // readdir is called each time — listStyles always re-scans
      expect(mockReaddir).toHaveBeenCalledTimes(2)
    })

    it('@p2 should reject malformed JSON missing required fields', async () => {
      const malformed = { id: 'bad', name: 'Bad Style' } // missing description, version, toneGuidance, arrays
      mockReaddir.mockResolvedValue(['bad.style.json', 'general.style.json'])
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(malformed))
        .mockResolvedValueOnce(JSON.stringify(GENERAL_STYLE))

      const styles = await writingStyleService.listStyles()

      // Malformed file should be skipped, only general loaded
      expect(styles).toHaveLength(1)
      expect(styles[0].id).toBe('general')
    })

    it('@p2 should reject JSON with wrong field types', async () => {
      const wrongTypes = {
        ...GENERAL_STYLE,
        vocabularyRules: 'not-an-array', // should be array
      }
      mockReaddir.mockResolvedValue(['bad.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(wrongTypes))

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(0)
    })

    it('@p2 should reject arrays with non-string elements', async () => {
      const nonStringElements = {
        ...GENERAL_STYLE,
        forbiddenWords: [123, null, '有效词'],
      }
      mockReaddir.mockResolvedValue(['bad.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(nonStringElements))

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(0)
    })

    it('@p2 should handle unreadable style files gracefully', async () => {
      mockReaddir.mockResolvedValue(['bad.style.json', 'general.style.json'])
      mockReadFile
        .mockRejectedValueOnce(new Error('permission denied'))
        .mockResolvedValueOnce(JSON.stringify(GENERAL_STYLE))

      const styles = await writingStyleService.listStyles()

      expect(styles).toHaveLength(1)
      expect(styles[0].id).toBe('general')
    })
  })

  describe('getStyle', () => {
    it('@p0 should return style by id from cache', async () => {
      mockReaddir.mockResolvedValue(['military.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(MILITARY_STYLE))

      const style = await writingStyleService.getStyle('military')

      expect(style).not.toBeNull()
      expect(style!.id).toBe('military')
    })

    it('@p0 should return null for non-existent style', async () => {
      mockReaddir.mockResolvedValue(['general.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(GENERAL_STYLE))

      const style = await writingStyleService.getStyle('nonexistent')

      expect(style).toBeNull()
    })

    it('@p1 should force reload on cache miss', async () => {
      mockReaddir.mockResolvedValue(['general.style.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(GENERAL_STYLE))

      // First call populates cache
      await writingStyleService.listStyles()
      expect(mockReaddir).toHaveBeenCalledTimes(1)

      // Clear cache and search for a style — triggers reload
      writingStyleService.clearCache()
      await writingStyleService.getStyle('general')

      // readdir called again for reload (getStyle loads cache, finds it, returns)
      expect(mockReaddir).toHaveBeenCalledTimes(2)
    })
  })

  describe('getProjectWritingStyle', () => {
    beforeEach(() => {
      mockReaddir.mockResolvedValue(['military.style.json', 'general.style.json'])
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('military')) return Promise.resolve(JSON.stringify(MILITARY_STYLE))
        return Promise.resolve(JSON.stringify(GENERAL_STYLE))
      })
    })

    it('@p0 should return style from project metadata', async () => {
      mockDocumentService.getMetadata.mockResolvedValue({ writingStyleId: 'military' })

      const style = await writingStyleService.getProjectWritingStyle('proj-1')

      expect(style.id).toBe('military')
    })

    it('@p0 should fallback to general when writingStyleId is not set', async () => {
      mockDocumentService.getMetadata.mockResolvedValue({})

      const style = await writingStyleService.getProjectWritingStyle('proj-1')

      expect(style.id).toBe('general')
    })

    it('@p1 should fallback to general when writingStyleId does not match any template', async () => {
      mockDocumentService.getMetadata.mockResolvedValue({ writingStyleId: 'deleted-style' })

      const style = await writingStyleService.getProjectWritingStyle('proj-1')

      expect(style.id).toBe('general')
    })

    it('@p0 should throw when general template is also missing', async () => {
      mockReaddir.mockReset()
      mockReaddir.mockResolvedValue([])
      writingStyleService.clearCache()
      mockDocumentService.getMetadata.mockResolvedValue({})

      await expect(writingStyleService.getProjectWritingStyle('proj-1')).rejects.toThrow(
        'general 文风模板缺失'
      )
    })
  })

  describe('updateProjectWritingStyle', () => {
    beforeEach(() => {
      mockReaddir.mockResolvedValue(['military.style.json', 'general.style.json'])
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('military')) return Promise.resolve(JSON.stringify(MILITARY_STYLE))
        return Promise.resolve(JSON.stringify(GENERAL_STYLE))
      })
      mockDocumentService.updateMetadata.mockImplementation(
        (_pid: string, updater: (m: Record<string, unknown>) => Record<string, unknown>) =>
          Promise.resolve(updater({}))
      )
    })

    it('@p0 should persist writingStyleId via documentService.updateMetadata', async () => {
      const result = await writingStyleService.updateProjectWritingStyle('proj-1', 'military')

      expect(result).toEqual({ writingStyleId: 'military' })
      expect(mockDocumentService.updateMetadata).toHaveBeenCalledTimes(1)
    })

    it('@p0 should reject invalid styleId', async () => {
      await expect(
        writingStyleService.updateProjectWritingStyle('proj-1', 'nonexistent')
      ).rejects.toThrow('文风模板不存在')
    })
  })

  describe('serializeStyleForPrompt', () => {
    it('@p0 should include all style sections', () => {
      const style: WritingStyleTemplate = {
        ...MILITARY_STYLE,
        source: 'built-in',
      }
      const text = serializeStyleForPrompt(style)

      expect(text).toContain('军工文风')
      expect(text).toContain('严谨、精确')
      expect(text).toContain('使用"保障"而非"保证"')
      expect(text).toContain('非常')
      expect(text).toContain('大概')
      expect(text).toContain('多用"本系统"作为主语')
      expect(text).toContain('本系统采用分布式架构。')
    })

    it('@p1 should handle style with empty arrays', () => {
      const style: WritingStyleTemplate = {
        ...GENERAL_STYLE,
        source: 'built-in',
      }
      const text = serializeStyleForPrompt(style)

      expect(text).toContain('通用文风')
      expect(text).toContain('专业、清晰')
      expect(text).not.toContain('用语规范')
      expect(text).not.toContain('禁用词')
    })
  })
})
