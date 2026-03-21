import * as path from 'path'
import * as fs from 'fs'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { extractPdfText } from './pdf-extractor'
import { extractWordText } from './word-extractor'
import { detectSections } from './section-detector'
import type { TenderFormat, ParsedTender } from '@shared/analysis-types'

const logger = createLogger('document-parser')

interface ParseOptions {
  onProgress?: (progress: number, message: string) => void
}

const SUPPORTED_EXTENSIONS: Record<string, TenderFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
}

export class RfpParser {
  async parse(filePath: string, options: ParseOptions = {}): Promise<ParsedTender> {
    const { onProgress } = options

    // Step 1: Detect format
    onProgress?.(5, '检测文件格式...')
    const ext = path.extname(filePath).toLowerCase()
    const format = SUPPORTED_EXTENSIONS[ext]
    if (!format) {
      throw new BidWiseError(
        ErrorCode.UNSUPPORTED_FORMAT,
        `不支持的文件格式: ${ext}，仅支持 PDF、DOCX、DOC`
      )
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const originalFileName = path.basename(filePath)
    logger.info(`Parsing file: ${originalFileName} format=${format} size=${fileSize}`)

    // Step 2: Extract text
    onProgress?.(10, '提取文档文本...')

    let rawText: string
    let pageCount: number
    let hasScannedContent = false
    let htmlSections: { title: string; content: string; level: number }[] | undefined

    if (format === 'pdf') {
      const result = await extractPdfText(filePath)
      rawText = result.text
      pageCount = result.pageCount
      hasScannedContent = result.isScanned
    } else {
      const result = await extractWordText(filePath)
      rawText = result.text
      htmlSections = result.sections
      // Word docs: estimate page count from text length (approx 2000 chars/page)
      pageCount = Math.max(1, Math.ceil(rawText.length / 2000))
    }

    onProgress?.(40, '提取文档文本...')

    // Step 3: Detect sections
    onProgress?.(50, '识别文档结构...')
    const sections = detectSections(rawText, format, pageCount, htmlSections)
    onProgress?.(70, '识别文档结构...')

    // Step 4: Assemble result
    onProgress?.(80, '整理解析结果...')
    const now = new Date().toISOString()
    const parsed: ParsedTender = {
      meta: {
        originalFileName,
        format,
        fileSize,
        pageCount,
        importedAt: now,
        parseCompletedAt: now,
      },
      sections,
      rawText,
      totalPages: pageCount,
      hasScannedContent,
    }

    onProgress?.(90, '整理解析结果...')
    logger.info(
      `Parse complete: ${originalFileName} pages=${pageCount} sections=${sections.length} scanned=${hasScannedContent}`
    )

    return parsed
  }
}
