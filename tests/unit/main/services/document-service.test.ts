import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProposalMetadata } from '@shared/models/proposal'

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRename = vi.fn()
const mockRm = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockRenameSync = vi.fn()
const mockRmSync = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/bidwise-test'),
  },
}))

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  renameSync: (...args: unknown[]) => mockRenameSync(...args),
  rmSync: (...args: unknown[]) => mockRmSync(...args),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

const mockProjectGet = vi.fn()
vi.mock('@main/services/project-service', () => ({
  projectService: {
    get: (...args: unknown[]) => mockProjectGet(...args),
  },
}))

function createErrnoError(code: string, message = code): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = code
  return error
}

describe('documentService', () => {
  let documentService: typeof import('@main/services/document-service').documentService
  let DocumentNotFoundError: typeof import('@main/utils/errors').DocumentNotFoundError
  let DocumentSaveError: typeof import('@main/utils/errors').DocumentSaveError
  let ValidationError: typeof import('@main/utils/errors').ValidationError
  const projectRootPath = '/tmp/bidwise-test/data/projects/proj-1'

  beforeEach(async () => {
    vi.resetModules()
    mockProjectGet.mockResolvedValue({ id: 'proj-1', rootPath: projectRootPath })
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
    mockRename.mockReset()
    mockRm.mockReset()
    mockReadFileSync.mockReset()
    mockWriteFileSync.mockReset()
    mockRenameSync.mockReset()
    mockRmSync.mockReset()

    const mod = await import('@main/services/document-service')
    documentService = mod.documentService
    const errors = await import('@main/utils/errors')
    DocumentNotFoundError = errors.DocumentNotFoundError
    DocumentSaveError = errors.DocumentSaveError
    ValidationError = errors.ValidationError
  })

  describe('load', () => {
    it('reads proposal.md and returns metadata lastSavedAt', async () => {
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith('proposal.md')) {
          return Promise.resolve('# Hello')
        }
        if (path.endsWith('proposal.meta.json')) {
          return Promise.resolve(
            JSON.stringify({
              version: '1.0',
              projectId: 'proj-1',
              annotations: [],
              scores: [],
              lastSavedAt: '2026-03-21T10:00:00.000Z',
            })
          )
        }
        return Promise.reject(createErrnoError('ENOENT'))
      })

      const result = await documentService.load('proj-1')

      expect(result).toEqual({
        projectId: 'proj-1',
        content: '# Hello',
        lastSavedAt: '2026-03-21T10:00:00.000Z',
        version: 1,
      })
    })

    it('returns empty content only when proposal.md is missing', async () => {
      mockReadFile.mockRejectedValue(createErrnoError('ENOENT'))

      const result = await documentService.load('proj-1')

      expect(result.content).toBe('')
      expect(result.version).toBe(1)
    })

    it('throws on permission errors instead of masking them as empty content', async () => {
      mockReadFile.mockRejectedValue(createErrnoError('EACCES', 'permission denied'))

      await expect(documentService.load('proj-1')).rejects.toMatchObject({
        code: 'FILE_SYSTEM',
        message: expect.stringContaining('方案文件读取失败'),
      })
    })

    it('throws when project rootPath is null', async () => {
      mockProjectGet.mockResolvedValue({ id: 'proj-1', rootPath: null })

      await expect(documentService.load('proj-1')).rejects.toThrow(DocumentNotFoundError)
    })
  })

  describe('save', () => {
    it('writes proposal.md and proposal.meta.json atomically', async () => {
      mockWriteFile.mockResolvedValue(undefined)
      mockRename.mockResolvedValue(undefined)
      mockReadFile.mockRejectedValue(createErrnoError('ENOENT'))

      const result = await documentService.save('proj-1', '# Content')

      expect(result.lastSavedAt).toBeTruthy()
      expect(mockWriteFile).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('.proposal.md.tmp'),
        '# Content',
        'utf-8'
      )
      expect(mockRename).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('.proposal.md.tmp'),
        expect.stringContaining('proposal.md')
      )
      expect(mockWriteFile).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('.proposal.meta.json.tmp'),
        expect.stringContaining('"projectId": "proj-1"'),
        'utf-8'
      )
      expect(mockRename).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('.proposal.meta.json.tmp'),
        expect.stringContaining('proposal.meta.json')
      )
    })

    it('throws DocumentSaveError when proposal.md write fails', async () => {
      mockWriteFile.mockRejectedValue(new Error('disk full'))

      await expect(documentService.save('proj-1', '# Content')).rejects.toThrow(DocumentSaveError)
    })

    it('throws DocumentSaveError when metadata write fails', async () => {
      mockReadFile.mockRejectedValue(createErrnoError('ENOENT'))
      mockWriteFile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      mockRename.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('meta disk full'))

      await expect(documentService.save('proj-1', '# Content')).rejects.toThrow(DocumentSaveError)
    })
  })

  describe('saveSync', () => {
    it('writes content via atomic write using a validated project root', () => {
      mockWriteFileSync.mockReturnValue(undefined)
      mockRenameSync.mockReturnValue(undefined)
      mockReadFileSync.mockImplementation(() => {
        throw createErrnoError('ENOENT')
      })

      const result = documentService.saveSync('proj-1', projectRootPath, '# Sync Content')

      expect(result.lastSavedAt).toBeTruthy()
      expect(mockWriteFileSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('.proposal.md.tmp'),
        '# Sync Content',
        'utf-8'
      )
      expect(mockRenameSync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('.proposal.md.tmp'),
        expect.stringContaining('proposal.md')
      )
      expect(mockWriteFileSync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('.proposal.meta.json.tmp'),
        expect.stringContaining('"projectId": "proj-1"'),
        'utf-8'
      )
      expect(mockRenameSync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('.proposal.meta.json.tmp'),
        expect.stringContaining('proposal.meta.json')
      )
    })

    it('rejects renderer-provided rootPath values outside the project directory', () => {
      expect(() =>
        documentService.saveSync('proj-1', '/tmp/evil/../../outside', '# Sync Content')
      ).toThrow(ValidationError)
    })
  })

  describe('getMetadata', () => {
    it('returns parsed metadata when file exists', async () => {
      const meta: ProposalMetadata = {
        version: '1.0',
        projectId: 'proj-1',
        annotations: [],
        scores: [],
        lastSavedAt: '2026-03-21T10:00:00.000Z',
      }
      mockReadFile.mockResolvedValue(JSON.stringify(meta))

      const result = await documentService.getMetadata('proj-1')

      expect(result).toEqual(meta)
    })

    it('returns default structure when metadata file does not exist', async () => {
      mockReadFile.mockRejectedValue(createErrnoError('ENOENT'))

      const result = await documentService.getMetadata('proj-1')

      expect(result.version).toBe('1.0')
      expect(result.projectId).toBe('proj-1')
      expect(result.annotations).toEqual([])
      expect(result.scores).toEqual([])
    })

    it('throws when metadata JSON is invalid', async () => {
      mockReadFile.mockResolvedValue('{invalid-json')

      await expect(documentService.getMetadata('proj-1')).rejects.toMatchObject({
        code: 'PARSE',
      })
    })
  })
})
