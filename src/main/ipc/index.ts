import { registerProjectHandlers } from './project-handlers'
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
import type { RegisteredProjectChannels } from './project-handlers'
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
import type { IpcChannel } from '@shared/ipc-types'

// Compile-time exhaustive check: every IpcChannel must be covered by a handler module.
// If a new channel is added to IpcChannelMap without a corresponding handler,
// this fails with: Type 'true' does not satisfy type 'never'.
type _AllRegistered =
  | RegisteredProjectChannels
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
type _Unregistered = Exclude<IpcChannel, _AllRegistered>
void (true satisfies [_Unregistered] extends [never] ? true : never)

export function registerIpcHandlers(): void {
  registerProjectHandlers()
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
}
