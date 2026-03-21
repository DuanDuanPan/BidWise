import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───

const mockAccess = vi.fn()
const mockMkdir = vi.fn()
const mockCopyFile = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

const mockFindById = vi.fn()
vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindById
  },
}))

const mockEnqueue = vi.fn()
const mockExecute = vi.fn()
vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

const mockParse = vi.fn()
vi.mock('./rfp-parser', () => ({
  RfpParser: class {
    parse = mockParse
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string,
      public cause?: unknown
    ) {
      super(message)
    }
  },
}))

vi.mock('@shared/constants', () => ({
  ErrorCode: {
    TENDER_IMPORT: 'TENDER_IMPORT',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  },
}))

import { TenderImportService } from '@main/services/document-parser/tender-import'

describe('tender-import', () => {
  let service: TenderImportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new TenderImportService()
    mockFindById.mockResolvedValue({ id: 'proj-1', rootPath: '/data/projects/proj-1' })
    mockAccess.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockCopyFile.mockResolvedValue(undefined)
    mockEnqueue.mockResolvedValue('task-1')
    mockExecute.mockResolvedValue({})
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('should copy file to project tender/ directory', async () => {
    await service.importTender({ projectId: 'proj-1', filePath: '/upload/doc.pdf' })

    expect(mockMkdir).toHaveBeenCalledWith('/data/projects/proj-1/tender/original', {
      recursive: true,
    })
    expect(mockCopyFile).toHaveBeenCalledWith(
      '/upload/doc.pdf',
      '/data/projects/proj-1/tender/original/doc.pdf'
    )
  })

  it('should enqueue task and return taskId', async () => {
    const result = await service.importTender({ projectId: 'proj-1', filePath: '/upload/doc.pdf' })

    expect(result.taskId).toBe('task-1')
    expect(mockEnqueue).toHaveBeenCalledWith({
      category: 'import',
      input: {
        projectId: 'proj-1',
        filePath: '/data/projects/proj-1/tender/original/doc.pdf',
        originalFileName: 'doc.pdf',
      },
    })
  })

  it('should call execute fire-and-forget', async () => {
    await service.importTender({ projectId: 'proj-1', filePath: '/upload/doc.pdf' })

    expect(mockExecute).toHaveBeenCalledWith('task-1', expect.any(Function))
  })

  it('should throw BidWiseError when file does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'))

    await expect(
      service.importTender({ projectId: 'proj-1', filePath: '/nonexistent.pdf' })
    ).rejects.toThrow('文件不存在')
  })

  it('should throw BidWiseError for unsupported format', async () => {
    await expect(
      service.importTender({ projectId: 'proj-1', filePath: '/upload/doc.txt' })
    ).rejects.toThrow('不支持的文件格式')
  })

  it('getTender should read existing parsed result', async () => {
    const parsed = {
      meta: { originalFileName: 'doc.pdf', format: 'pdf' },
      sections: [],
      rawText: 'text',
      totalPages: 5,
      hasScannedContent: false,
    }
    mockReadFile.mockResolvedValue(JSON.stringify(parsed))

    const result = await service.getTender('proj-1')

    expect(result).toEqual(parsed)
    expect(mockReadFile).toHaveBeenCalledWith(
      '/data/projects/proj-1/tender/tender-parsed.json',
      'utf-8'
    )
  })

  it('getTender should return null when file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await service.getTender('proj-1')

    expect(result).toBeNull()
  })
})
