import { createLogger } from '@main/utils/logger'
import { TraceabilityLinkRepository } from '@main/db/repositories/traceability-link-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { mandatoryItemDetector } from '@main/services/document-parser'
import type {
  MandatoryComplianceItem,
  MandatoryComplianceResult,
  MandatoryComplianceStatus,
  ExportComplianceGate,
  CoverageStatus,
} from '@shared/analysis-types'

const logger = createLogger('compliance-service')

const SEVERITY_ORDER: Record<MandatoryComplianceStatus, number> = {
  unlinked: 0,
  uncovered: 1,
  partial: 2,
  covered: 3,
}

class ComplianceService {
  private linkRepo = new TraceabilityLinkRepository()
  private requirementRepo = new RequirementRepository()

  async checkMandatoryCompliance(projectId: string): Promise<MandatoryComplianceResult | null> {
    // Distinguish "never executed" vs "executed but 0 items" via detector
    const items = await mandatoryItemDetector.getItems(projectId)
    if (items === null) {
      logger.debug(`Mandatory item detection not yet executed for project ${projectId}`)
      return null
    }

    // Only count confirmed mandatory items
    const confirmedItems = items.filter((item) => item.status === 'confirmed')

    if (confirmedItems.length === 0) {
      return {
        items: [],
        totalConfirmed: 0,
        coveredCount: 0,
        partialCount: 0,
        uncoveredCount: 0,
        unlinkedCount: 0,
        complianceRate: 100,
      }
    }

    // Load all traceability links for the project
    const allLinks = await this.linkRepo.findByProject(projectId)

    // Load all existing requirement IDs to validate linked requirements
    const existingRequirements = await this.requirementRepo.findByProject(projectId)
    const existingRequirementIds = new Set(existingRequirements.map((r) => r.id))

    // Build coverage status for each confirmed mandatory item
    const complianceItems: MandatoryComplianceItem[] = confirmedItems.map((item) => {
      // Unlinked: no linkedRequirementId or requirement no longer exists
      if (
        item.linkedRequirementId === null ||
        !existingRequirementIds.has(item.linkedRequirementId)
      ) {
        return {
          mandatoryItemId: item.id,
          content: item.content,
          linkedRequirementId: item.linkedRequirementId,
          coverageStatus: 'unlinked' as const,
        }
      }

      // Find all links for this requirement
      const reqLinks = allLinks.filter((link) => link.requirementId === item.linkedRequirementId)

      const coverageStatus = this.computeRequirementCoverage(reqLinks.map((l) => l.coverageStatus))

      return {
        mandatoryItemId: item.id,
        content: item.content,
        linkedRequirementId: item.linkedRequirementId,
        coverageStatus,
      }
    })

    // Sort by severity: unlinked → uncovered → partial → covered
    complianceItems.sort(
      (a, b) => SEVERITY_ORDER[a.coverageStatus] - SEVERITY_ORDER[b.coverageStatus]
    )

    const coveredCount = complianceItems.filter((i) => i.coverageStatus === 'covered').length
    const partialCount = complianceItems.filter((i) => i.coverageStatus === 'partial').length
    const uncoveredCount = complianceItems.filter((i) => i.coverageStatus === 'uncovered').length
    const unlinkedCount = complianceItems.filter((i) => i.coverageStatus === 'unlinked').length
    const totalConfirmed = complianceItems.length
    const complianceRate = Math.round((coveredCount / totalConfirmed) * 100)

    logger.debug(
      `Compliance check for project ${projectId}: ${coveredCount}/${totalConfirmed} covered (${complianceRate}%)`
    )

    return {
      items: complianceItems,
      totalConfirmed,
      coveredCount,
      partialCount,
      uncoveredCount,
      unlinkedCount,
      complianceRate,
    }
  }

  async getMandatoryComplianceForExport(projectId: string): Promise<ExportComplianceGate> {
    const result = await this.checkMandatoryCompliance(projectId)

    // Detection never executed
    if (result === null) {
      return {
        status: 'not-ready',
        canExport: false,
        blockingItems: [],
        complianceRate: 0,
        message: '尚未完成必做项检测，请先返回分析阶段执行检测。',
      }
    }

    // All confirmed items covered, or detection ran but 0 confirmed items
    if (
      result.totalConfirmed === 0 ||
      (result.partialCount === 0 && result.uncoveredCount === 0 && result.unlinkedCount === 0)
    ) {
      return {
        status: 'pass',
        canExport: true,
        blockingItems: [],
        complianceRate: result.complianceRate,
      }
    }

    // Has blocking items
    const blockingItems = result.items.filter(
      (item) =>
        item.coverageStatus === 'partial' ||
        item.coverageStatus === 'uncovered' ||
        item.coverageStatus === 'unlinked'
    )

    return {
      status: 'blocked',
      canExport: false,
      blockingItems,
      complianceRate: result.complianceRate,
      message: `必做项合规检查未通过：${blockingItems.length} 个必做项尚未完全覆盖（合规率 ${result.complianceRate}%）。确认导出可能导致交付文件遗漏关键要求。`,
    }
  }

  /**
   * Compute coverage status for a single requirement based on its links.
   * Matches the semantics of TraceabilityMatrixService.computeStats():
   * - No links → uncovered
   * - Only covered → covered
   * - Only partial → partial
   * - Only uncovered → uncovered
   * - Mixed covered+uncovered, or any partial → partial
   */
  private computeRequirementCoverage(linkStatuses: CoverageStatus[]): CoverageStatus {
    if (linkStatuses.length === 0) return 'uncovered'

    const hasCovered = linkStatuses.includes('covered')
    const hasPartial = linkStatuses.includes('partial')
    const hasUncovered = linkStatuses.includes('uncovered')

    if (hasPartial) return 'partial'
    if (hasCovered && hasUncovered) return 'partial'
    if (hasCovered) return 'covered'
    return 'uncovered'
  }
}

export const complianceService = new ComplianceService()
