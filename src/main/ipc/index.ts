import { registerProjectHandlers } from './project-handlers'
import type { RegisteredProjectChannels } from './project-handlers'
import type { IpcChannel } from '@shared/ipc-types'

// Compile-time exhaustive check: every IpcChannel must be covered by a handler module.
// If a new channel is added to IpcChannelMap without a corresponding handler,
// this fails with: Type 'true' does not satisfy type 'never'.
type _AllRegistered = RegisteredProjectChannels // | RegisteredAnalysisChannels ← 后续添加
type _Unregistered = Exclude<IpcChannel, _AllRegistered>
void (true satisfies [_Unregistered] extends [never] ? true : never)

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  // registerAnalysisHandlers()  ← 后续 Story 添加
  // registerAgentHandlers()     ← 后续 Story 添加
}
