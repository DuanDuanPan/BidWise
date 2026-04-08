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
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRm = vi.fn()

vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

import { drawioAssetService } from '@main/services/drawio-asset-service'

describe('@story-3-7 drawio-asset-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
  })

  describe('saveDrawioAsset', () => {
    it('creates assets directory and writes xml + png files', async () => {
      const result = await drawioAssetService.saveDrawioAsset({
        projectId: 'proj-1',
        diagramId: 'uuid-1',
        xml: '<mxGraphModel/>',
        pngBase64: 'iVBORw0KGgo=',
        fileName: 'diagram-abc.drawio',
      })

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('proj-1/assets'), {
        recursive: true,
      })
      expect(mockWriteFile).toHaveBeenCalledTimes(2)
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('diagram-abc.drawio'),
        '<mxGraphModel/>',
        'utf-8'
      )
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('diagram-abc.png'),
        expect.any(Buffer)
      )
      expect(result.assetPath).toContain('diagram-abc.drawio')
      expect(result.pngPath).toContain('diagram-abc.png')
    })
  })

  describe('loadDrawioAsset', () => {
    it('returns xml and pngDataUrl when files exist', async () => {
      mockReadFile.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.endsWith('.drawio')) {
          return Promise.resolve('<mxGraphModel/>')
        }
        return Promise.resolve(Buffer.from('PNG_DATA'))
      })

      const result = await drawioAssetService.loadDrawioAsset({
        projectId: 'proj-1',
        fileName: 'diagram-abc.drawio',
      })

      expect(result).not.toBeNull()
      expect(result!.xml).toBe('<mxGraphModel/>')
      expect(result!.pngDataUrl).toContain('data:image/png;base64,')
    })

    it('returns null when file does not exist', async () => {
      const enoentError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      mockReadFile.mockRejectedValue(enoentError)

      const result = await drawioAssetService.loadDrawioAsset({
        projectId: 'proj-1',
        fileName: 'nonexistent.drawio',
      })

      expect(result).toBeNull()
    })

    it('throws on non-ENOENT errors', async () => {
      mockReadFile.mockRejectedValue(new Error('permission denied'))

      await expect(
        drawioAssetService.loadDrawioAsset({
          projectId: 'proj-1',
          fileName: 'diagram.drawio',
        })
      ).rejects.toThrow('permission denied')
    })
  })

  describe('deleteDrawioAsset', () => {
    it('removes both drawio and png files', async () => {
      await drawioAssetService.deleteDrawioAsset({
        projectId: 'proj-1',
        fileName: 'diagram-abc.drawio',
      })

      expect(mockRm).toHaveBeenCalledTimes(2)
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('diagram-abc.drawio'), {
        force: true,
      })
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('diagram-abc.png'), {
        force: true,
      })
    })
  })
})
