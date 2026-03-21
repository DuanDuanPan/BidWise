import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───

const mockExtractPdfText = vi.fn()
vi.mock('@main/services/document-parser/pdf-extractor', () => ({
  extractPdfText: (...args: unknown[]) => mockExtractPdfText(...args),
}))

const mockExtractWordText = vi.fn()
vi.mock('@main/services/document-parser/word-extractor', () => ({
  extractWordText: (...args: unknown[]) => mockExtractWordText(...args),
}))

const mockDetectSections = vi.fn()
vi.mock('@main/services/document-parser/section-detector', () => ({
  detectSections: (...args: unknown[]) => mockDetectSections(...args),
}))

vi.mock('fs', () => ({
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
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
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
    TENDER_PARSE: 'TENDER_PARSE',
  },
}))

import { RfpParser } from '@main/services/document-parser/rfp-parser'

describe('rfp-parser', () => {
  let parser: RfpParser

  beforeEach(() => {
    vi.clearAllMocks()
    parser = new RfpParser()
  })

  it('should parse PDF file end-to-end', async () => {
    mockExtractPdfText.mockResolvedValue({
      text: '第一章 总则\n内容',
      pageCount: 5,
      pages: [{ pageNum: 1, text: '第一章 总则\n内容' }],
      isScanned: false,
    })
    mockDetectSections.mockReturnValue([
      { id: 'sec-1', title: '第一章 总则', content: '内容', pageStart: 1, pageEnd: 5, level: 1 },
    ])

    const result = await parser.parse('/test/doc.pdf')

    expect(result.meta.format).toBe('pdf')
    expect(result.meta.pageCount).toBe(5)
    expect(result.rawText).toContain('第一章')
    expect(result.sections).toHaveLength(1)
    expect(result.hasScannedContent).toBe(false)
    expect(mockExtractPdfText).toHaveBeenCalledWith('/test/doc.pdf')
    expect(mockDetectSections).toHaveBeenCalled()
  })

  it('should parse Word file end-to-end', async () => {
    mockExtractWordText.mockResolvedValue({
      text: '总则内容 技术要求',
      html: '<h1>总则</h1><p>总则内容</p>',
      sections: [{ title: '总则', content: '总则内容', level: 1 }],
    })
    mockDetectSections.mockReturnValue([
      { id: 'sec-1', title: '总则', content: '总则内容', pageStart: 1, pageEnd: 1, level: 1 },
    ])

    const result = await parser.parse('/test/doc.docx')

    expect(result.meta.format).toBe('docx')
    expect(result.rawText).toContain('总则内容')
    expect(mockExtractWordText).toHaveBeenCalledWith('/test/doc.docx')
  })

  it('should call onProgress at expected stages', async () => {
    mockExtractPdfText.mockResolvedValue({
      text: 'text',
      pageCount: 1,
      pages: [],
      isScanned: false,
    })
    mockDetectSections.mockReturnValue([])

    const progressCalls: Array<[number, string]> = []
    const onProgress = (p: number, msg: string): void => {
      progressCalls.push([p, msg])
    }

    await parser.parse('/test/doc.pdf', { onProgress })

    expect(progressCalls.length).toBeGreaterThanOrEqual(5)
    expect(progressCalls[0][0]).toBe(5) // Format detection
    expect(progressCalls[progressCalls.length - 1][0]).toBe(90) // Persistence happens outside parser
  })

  it('should reject unsupported format', async () => {
    await expect(parser.parse('/test/doc.txt')).rejects.toThrow('不支持的文件格式')
  })

  it('should detect scanned content from PDF', async () => {
    mockExtractPdfText.mockResolvedValue({
      text: 'ab',
      pageCount: 10,
      pages: [],
      isScanned: true,
    })
    mockDetectSections.mockReturnValue([])

    const result = await parser.parse('/test/scanned.pdf')

    expect(result.hasScannedContent).toBe(true)
  })
})
