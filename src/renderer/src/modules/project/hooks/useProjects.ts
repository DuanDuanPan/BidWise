import { useEffect, useMemo } from 'react'
import { useProjectStore } from '@renderer/stores'
import type { ProjectListItem } from '@shared/ipc-types'
import type { QuickFilter, SortMode } from '@renderer/stores/projectStore'
import type { SopStageKey } from '../types'

const SOP_STAGE_WEIGHT: Record<string, number> = {
  'compliance-review': 6,
  'cost-estimation': 5,
  'proposal-writing': 4,
  'solution-design': 3,
  'requirements-analysis': 2,
  'not-started': 1,
  delivery: 0,
}

function isThisWeek(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)
  return d >= startOfWeek && d < endOfWeek
}

function isDeadlineWarning(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const threeDaysLater = new Date(now)
  threeDaysLater.setDate(now.getDate() + 3)
  return d <= threeDaysLater && d >= now
}

function applyQuickFilter(
  projects: ProjectListItem[],
  quick: QuickFilter,
  statusFilter: string | null
): ProjectListItem[] {
  switch (quick) {
    case 'active':
      return projects.filter((p) => p.status === 'active')
    case 'due-this-week':
      return projects.filter((p) => isThisWeek(p.deadline))
    case 'has-warning':
      return projects.filter((p) => isDeadlineWarning(p.deadline))
    default:
      // 'all' excludes archived by default, but explicit archived status filter must be able to see them.
      return statusFilter === 'archived'
        ? projects
        : projects.filter((p) => p.status !== 'archived')
  }
}

function getDeadlineBeforeCutoff(dateStr: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  }

  const cutoffDate = new Date(dateStr)
  if (Number.isNaN(cutoffDate.getTime())) return null

  cutoffDate.setHours(23, 59, 59, 999)
  return cutoffDate.getTime()
}

function sortProjects(projects: ProjectListItem[], mode: SortMode): ProjectListItem[] {
  const sorted = [...projects]
  if (mode === 'updated') {
    return sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }
  // smart sort: deadline urgency + SOP stage weight
  return sorted.sort((a, b) => {
    // Projects with deadline come first
    const aDl = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const bDl = b.deadline ? new Date(b.deadline).getTime() : Infinity
    if (aDl !== bDl) return aDl - bDl
    // Same deadline → higher SOP stage first
    const aWeight = SOP_STAGE_WEIGHT[a.sopStage as SopStageKey] ?? 0
    const bWeight = SOP_STAGE_WEIGHT[b.sopStage as SopStageKey] ?? 0
    return bWeight - aWeight
  })
}

export function useProjects(): {
  projects: ProjectListItem[]
  allProjects: ProjectListItem[]
  loading: boolean
  error: string | null
} {
  const projects = useProjectStore((s) => s.projects)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const filter = useProjectStore((s) => s.filter)
  const sortMode = useProjectStore((s) => s.sortMode)
  const loadProjects = useProjectStore((s) => s.loadProjects)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const filteredProjects = useMemo(() => {
    let result = applyQuickFilter(projects, filter.quick, filter.status)

    if (filter.customer) {
      result = result.filter(
        (p) => p.customerName && p.customerName.includes(filter.customer as string)
      )
    }
    if (filter.industry) {
      result = result.filter((p) => p.industry && p.industry === filter.industry)
    }
    if (filter.status) {
      result = result.filter((p) => p.status === filter.status)
    }
    if (filter.deadlineBefore) {
      // DatePicker emits YYYY-MM-DD; parse it as a local calendar date to avoid UTC date-only shifts.
      const cutoff = getDeadlineBeforeCutoff(filter.deadlineBefore)
      if (cutoff !== null) {
        result = result.filter((p) => {
          if (!p.deadline) return false
          const deadline = new Date(p.deadline).getTime()
          return !Number.isNaN(deadline) && deadline <= cutoff
        })
      }
    }

    return sortProjects(result, sortMode)
  }, [projects, filter, sortMode])

  return { projects: filteredProjects, allProjects: projects, loading, error }
}
