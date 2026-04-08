import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/bidwise-test' },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

const mockMkdir = vi.fn()
const mockWriteFile = vi.fn()
const mockRm = vi.fn()

vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

import { mermaidAssetService } from '@main/services/mermaid-asset-service'

describe('@story-3-8 mermaid-asset-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
  })

  describe('saveMermaidAsset', () => {
    it('creates assets directory and writes SVG file', async () => {
      const result = await mermaidAssetService.saveMermaidAsset({
        projectId: 'proj-1',
        diagramId: 'uuid-1',
        svgContent: '<svg>test</svg>',
        assetFileName: 'mermaid-abc123.svg',
      })

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('proj-1/assets'), {
        recursive: true,
      })
      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('mermaid-abc123.svg'),
        '<svg>test</svg>',
        'utf-8'
      )
      expect(result.assetPath).toContain('mermaid-abc123.svg')
    })

    it('does not double-append .svg extension', async () => {
      const result = await mermaidAssetService.saveMermaidAsset({
        projectId: 'proj-1',
        diagramId: 'uuid-1',
        svgContent: '<svg/>',
        assetFileName: 'mermaid-test.svg',
      })

      expect(result.assetPath).not.toContain('.svg.svg')
      expect(result.assetPath).toMatch(/mermaid-test\.svg$/)
    })
  })

  describe('deleteMermaidAsset', () => {
    it('removes SVG file with force flag', async () => {
      await mermaidAssetService.deleteMermaidAsset({
        projectId: 'proj-1',
        assetFileName: 'mermaid-abc123.svg',
      })

      expect(mockRm).toHaveBeenCalledTimes(1)
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('mermaid-abc123.svg'), {
        force: true,
      })
    })
  })

  describe('assetFileName security validation', () => {
    it('rejects filenames without .svg extension', async () => {
      await expect(
        mermaidAssetService.saveMermaidAsset({
          projectId: 'proj-1',
          diagramId: 'uuid-1',
          svgContent: '<svg/>',
          assetFileName: 'mermaid-abc.png',
        })
      ).rejects.toThrow('assetFileName must end with .svg')
    })

    it('rejects filenames with path separators', async () => {
      await expect(
        mermaidAssetService.saveMermaidAsset({
          projectId: 'proj-1',
          diagramId: 'uuid-1',
          svgContent: '<svg/>',
          assetFileName: '../escape.svg',
        })
      ).rejects.toThrow()
    })

    it('rejects filenames with ".." path traversal', async () => {
      await expect(
        mermaidAssetService.deleteMermaidAsset({
          projectId: 'proj-1',
          assetFileName: 'test..evil.svg',
        })
      ).rejects.toThrow('assetFileName must not contain ".."')
    })

    it('rejects absolute paths', async () => {
      await expect(
        mermaidAssetService.saveMermaidAsset({
          projectId: 'proj-1',
          diagramId: 'uuid-1',
          svgContent: '<svg/>',
          assetFileName: '/tmp/evil.svg',
        })
      ).rejects.toThrow()
    })
  })
})
