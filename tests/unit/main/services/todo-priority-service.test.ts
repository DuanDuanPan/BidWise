import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculatePriorityScore,
  getNextAction,
  sortProjectsByPriority,
} from '@main/services/todo-priority-service'
import type { ProjectTable } from '@main/db/schema'

function makeProject(overrides: Partial<ProjectTable> = {}): ProjectTable {
  return {
    id: 'p1',
    name: '测试项目',
    customerName: '客户A',
    deadline: null,
    proposalType: 'presale-technical',
    sopStage: 'not-started',
    status: 'active',
    industry: '军工',
    rootPath: '/tmp/test',
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('@story-1-8 todo-priority-service', () => {
  beforeEach(() => {
    // Fix Date.now for deterministic tests
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-21T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calculatePriorityScore', () => {
    it('returns 0 for no deadline and not-started stage', () => {
      const project = makeProject({ deadline: null, sopStage: 'not-started' })
      expect(calculatePriorityScore(project)).toBe(0)
    })

    it('returns max urgency for expired deadline', () => {
      const project = makeProject({
        deadline: '2026-03-20T00:00:00.000Z',
        sopStage: 'not-started',
      })
      // urgency = 100, stageWeight = 0 → 100 * 0.6 + 0 * 0.4 = 60
      expect(calculatePriorityScore(project)).toBe(60)
    })

    it('returns correct score for deadline 1 day away', () => {
      const project = makeProject({
        deadline: '2026-03-22T12:00:00.000Z',
        sopStage: 'delivery',
      })
      // daysLeft = 1, urgency = max(0, 100 - 1*5) = 95
      // stageWeight = 100
      // score = 95 * 0.6 + 100 * 0.4 = 57 + 40 = 97
      expect(calculatePriorityScore(project)).toBe(97)
    })

    it('returns correct score for deadline 3 days away with compliance-review', () => {
      const project = makeProject({
        deadline: '2026-03-24T12:00:00.000Z',
        sopStage: 'compliance-review',
      })
      // daysLeft = 3, urgency = max(0, 100 - 3*5) = 85
      // stageWeight = 80
      // score = 85 * 0.6 + 80 * 0.4 = 51 + 32 = 83
      expect(calculatePriorityScore(project)).toBe(83)
    })

    it('returns only stage weight when no deadline', () => {
      const project = makeProject({
        deadline: null,
        sopStage: 'requirements-analysis',
      })
      // urgency = 0, stageWeight = 20
      // score = 0 * 0.6 + 20 * 0.4 = 8
      expect(calculatePriorityScore(project)).toBe(8)
    })

    it('returns 0 urgency for deadline far in the future (>20 days)', () => {
      const project = makeProject({
        deadline: '2026-04-20T00:00:00.000Z',
        sopStage: 'not-started',
      })
      // daysLeft = 29, urgency = max(0, 100 - 29*5) = max(0, -45) = 0
      expect(calculatePriorityScore(project)).toBe(0)
    })

    it('handles invalid deadline gracefully', () => {
      const project = makeProject({ deadline: 'invalid-date', sopStage: 'not-started' })
      expect(calculatePriorityScore(project)).toBe(0)
    })

    it('no-deadline score is always lower than with-deadline score (same stage)', () => {
      const withDeadline = makeProject({
        deadline: '2026-03-25T00:00:00.000Z',
        sopStage: 'proposal-writing',
      })
      const noDeadline = makeProject({
        deadline: null,
        sopStage: 'proposal-writing',
      })
      expect(calculatePriorityScore(withDeadline)).toBeGreaterThan(
        calculatePriorityScore(noDeadline)
      )
    })

    it('same deadline, later SOP stage scores higher', () => {
      const earlier = makeProject({
        deadline: '2026-03-25T00:00:00.000Z',
        sopStage: 'requirements-analysis',
      })
      const later = makeProject({
        deadline: '2026-03-25T00:00:00.000Z',
        sopStage: 'compliance-review',
      })
      expect(calculatePriorityScore(later)).toBeGreaterThan(calculatePriorityScore(earlier))
    })
  })

  describe('getNextAction', () => {
    it.each([
      ['not-started', '开始需求分析'],
      ['requirements-analysis', '完成招标文件解析'],
      ['solution-design', '生成方案骨架'],
      ['proposal-writing', '撰写方案内容'],
      ['cost-estimation', '完成成本评估'],
      ['compliance-review', '执行合规审查'],
      ['delivery', '导出交付物'],
    ])('returns correct action for %s', (stage, expected) => {
      const project = makeProject({ sopStage: stage })
      expect(getNextAction(project)).toBe(expected)
    })

    it('returns default action for unknown stage', () => {
      const project = makeProject({ sopStage: 'unknown-stage' })
      expect(getNextAction(project)).toBe('开始需求分析')
    })
  })

  describe('sortProjectsByPriority', () => {
    it('filters out non-active projects', () => {
      const projects = [
        makeProject({ id: 'p1', status: 'active' }),
        makeProject({ id: 'p2', status: 'archived' }),
        makeProject({ id: 'p3', status: 'active' }),
      ]
      const sorted = sortProjectsByPriority(projects)
      expect(sorted).toHaveLength(2)
      expect(sorted.map((p) => p.id)).toEqual(['p1', 'p3'])
    })

    it('sorts by priorityScore descending', () => {
      const projects = [
        makeProject({
          id: 'C',
          deadline: null,
          sopStage: 'requirements-analysis',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
        makeProject({
          id: 'A',
          deadline: '2026-03-22T12:00:00.000Z',
          sopStage: 'delivery',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
        makeProject({
          id: 'B',
          deadline: '2026-03-24T12:00:00.000Z',
          sopStage: 'compliance-review',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
      ]
      const sorted = sortProjectsByPriority(projects)
      expect(sorted[0].id).toBe('A') // score 97
      expect(sorted[1].id).toBe('B') // score 83
      expect(sorted[2].id).toBe('C') // score 8
    })

    it('uses updatedAt DESC as tiebreaker for same score', () => {
      const projects = [
        makeProject({
          id: 'p1',
          deadline: null,
          sopStage: 'not-started',
          updatedAt: '2026-03-19T00:00:00.000Z',
        }),
        makeProject({
          id: 'p2',
          deadline: null,
          sopStage: 'not-started',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
      ]
      const sorted = sortProjectsByPriority(projects)
      expect(sorted[0].id).toBe('p2') // more recently updated
      expect(sorted[1].id).toBe('p1')
    })

    it('uses id ASC as final tiebreaker', () => {
      const projects = [
        makeProject({
          id: 'b',
          deadline: null,
          sopStage: 'not-started',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
        makeProject({
          id: 'a',
          deadline: null,
          sopStage: 'not-started',
          updatedAt: '2026-03-20T00:00:00.000Z',
        }),
      ]
      const sorted = sortProjectsByPriority(projects)
      expect(sorted[0].id).toBe('a')
      expect(sorted[1].id).toBe('b')
    })

    it('includes priorityScore and nextAction in output', () => {
      const projects = [makeProject({ sopStage: 'delivery' })]
      const sorted = sortProjectsByPriority(projects)
      expect(sorted[0]).toHaveProperty('priorityScore')
      expect(sorted[0]).toHaveProperty('nextAction', '导出交付物')
    })

    it('returns deterministic order for same input', () => {
      const projects = [
        makeProject({ id: 'p1', deadline: '2026-03-25T00:00:00.000Z', sopStage: 'delivery' }),
        makeProject({
          id: 'p2',
          deadline: '2026-03-23T00:00:00.000Z',
          sopStage: 'requirements-analysis',
        }),
        makeProject({ id: 'p3', deadline: null, sopStage: 'solution-design' }),
      ]
      const first = sortProjectsByPriority(projects)
      const second = sortProjectsByPriority(projects)
      expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id))
    })
  })
})
