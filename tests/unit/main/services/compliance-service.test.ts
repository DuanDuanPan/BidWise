import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockGetItems = vi.hoisted(() => vi.fn())
const mockFindByProject = vi.hoisted(() => vi.fn())
const mockFindByProjectReq = vi.hoisted(() => vi.fn())

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@main/db/repositories/traceability-link-repo', () => ({
  TraceabilityLinkRepository: class {
    findByProject = mockFindByProject
  },
}))

vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindByProjectReq
  },
}))

vi.mock('@main/services/document-parser', () => ({
  mandatoryItemDetector: {
    getItems: mockGetItems,
  },
}))

import { complianceService } from '@main/services/compliance-service'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMandatoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mi-1',
    content: '必须提供资质证书',
    sourceText: '...',
    sourcePages: [1],
    confidence: 0.9,
    status: 'confirmed',
    linkedRequirementId: 'req-1',
    detectedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    projectId: 'proj-1',
    requirementId: 'req-1',
    sectionId: 'sec-1',
    sectionTitle: '技术方案',
    coverageStatus: 'covered',
    confidence: 0.85,
    matchReason: null,
    source: 'auto',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRequirement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    sequenceNumber: 1,
    description: 'test requirement',
    sourcePages: [1],
    category: 'technical',
    priority: 'high',
    status: 'confirmed',
    ...overrides,
  }
}

describe('ComplianceService @story-7-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByProjectReq.mockResolvedValue([makeRequirement()])
  })

  describe('checkMandatoryCompliance', () => {
    it('returns null when detection not yet executed', async () => {
      mockGetItems.mockResolvedValue(null)

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result).toBeNull()
    })

    it('returns 100% compliance when detection ran but 0 confirmed items', async () => {
      mockGetItems.mockResolvedValue([])
      mockFindByProject.mockResolvedValue([])
      mockFindByProjectReq.mockResolvedValue([])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result).not.toBeNull()
      expect(result!.totalConfirmed).toBe(0)
      expect(result!.complianceRate).toBe(100)
    })

    it('returns 100% when all confirmed items are covered', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
        makeMandatoryItem({ id: 'mi-2', linkedRequirementId: 'req-2', content: '另一项' }),
      ])
      mockFindByProjectReq.mockResolvedValue([
        makeRequirement({ id: 'req-1' }),
        makeRequirement({ id: 'req-2' }),
      ])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'covered' }),
        makeLink({ id: 'link-2', requirementId: 'req-2', coverageStatus: 'covered' }),
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.coveredCount).toBe(2)
      expect(result!.complianceRate).toBe(100)
    })

    it('handles partial coverage correctly', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'partial' }),
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.partialCount).toBe(1)
      expect(result!.coveredCount).toBe(0)
      expect(result!.complianceRate).toBe(0)
    })

    it('handles uncovered items', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.uncoveredCount).toBe(1)
      expect(result!.complianceRate).toBe(0)
    })

    it('marks items as unlinked when linkedRequirementId is null', async () => {
      mockGetItems.mockResolvedValue([makeMandatoryItem({ id: 'mi-1', linkedRequirementId: null })])
      mockFindByProject.mockResolvedValue([])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.unlinkedCount).toBe(1)
      expect(result!.items[0].coverageStatus).toBe('unlinked')
    })

    it('marks items as unlinked when linked requirement no longer exists', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-deleted' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.unlinkedCount).toBe(1)
      expect(result!.items[0].coverageStatus).toBe('unlinked')
    })

    it('mixed scenario: covered + partial + uncovered + unlinked', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1', content: 'item1' }),
        makeMandatoryItem({ id: 'mi-2', linkedRequirementId: 'req-2', content: 'item2' }),
        makeMandatoryItem({ id: 'mi-3', linkedRequirementId: 'req-3', content: 'item3' }),
        makeMandatoryItem({ id: 'mi-4', linkedRequirementId: null, content: 'item4' }),
      ])
      mockFindByProjectReq.mockResolvedValue([
        makeRequirement({ id: 'req-1' }),
        makeRequirement({ id: 'req-2' }),
        makeRequirement({ id: 'req-3' }),
      ])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'covered' }),
        makeLink({ id: 'l2', requirementId: 'req-2', coverageStatus: 'partial' }),
        // req-3 has no links → uncovered
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.totalConfirmed).toBe(4)
      expect(result!.coveredCount).toBe(1)
      expect(result!.partialCount).toBe(1)
      expect(result!.uncoveredCount).toBe(1)
      expect(result!.unlinkedCount).toBe(1)
      expect(result!.complianceRate).toBe(25) // 1/4 * 100
    })

    it('sorts items by severity: unlinked → uncovered → partial → covered', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1', content: 'covered-item' }),
        makeMandatoryItem({ id: 'mi-2', linkedRequirementId: null, content: 'unlinked-item' }),
        makeMandatoryItem({ id: 'mi-3', linkedRequirementId: 'req-3', content: 'uncovered-item' }),
      ])
      mockFindByProjectReq.mockResolvedValue([
        makeRequirement({ id: 'req-1' }),
        makeRequirement({ id: 'req-3' }),
      ])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'covered' }),
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.items[0].coverageStatus).toBe('unlinked')
      expect(result!.items[1].coverageStatus).toBe('uncovered')
      expect(result!.items[2].coverageStatus).toBe('covered')
    })

    it('skips non-confirmed mandatory items', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', status: 'confirmed' }),
        makeMandatoryItem({ id: 'mi-2', status: 'detected', content: 'pending' }),
        makeMandatoryItem({ id: 'mi-3', status: 'dismissed', content: 'dismissed' }),
      ])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'covered' }),
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.totalConfirmed).toBe(1)
    })

    it('treats mixed covered+uncovered links for same requirement as partial', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([
        makeLink({ id: 'l1', requirementId: 'req-1', coverageStatus: 'covered' }),
        makeLink({
          id: 'l2',
          requirementId: 'req-1',
          sectionId: 'sec-2',
          coverageStatus: 'uncovered',
        }),
      ])

      const result = await complianceService.checkMandatoryCompliance('proj-1')
      expect(result!.partialCount).toBe(1)
      expect(result!.coveredCount).toBe(0)
    })
  })

  describe('getMandatoryComplianceForExport', () => {
    it('returns not-ready when detection never executed', async () => {
      mockGetItems.mockResolvedValue(null)

      const gate = await complianceService.getMandatoryComplianceForExport('proj-1')
      expect(gate.status).toBe('not-ready')
      expect(gate.canExport).toBe(false)
    })

    it('returns pass when all items are covered', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([
        makeLink({ requirementId: 'req-1', coverageStatus: 'covered' }),
      ])

      const gate = await complianceService.getMandatoryComplianceForExport('proj-1')
      expect(gate.status).toBe('pass')
      expect(gate.canExport).toBe(true)
    })

    it('returns pass when 0 confirmed items', async () => {
      mockGetItems.mockResolvedValue([])
      mockFindByProject.mockResolvedValue([])
      mockFindByProjectReq.mockResolvedValue([])

      const gate = await complianceService.getMandatoryComplianceForExport('proj-1')
      expect(gate.status).toBe('pass')
    })

    it('returns blocked when uncovered items exist', async () => {
      mockGetItems.mockResolvedValue([
        makeMandatoryItem({ id: 'mi-1', linkedRequirementId: 'req-1' }),
      ])
      mockFindByProjectReq.mockResolvedValue([makeRequirement({ id: 'req-1' })])
      mockFindByProject.mockResolvedValue([])

      const gate = await complianceService.getMandatoryComplianceForExport('proj-1')
      expect(gate.status).toBe('blocked')
      expect(gate.canExport).toBe(false)
      expect(gate.blockingItems).toHaveLength(1)
      expect(gate.message).toContain('必做项合规检查未通过')
    })

    it('returns blocked when unlinked items exist', async () => {
      mockGetItems.mockResolvedValue([makeMandatoryItem({ id: 'mi-1', linkedRequirementId: null })])
      mockFindByProject.mockResolvedValue([])

      const gate = await complianceService.getMandatoryComplianceForExport('proj-1')
      expect(gate.status).toBe('blocked')
      expect(gate.blockingItems[0].coverageStatus).toBe('unlinked')
    })
  })
})
