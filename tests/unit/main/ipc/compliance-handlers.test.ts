import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockCheckMandatoryCompliance = vi.hoisted(() => vi.fn())
const mockGetMandatoryComplianceForExport = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

vi.mock('@main/services/compliance-service', () => ({
  complianceService: {
    checkMandatoryCompliance: mockCheckMandatoryCompliance,
    getMandatoryComplianceForExport: mockGetMandatoryComplianceForExport,
  },
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { BidWiseError }
})

vi.mock('@shared/constants', () => ({
  ErrorCode: { UNKNOWN: 'UNKNOWN' },
}))

import { registerComplianceHandlers } from '@main/ipc/compliance-handlers'

describe('compliance-handlers @story-7-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers both compliance channels', () => {
    registerComplianceHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('compliance:check')
    expect(registeredChannels).toContain('compliance:export-gate')
    expect(registeredChannels).toHaveLength(2)
  })

  it('compliance:check handler wraps response in success envelope', async () => {
    const mockResult = {
      items: [],
      totalConfirmed: 0,
      coveredCount: 0,
      partialCount: 0,
      uncoveredCount: 0,
      unlinkedCount: 0,
      complianceRate: 100,
    }
    mockCheckMandatoryCompliance.mockResolvedValue(mockResult)
    registerComplianceHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'compliance:check'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: mockResult })
    expect(mockCheckMandatoryCompliance).toHaveBeenCalledWith('proj-1')
  })

  it('compliance:check handler returns null when detection not executed', async () => {
    mockCheckMandatoryCompliance.mockResolvedValue(null)
    registerComplianceHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'compliance:check'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: null })
  })

  it('compliance:export-gate handler wraps response', async () => {
    const mockGate = { status: 'pass', canExport: true, blockingItems: [], complianceRate: 100 }
    mockGetMandatoryComplianceForExport.mockResolvedValue(mockGate)
    registerComplianceHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'compliance:export-gate'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: mockGate })
  })

  it('handler wraps BidWiseError in error envelope', async () => {
    const { BidWiseError } = await import('@main/utils/errors')
    mockCheckMandatoryCompliance.mockRejectedValue(new BidWiseError('TEST_ERR', 'test error'))
    registerComplianceHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'compliance:check'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({
      success: false,
      error: { code: 'TEST_ERR', message: 'test error' },
    })
  })
})
