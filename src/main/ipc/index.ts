import { registerProjectHandlers } from './project-handlers'
import { registerConfigHandlers } from './config-handlers'
import { registerAgentHandlers } from './agent-handlers'
import { registerTaskHandlers } from './task-handlers'
import { registerAnalysisHandlers } from './analysis-handlers'
import { registerDocumentHandlers } from './document-handlers'
import { registerTemplateHandlers } from './template-handlers'
import { registerChapterHandlers } from './chapter-handlers'
import { registerAnnotationHandlers } from './annotation-handlers'
import { registerSourceAttributionHandlers } from './source-attribution-handlers'
import { registerWritingStyleHandlers } from './writing-style-handlers'
import { registerDrawioHandlers } from './drawio-handlers'
import { registerDocxBridgeHandlers } from './docx-bridge-handlers'
import { registerMermaidHandlers } from './mermaid-handlers'
import { registerNotificationHandlers } from './notification-handlers'
import { registerExportHandlers } from './export-handlers'
import { registerAssetHandlers } from './asset-handlers'
import { registerComplianceHandlers } from './compliance-handlers'
import { registerReviewHandlers } from './review-handlers'
import { registerTerminologyHandlers } from './terminology-handlers'
import type { RegisteredProjectChannels } from './project-handlers'
import type { RegisteredConfigChannels } from './config-handlers'
import type { RegisteredAgentChannels } from './agent-handlers'
import type { RegisteredTaskChannels } from './task-handlers'
import type { RegisteredAnalysisChannels } from './analysis-handlers'
import type { RegisteredDocumentChannels } from './document-handlers'
import type { RegisteredTemplateChannels } from './template-handlers'
import type { RegisteredChapterChannels } from './chapter-handlers'
import type { RegisteredAnnotationChannels } from './annotation-handlers'
import type { RegisteredSourceAttributionChannels } from './source-attribution-handlers'
import type { RegisteredWritingStyleChannels } from './writing-style-handlers'
import type { RegisteredDrawioChannels } from './drawio-handlers'
import type { RegisteredDocxBridgeChannels } from './docx-bridge-handlers'
import type { RegisteredMermaidChannels } from './mermaid-handlers'
import type { RegisteredNotificationChannels } from './notification-handlers'
import type { RegisteredExportChannels } from './export-handlers'
import type { RegisteredAssetChannels } from './asset-handlers'
import type { RegisteredComplianceChannels } from './compliance-handlers'
import type { RegisteredReviewChannels } from './review-handlers'
import type { RegisteredTerminologyChannels } from './terminology-handlers'
import type { IpcChannel } from '@shared/ipc-types'

// Compile-time exhaustive check: every IpcChannel must be covered by a handler module.
// If a new channel is added to IpcChannelMap without a corresponding handler,
// this fails with: Type 'true' does not satisfy type 'never'.
type _AllRegistered =
  | RegisteredProjectChannels
  | RegisteredConfigChannels
  | RegisteredAgentChannels
  | RegisteredTaskChannels
  | RegisteredAnalysisChannels
  | RegisteredDocumentChannels
  | RegisteredTemplateChannels
  | RegisteredChapterChannels
  | RegisteredAnnotationChannels
  | RegisteredSourceAttributionChannels
  | RegisteredWritingStyleChannels
  | RegisteredDrawioChannels
  | RegisteredDocxBridgeChannels
  | RegisteredMermaidChannels
  | RegisteredNotificationChannels
  | RegisteredExportChannels
  | RegisteredAssetChannels
  | RegisteredComplianceChannels
  | RegisteredReviewChannels
  | RegisteredTerminologyChannels
type _Unregistered = Exclude<IpcChannel, _AllRegistered>
void (true satisfies [_Unregistered] extends [never] ? true : never)

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerConfigHandlers()
  registerAgentHandlers()
  registerTaskHandlers()
  registerAnalysisHandlers()
  registerDocumentHandlers()
  registerTemplateHandlers()
  registerChapterHandlers()
  registerAnnotationHandlers()
  registerSourceAttributionHandlers()
  registerWritingStyleHandlers()
  registerDrawioHandlers()
  registerDocxBridgeHandlers()
  registerMermaidHandlers()
  registerNotificationHandlers()
  registerExportHandlers()
  registerAssetHandlers()
  registerComplianceHandlers()
  registerReviewHandlers()
  registerTerminologyHandlers()
}
