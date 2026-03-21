import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks (vi.hoisted ensures availability before vi.mock hoisting) ───

const { mockExecFileAsync, mockExtractRawText, mockConvertToHtml } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
  mockExtractRawText: vi.fn(),
  mockConvertToHtml: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdtempSync: vi.fn().mockReturnValue('/tmp/bidwise-doc-xxx'),
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}))

vi.mock('mammoth', () => ({
  default: {
    extractRawText: (...args: unknown[]) => mockExtractRawText(...args),
    convertToHtml: (...args: unknown[]) => mockConvertToHtml(...args),
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
  ErrorCode: {
    TENDER_PARSE: 'TENDER_PARSE',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  },
}))

import {
  extractWordText,
  _resetLibreOfficeCache,
} from '@main/services/document-parser/word-extractor'

describe('word-extractor', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    _resetLibreOfficeCache()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('should extract text, html, and sections from .docx', async () => {
    mockExtractRawText.mockResolvedValue({ value: '总则内容\n技术要求内容' })
    mockConvertToHtml.mockResolvedValue({
      value: '<h1>总则</h1><p>总则内容</p><h2>技术要求</h2><p>技术要求内容</p>',
    })

    const result = await extractWordText('/test/doc.docx')

    expect(result.text).toContain('总则内容')
    expect(result.html).toContain('<h1>')
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].title).toBe('总则')
    expect(result.sections[0].level).toBe(1)
    expect(result.sections[1].title).toBe('技术要求')
    expect(result.sections[1].level).toBe(2)
  })

  it('should correctly map HTML heading levels to sections', async () => {
    mockExtractRawText.mockResolvedValue({ value: 'text' })
    mockConvertToHtml.mockResolvedValue({
      value: '<h1>Level 1</h1><p>Content</p><h3>Level 3</h3><p>Deep</p>',
    })

    const result = await extractWordText('/test/headings.docx')

    expect(result.sections[0].level).toBe(1)
    expect(result.sections[1].level).toBe(3)
  })

  it('should convert .doc via LibreOffice when available', async () => {
    // Mock: first call is 'which soffice', second is actual conversion
    mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/soffice', stderr: '' })
    mockExtractRawText.mockResolvedValue({ value: 'Converted text' })
    mockConvertToHtml.mockResolvedValue({ value: '<p>Converted text</p>' })

    const result = await extractWordText('/test/legacy.doc')

    expect(result.text).toBe('Converted text')
    expect(mockExecFileAsync).toHaveBeenCalled()
  })

  it('should throw BidWiseError(UNSUPPORTED_FORMAT) when LibreOffice not available for .doc', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('not found'))
    const fs = await import('fs')
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await expect(extractWordText('/test/legacy.doc')).rejects.toThrow('自动转换失败')
  })

  it('should resolve LibreOffice from common Windows install paths for .doc imports', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const fs = await import('fs')
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' })

    vi.mocked(fs.existsSync).mockImplementation((input) => {
      const value = String(input)
      return (
        value.includes('LibreOffice\\program\\soffice.exe') ||
        value.endsWith('legacy.docx') ||
        value.endsWith('legacy.docx'.replaceAll('\\', '/'))
      )
    })

    mockExtractRawText.mockResolvedValue({ value: 'Converted text' })
    mockConvertToHtml.mockResolvedValue({ value: '<p>Converted text</p>' })

    const result = await extractWordText('C:\\docs\\legacy.doc')

    expect(result.text).toBe('Converted text')
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      expect.stringContaining('soffice.exe'),
      expect.arrayContaining(['--headless', '--convert-to', 'docx'])
    )
  })

  it('should throw BidWiseError when mammoth fails', async () => {
    mockExtractRawText.mockRejectedValue(new Error('corrupt docx'))

    await expect(extractWordText('/test/bad.docx')).rejects.toThrow('Word 文件解析失败')
  })
})
