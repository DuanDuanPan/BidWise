/**
 * BatchOrchestrationManager — in-memory saga coordinator for progressive
 * batch chapter generation.  Each sub-chapter runs as an independent
 * task-queue entry with its own 15-minute timeout.  The manager tracks
 * completion and chains the next section automatically.
 */
import { createLogger } from '@main/utils/logger'
import type { SkeletonExpandPlan, SkeletonExpandSection } from '@shared/chapter-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import { randomUUID } from 'crypto'

const logger = createLogger('batch-orchestration-manager')

/** Summary of a previously completed section, injected into the next section's prompt */
export interface CompletedSectionSummary {
  title: string
  markdown: string
}

export type BatchSectionState = 'pending' | 'running' | 'completed' | 'failed'

export interface BatchSectionEntry {
  index: number
  section: SkeletonExpandSection
  state: BatchSectionState
  taskId: string | null
  content?: string
  error?: string
}

export interface BatchOrchestration {
  id: string
  projectId: string
  parentTarget: ChapterHeadingLocator
  skeleton: SkeletonExpandPlan
  sectionId: string
  sections: BatchSectionEntry[]
  /** Shared context fields passed to every sub-chapter task */
  contextBase: Record<string, unknown>
  createdAt: string
}

export interface ChainAdvanceResult {
  /** The next section to generate, or undefined if all done / chain paused on failure */
  nextSection?: {
    index: number
    section: SkeletonExpandSection
    previousSections: CompletedSectionSummary[]
  }
  /** Assembled markdown of all completed sections so far */
  assembledSnapshot: string
  completedCount: number
  totalCount: number
  /** True when all sections are either completed or failed */
  allDone: boolean
  failedSections: Array<{ index: number; title: string; error: string }>
}

const MAX_PREVIOUS_SUMMARY_LENGTH = 300

/**
 * Build previousSections for a given target index.
 * Strategy: the immediately preceding section gets full content;
 * earlier sections get title + first 300 chars.
 */
function buildPreviousSections(
  sections: BatchSectionEntry[],
  targetIndex: number
): CompletedSectionSummary[] {
  const result: CompletedSectionSummary[] = []
  for (let i = 0; i < targetIndex; i++) {
    const entry = sections[i]
    if (entry.state !== 'completed' || !entry.content) continue
    const isImmediatelyBefore = i === targetIndex - 1
    result.push({
      title: entry.section.title,
      markdown: isImmediatelyBefore
        ? entry.content
        : entry.content.length > MAX_PREVIOUS_SUMMARY_LENGTH
          ? entry.content.slice(0, MAX_PREVIOUS_SUMMARY_LENGTH) + '…'
          : entry.content,
    })
  }
  return result
}

function assembleSnapshot(sections: BatchSectionEntry[]): string {
  const parts: string[] = []
  for (const entry of sections) {
    const heading = `${'#'.repeat(entry.section.level)} ${entry.section.title}`
    if (entry.state === 'completed' && entry.content) {
      parts.push(`${heading}\n\n${entry.content}`)
    } else if (entry.state === 'failed') {
      parts.push(`${heading}\n\n> [生成失败] ${entry.error ?? '未知错误'}`)
    } else {
      const placeholderParts = [heading, '']
      if (entry.section.guidanceHint?.trim()) {
        placeholderParts.push(`> ${entry.section.guidanceHint.trim()}`, '')
      }
      placeholderParts.push('> [待生成]')
      parts.push(placeholderParts.join('\n'))
    }
  }
  return parts.join('\n\n')
}

export class BatchOrchestrationManager {
  private orchestrations = new Map<string, BatchOrchestration>()

  create(params: {
    projectId: string
    parentTarget: ChapterHeadingLocator
    skeleton: SkeletonExpandPlan
    sectionId: string
    contextBase: Record<string, unknown>
  }): BatchOrchestration {
    const id = randomUUID()
    const sections: BatchSectionEntry[] = params.skeleton.sections.map((section, index) => ({
      index,
      section,
      state: 'pending',
      taskId: null,
    }))

    const orchestration: BatchOrchestration = {
      id,
      projectId: params.projectId,
      parentTarget: params.parentTarget,
      skeleton: params.skeleton,
      sectionId: params.sectionId,
      sections,
      contextBase: params.contextBase,
      createdAt: new Date().toISOString(),
    }

    this.orchestrations.set(id, orchestration)
    logger.info(
      `BatchOrchestration created: id=${id}, sections=${sections.length}, parent="${params.parentTarget.title}"`
    )
    return orchestration
  }

  get(batchId: string): BatchOrchestration | undefined {
    return this.orchestrations.get(batchId)
  }

  /** Mark a section as running and record its taskId */
  markRunning(batchId: string, sectionIndex: number, taskId: string): void {
    const orch = this.orchestrations.get(batchId)
    if (!orch) return
    const entry = orch.sections[sectionIndex]
    if (entry) {
      entry.state = 'running'
      entry.taskId = taskId
    }
  }

  /** Called when a section task completes successfully. Returns chain advance info. */
  onSectionComplete(batchId: string, sectionIndex: number, content: string): ChainAdvanceResult {
    const orch = this.orchestrations.get(batchId)
    if (!orch) {
      logger.warn(`onSectionComplete: orchestration not found: ${batchId}`)
      return {
        assembledSnapshot: '',
        completedCount: 0,
        totalCount: 0,
        allDone: true,
        failedSections: [],
      }
    }

    const entry = orch.sections[sectionIndex]
    if (entry) {
      entry.state = 'completed'
      entry.content = content
    }

    return this._advanceChain(orch)
  }

  /** Called when a section task fails. Chain pauses. */
  onSectionFailed(batchId: string, sectionIndex: number, error: string): ChainAdvanceResult {
    const orch = this.orchestrations.get(batchId)
    if (!orch) {
      logger.warn(`onSectionFailed: orchestration not found: ${batchId}`)
      return {
        assembledSnapshot: '',
        completedCount: 0,
        totalCount: 0,
        allDone: true,
        failedSections: [],
      }
    }

    const entry = orch.sections[sectionIndex]
    if (entry) {
      entry.state = 'failed'
      entry.error = error
    }

    // Chain pauses on failure — don't advance to next section
    const snapshot = assembleSnapshot(orch.sections)
    const completedCount = orch.sections.filter((s) => s.state === 'completed').length
    const failedSections = orch.sections
      .filter((s) => s.state === 'failed')
      .map((s) => ({ index: s.index, title: s.section.title, error: s.error ?? '' }))
    const allDone = orch.sections.every((s) => s.state === 'completed' || s.state === 'failed')

    return {
      assembledSnapshot: snapshot,
      completedCount,
      totalCount: orch.sections.length,
      allDone,
      failedSections,
    }
  }

  /** Prepare context for retrying a specific failed section */
  prepareRetry(
    batchId: string,
    sectionIndex: number
  ):
    | {
        section: SkeletonExpandSection
        previousSections: CompletedSectionSummary[]
        contextBase: Record<string, unknown>
      }
    | undefined {
    const orch = this.orchestrations.get(batchId)
    if (!orch) return undefined

    const entry = orch.sections[sectionIndex]
    if (!entry) return undefined

    // Reset the section state
    entry.state = 'pending'
    entry.taskId = null
    entry.content = undefined
    entry.error = undefined

    return {
      section: entry.section,
      previousSections: buildPreviousSections(orch.sections, sectionIndex),
      contextBase: orch.contextBase,
    }
  }

  /** Get the first section to generate, with its context */
  getFirstSection(batchId: string):
    | {
        index: number
        section: SkeletonExpandSection
        previousSections: CompletedSectionSummary[]
      }
    | undefined {
    const orch = this.orchestrations.get(batchId)
    if (!orch || orch.sections.length === 0) return undefined
    return {
      index: 0,
      section: orch.sections[0].section,
      previousSections: [],
    }
  }

  delete(batchId: string): void {
    this.orchestrations.delete(batchId)
    logger.info(`BatchOrchestration deleted: ${batchId}`)
  }

  private _advanceChain(orch: BatchOrchestration): ChainAdvanceResult {
    const snapshot = assembleSnapshot(orch.sections)
    const completedCount = orch.sections.filter((s) => s.state === 'completed').length
    const failedSections = orch.sections
      .filter((s) => s.state === 'failed')
      .map((s) => ({ index: s.index, title: s.section.title, error: s.error ?? '' }))

    // Find the next pending section (first one after all completed/running)
    const nextEntry = orch.sections.find((s) => s.state === 'pending')
    const allDone = !nextEntry && orch.sections.every((s) => s.state !== 'running')

    if (!nextEntry) {
      return {
        assembledSnapshot: snapshot,
        completedCount,
        totalCount: orch.sections.length,
        allDone,
        failedSections,
      }
    }

    return {
      nextSection: {
        index: nextEntry.index,
        section: nextEntry.section,
        previousSections: buildPreviousSections(orch.sections, nextEntry.index),
      },
      assembledSnapshot: snapshot,
      completedCount,
      totalCount: orch.sections.length,
      allDone,
      failedSections,
    }
  }
}

export const batchOrchestrationManager = new BatchOrchestrationManager()
