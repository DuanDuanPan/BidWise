import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───

const mockReadFileSync = vi.fn()
vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}))

const mockGetText = vi.fn()
const mockDestroy = vi.fn()
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText = (...args: unknown[]): unknown => mockGetText(...args)
    destroy = (...args: unknown[]): unknown => mockDestroy(...args)
  },
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
  ErrorCode: { TENDER_PARSE: 'TENDER_PARSE' },
}))

import { extractPdfText } from '@main/services/document-parser/pdf-extractor'

describe('pdf-extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDestroy.mockResolvedValue(undefined)
  })

  it('should extract text and page count from normal PDF', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
    const page1 = 'Page 1 content with enough text to pass the scanned threshold easily here'
    const page2 = 'Page 2 content with enough text to pass the scanned threshold easily here'
    mockGetText.mockResolvedValue({
      text: `${page1}\f${page2}`,
      total: 2,
      pages: [
        { num: 1, text: page1 },
        { num: 2, text: page2 },
      ],
    })

    const result = await extractPdfText('/test/doc.pdf')

    expect(result.text).toContain('Page 1')
    expect(result.pageCount).toBe(2)
    expect(result.pages).toHaveLength(2)
    expect(result.pages[0].pageNum).toBe(1)
    expect(result.isScanned).toBe(false)
  })

  it('should return empty text + pageCount=0 for empty PDF', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
    mockGetText.mockResolvedValue({
      text: '',
      total: 0,
      pages: [],
    })

    const result = await extractPdfText('/test/empty.pdf')

    expect(result.text).toBe('')
    expect(result.pageCount).toBe(0)
    expect(result.isScanned).toBe(false)
  })

  it('should detect scanned content when text density is low', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
    mockGetText.mockResolvedValue({
      text: 'ab\fcd\fef\fgh\fij',
      total: 5,
      pages: [
        { num: 1, text: 'ab' },
        { num: 2, text: 'cd' },
        { num: 3, text: 'ef' },
        { num: 4, text: 'gh' },
        { num: 5, text: 'ij' },
      ],
    })

    const result = await extractPdfText('/test/scanned.pdf')

    expect(result.isScanned).toBe(true)
  })

  it('should throw BidWiseError(TENDER_PARSE) for corrupted files', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
    mockGetText.mockRejectedValue(new Error('Invalid PDF structure'))

    await expect(extractPdfText('/test/bad.pdf')).rejects.toThrow('PDF 解析失败')
  })

  it('should throw BidWiseError for encrypted PDF', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
    mockGetText.mockRejectedValue(new Error('password required'))

    await expect(extractPdfText('/test/encrypted.pdf')).rejects.toThrow('加密')
  })

  it('should throw BidWiseError when file cannot be read', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    await expect(extractPdfText('/nonexistent.pdf')).rejects.toThrow('无法读取')
  })
})
