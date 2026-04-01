export { RfpParser } from './rfp-parser'
export { TenderImportService } from './tender-import'
export { ScoringExtractor } from './scoring-extractor'
export { MandatoryItemDetector } from './mandatory-item-detector'
export { StrategySeedGenerator } from './strategy-seed-generator'
export { extractPdfText } from './pdf-extractor'
export type { PdfExtractResult } from './pdf-extractor'
export { extractWordText, convertDocToDocx } from './word-extractor'
export type { WordExtractResult, WordSection } from './word-extractor'
export { detectSections } from './section-detector'

import { RfpParser } from './rfp-parser'
import { TenderImportService } from './tender-import'
import { ScoringExtractor } from './scoring-extractor'
import { MandatoryItemDetector } from './mandatory-item-detector'
import { StrategySeedGenerator } from './strategy-seed-generator'

export const rfpParser = new RfpParser()
export const tenderImportService = new TenderImportService()
export const scoringExtractor = new ScoringExtractor()
export const mandatoryItemDetector = new MandatoryItemDetector()
export const strategySeedGenerator = new StrategySeedGenerator()
