import { describe, it, expect, beforeEach } from 'vitest'
import type { SkeletonExpandPlan, ChapterHeadingLocator } from '@shared/chapter-types'
import { BatchOrchestrationManager } from '@main/services/agent-orchestrator/batch-orchestration-manager'

function makeSkeleton(
  sections: Array<{ title: string; level?: number; dimensions?: string[] }>
): SkeletonExpandPlan {
  return {
    parentTitle: '系统设计',
    parentLevel: 2,
    sections: sections.map((s) => ({
      title: s.title,
      level: s.level ?? 3,
      dimensions: s.dimensions ?? ['functional'],
      guidanceHint: undefined,
    })),
    dimensionChecklist: ['functional', 'ui', 'security'],
    confirmedAt: '2026-04-14T00:00:00.000Z',
  }
}

const target: ChapterHeadingLocator = { title: '系统设计', level: 2, occurrenceIndex: 0 }

describe('BatchOrchestrationManager', () => {
  let manager: BatchOrchestrationManager

  beforeEach(() => {
    manager = new BatchOrchestrationManager()
  })

  it('creates an orchestration with all sections pending', () => {
    const skeleton = makeSkeleton([{ title: '功能设计' }, { title: '接口设计' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: { requirements: 'test' },
    })

    expect(orch.id).toBeDefined()
    expect(orch.sections).toHaveLength(2)
    expect(orch.sections[0].state).toBe('pending')
    expect(orch.sections[1].state).toBe('pending')
  })

  it('getFirstSection returns index 0 with empty previousSections', () => {
    const skeleton = makeSkeleton([{ title: '功能设计' }, { title: '接口设计' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    const first = manager.getFirstSection(orch.id)
    expect(first).toBeDefined()
    expect(first!.index).toBe(0)
    expect(first!.previousSections).toEqual([])
  })

  it('markRunning updates section state and taskId', () => {
    const skeleton = makeSkeleton([{ title: '功能设计' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.markRunning(orch.id, 0, 'task-abc')
    const updated = manager.get(orch.id)!
    expect(updated.sections[0].state).toBe('running')
    expect(updated.sections[0].taskId).toBe('task-abc')
  })

  it('onSectionComplete advances to next section with previousSections context', () => {
    const skeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.markRunning(orch.id, 0, 'task-0')
    const advance = manager.onSectionComplete(orch.id, 0, '功能设计内容')

    expect(advance.completedCount).toBe(1)
    expect(advance.totalCount).toBe(3)
    expect(advance.allDone).toBe(false)
    expect(advance.nextSection).toBeDefined()
    expect(advance.nextSection!.index).toBe(1)
    expect(advance.nextSection!.previousSections).toHaveLength(1)
    expect(advance.nextSection!.previousSections[0].title).toBe('功能设计')
    expect(advance.nextSection!.previousSections[0].markdown).toBe('功能设计内容')
  })

  it('onSectionComplete returns allDone when last section completes', () => {
    const skeleton = makeSkeleton([{ title: '功能设计' }, { title: '接口设计' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.markRunning(orch.id, 0, 'task-0')
    manager.onSectionComplete(orch.id, 0, '功能设计内容')

    manager.markRunning(orch.id, 1, 'task-1')
    const advance = manager.onSectionComplete(orch.id, 1, '接口设计内容')

    expect(advance.allDone).toBe(true)
    expect(advance.completedCount).toBe(2)
    expect(advance.nextSection).toBeUndefined()
    expect(advance.assembledSnapshot).toContain('### 功能设计')
    expect(advance.assembledSnapshot).toContain('### 接口设计')
  })

  it('onSectionFailed pauses the chain', () => {
    const skeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.markRunning(orch.id, 0, 'task-0')
    manager.onSectionComplete(orch.id, 0, '功能设计内容')
    manager.markRunning(orch.id, 1, 'task-1')
    const advance = manager.onSectionFailed(orch.id, 1, 'LLM timeout')

    expect(advance.completedCount).toBe(1)
    expect(advance.failedSections).toHaveLength(1)
    expect(advance.failedSections[0].title).toBe('接口设计')
    expect(advance.failedSections[0].error).toBe('LLM timeout')
    // Chain should not advance (no nextSection in return)
    expect(advance.allDone).toBe(false)
  })

  it('previousSections: immediately preceding section gets full content, earlier sections get truncated', () => {
    const skeleton = makeSkeleton([{ title: 'A' }, { title: 'B' }, { title: 'C' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    const longContent = 'x'.repeat(500)
    manager.markRunning(orch.id, 0, 'task-0')
    manager.onSectionComplete(orch.id, 0, longContent)
    manager.markRunning(orch.id, 1, 'task-1')
    const advance = manager.onSectionComplete(orch.id, 1, 'B内容')

    expect(advance.nextSection).toBeDefined()
    const prev = advance.nextSection!.previousSections
    expect(prev).toHaveLength(2)
    // Section A (earlier): truncated to 300 chars + '…'
    expect(prev[0].markdown.length).toBe(301) // 300 + '…'
    expect(prev[0].markdown.endsWith('…')).toBe(true)
    // Section B (immediately before): full content
    expect(prev[1].markdown).toBe('B内容')
  })

  it('prepareRetry resets section state and returns correct context', () => {
    const skeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: { requirements: 'test' },
    })

    manager.markRunning(orch.id, 0, 'task-0')
    manager.onSectionComplete(orch.id, 0, '功能设计内容')
    manager.markRunning(orch.id, 1, 'task-1')
    manager.onSectionFailed(orch.id, 1, 'error')

    const retry = manager.prepareRetry(orch.id, 1)
    expect(retry).toBeDefined()
    expect(retry!.section.title).toBe('接口设计')
    expect(retry!.previousSections).toHaveLength(1)
    expect(retry!.previousSections[0].title).toBe('功能设计')
    expect(retry!.contextBase).toEqual({ requirements: 'test' })

    // Section state should be reset
    const updated = manager.get(orch.id)!
    expect(updated.sections[1].state).toBe('pending')
  })

  it('assembledSnapshot only includes completed sections', () => {
    const skeleton = makeSkeleton([
      { title: '功能设计' },
      { title: '接口设计' },
      { title: '安全设计' },
    ])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.markRunning(orch.id, 0, 'task-0')
    manager.onSectionComplete(orch.id, 0, '功能设计内容')
    manager.markRunning(orch.id, 1, 'task-1')
    manager.onSectionFailed(orch.id, 1, 'error')

    const advance = manager.onSectionFailed(orch.id, 1, 'error')
    expect(advance.assembledSnapshot).toContain('### 功能设计')
    expect(advance.assembledSnapshot).toContain('功能设计内容')
    expect(advance.assembledSnapshot).toContain('### 接口设计')
    expect(advance.assembledSnapshot).toContain('[生成失败]')
    // Section 2 (pending) should not be in snapshot
    expect(advance.assembledSnapshot).not.toContain('安全设计')
  })

  it('delete removes the orchestration', () => {
    const skeleton = makeSkeleton([{ title: '功能设计' }])
    const orch = manager.create({
      projectId: 'p1',
      parentTarget: target,
      skeleton,
      sectionId: 'sec-1',
      contextBase: {},
    })

    manager.delete(orch.id)
    expect(manager.get(orch.id)).toBeUndefined()
  })
})
