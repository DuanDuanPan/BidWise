import * as fs from 'fs'
import { PDFParse } from 'pdf-parse'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'

export interface PdfExtractResult {
  text: string
  pageCount: number
  pages: { pageNum: number; text: string }[]
  isScanned: boolean
}

/** Threshold: avg chars per page below this → scanned content */
const SCANNED_CHARS_THRESHOLD = 50

export async function extractPdfText(filePath: string): Promise<PdfExtractResult> {
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.TENDER_PARSE,
      `无法读取 PDF 文件: ${(err as Error).message}`,
      err
    )
  }

  const parser = new PDFParse({ data: buffer })
  let data: Awaited<ReturnType<PDFParse['getText']>>
  try {
    data = await parser.getText()
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new BidWiseError(ErrorCode.TENDER_PARSE, 'PDF 文件已加密或需要密码，请解密后重试', err)
    }
    throw new BidWiseError(ErrorCode.TENDER_PARSE, `PDF 解析失败: ${msg}`, err)
  } finally {
    await parser.destroy().catch(() => undefined)
  }

  const pageCount = data.total ?? 0
  const text = data.text ?? ''
  const pages: PdfExtractResult['pages'] =
    data.pages && data.pages.length > 0
      ? data.pages.map((page) => ({
          pageNum: page.num,
          text: page.text,
        }))
      : text.split('\f').map((pageText, idx) => ({
          pageNum: idx + 1,
          text: pageText,
        }))

  // Scanned content detection: low avg chars per page
  const isScanned =
    pageCount > 1 && text.replace(/\s/g, '').length / pageCount < SCANNED_CHARS_THRESHOLD

  return { text, pageCount, pages, isScanned }
}
