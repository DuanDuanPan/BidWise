import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockMkdir = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRm = vi.fn()

vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

vi.mock('@main/utils/project-paths', () => ({
  resolveProjectDataPath: (id: string) => `/data/projects/${id}`,
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@main/utils/errors', () => ({
  ValidationError: class extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'ValidationError'
    }
  },
}))

import { aiDiagramAssetService } from '@main/services/ai-diagram-asset-service'

describe('@story-3-9 aiDiagramAssetService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
  })

  describe('saveAiDiagramAsset', () => {
    it('saves SVG to correct path', async () => {
      const result = await aiDiagramAssetService.saveAiDiagramAsset({
        projectId: 'proj-1',
        diagramId: 'diag-1',
        svgContent: '<svg></svg>',
        assetFileName: 'ai-diagram-abc.svg',
      })

      expect(mockMkdir).toHaveBeenCalledWith('/data/projects/proj-1/assets', { recursive: true })
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/data/projects/proj-1/assets/ai-diagram-abc.svg',
        '<svg></svg>',
        'utf-8'
      )
      expect(result.assetPath).toBe('/data/projects/proj-1/assets/ai-diagram-abc.svg')
    })

    it('rejects non-.svg extension', async () => {
      await expect(
        aiDiagramAssetService.saveAiDiagramAsset({
          projectId: 'p',
          diagramId: 'd',
          svgContent: '',
          assetFileName: 'bad.png',
        })
      ).rejects.toThrow('must end with .svg')
    })

    it('rejects path traversal', async () => {
      await expect(
        aiDiagramAssetService.saveAiDiagramAsset({
          projectId: 'p',
          diagramId: 'd',
          svgContent: '',
          assetFileName: '../escape.svg',
        })
      ).rejects.toThrow('basename')
    })

    it('rejects backslashes', async () => {
      await expect(
        aiDiagramAssetService.saveAiDiagramAsset({
          projectId: 'p',
          diagramId: 'd',
          svgContent: '',
          assetFileName: 'sub\\file.svg',
        })
      ).rejects.toThrow('backslashes')
    })

    it('rejects double dots', async () => {
      await expect(
        aiDiagramAssetService.saveAiDiagramAsset({
          projectId: 'p',
          diagramId: 'd',
          svgContent: '',
          assetFileName: 'a..b.svg',
        })
      ).rejects.toThrow('..')
    })
  })

  describe('loadAiDiagramAsset', () => {
    it('returns SVG content for existing file', async () => {
      mockReadFile.mockResolvedValue('<svg>loaded</svg>')

      const result = await aiDiagramAssetService.loadAiDiagramAsset({
        projectId: 'proj-1',
        assetFileName: 'ai-diagram-abc.svg',
      })

      expect(result).toEqual({ svgContent: '<svg>loaded</svg>' })
    })

    it('returns null for missing file', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'))

      const result = await aiDiagramAssetService.loadAiDiagramAsset({
        projectId: 'proj-1',
        assetFileName: 'missing.svg',
      })

      expect(result).toBeNull()
    })

    it('validates filename before loading', async () => {
      await expect(
        aiDiagramAssetService.loadAiDiagramAsset({
          projectId: 'p',
          assetFileName: '../hack.svg',
        })
      ).rejects.toThrow('basename')
    })
  })

  describe('deleteAiDiagramAsset', () => {
    it('deletes asset file', async () => {
      await aiDiagramAssetService.deleteAiDiagramAsset({
        projectId: 'proj-1',
        assetFileName: 'ai-diagram-abc.svg',
      })

      expect(mockRm).toHaveBeenCalledWith('/data/projects/proj-1/assets/ai-diagram-abc.svg', {
        force: true,
      })
    })

    it('validates filename before deleting', async () => {
      await expect(
        aiDiagramAssetService.deleteAiDiagramAsset({
          projectId: 'p',
          assetFileName: 'bad.png',
        })
      ).rejects.toThrow('must end with .svg')
    })
  })
})
