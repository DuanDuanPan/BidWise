import { createIpcHandler } from './create-handler'
import { complianceService } from '@main/services/compliance-service'
import type { IpcChannel } from '@shared/ipc-types'

type ComplianceChannel = Extract<IpcChannel, `compliance:${string}`>

const complianceHandlerMap: { [C in ComplianceChannel]: () => void } = {
  'compliance:check': () =>
    createIpcHandler('compliance:check', ({ projectId }) =>
      complianceService.checkMandatoryCompliance(projectId)
    ),
  'compliance:export-gate': () =>
    createIpcHandler('compliance:export-gate', ({ projectId }) =>
      complianceService.getMandatoryComplianceForExport(projectId)
    ),
}

export type RegisteredComplianceChannels = ComplianceChannel

export function registerComplianceHandlers(): void {
  for (const register of Object.values(complianceHandlerMap)) {
    register()
  }
}
