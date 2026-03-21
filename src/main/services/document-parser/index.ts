export { RfpParser } from './rfp-parser'
export { TenderImportService } from './tender-import'
export { extractPdfText } from './pdf-extractor'
export type { PdfExtractResult } from './pdf-extractor'
export { extractWordText, convertDocToDocx } from './word-extractor'
export type { WordExtractResult, WordSection } from './word-extractor'
export { detectSections } from './section-detector'

import { RfpParser } from './rfp-parser'
import { TenderImportService } from './tender-import'

export const rfpParser = new RfpParser()
export const tenderImportService = new TenderImportService()
