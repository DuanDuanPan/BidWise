import type { ProjectTable } from '@main/db/schema'
import type { ProjectWithPriority } from '@shared/ipc-types'

type SopStageKey =
  | 'not-started'
  | 'requirements-analysis'
  | 'solution-design'
  | 'proposal-writing'
  | 'cost-estimation'
  | 'compliance-review'
  | 'delivery'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const SOP_STAGE_WEIGHTS: Record<SopStageKey, number> = {
  'not-started': 0,
  'requirements-analysis': 20,
  'solution-design': 40,
  'proposal-writing': 60,
  'cost-estimation': 70,
  'compliance-review': 80,
  delivery: 100,
}

const NEXT_ACTION_MAP: Record<SopStageKey, string> = {
  'not-started': '开始需求分析',
  'requirements-analysis': '完成招标文件解析',
  'solution-design': '生成方案骨架',
  'proposal-writing': '撰写方案内容',
  'cost-estimation': '完成成本评估',
  'compliance-review': '执行合规审查',
  delivery: '导出交付物',
}

function deadlineUrgency(deadline: string | null): number {
  if (!deadline) return 0
  const deadlineMs = new Date(deadline).getTime()
  if (Number.isNaN(deadlineMs)) return 0
  const daysLeft = Math.floor((deadlineMs - Date.now()) / MS_PER_DAY)
  if (daysLeft <= 0) return 100
  return Math.max(0, 100 - daysLeft * 5)
}

export function calculatePriorityScore(project: ProjectTable): number {
  const urgency = deadlineUrgency(project.deadline)
  const stageWeight = SOP_STAGE_WEIGHTS[project.sopStage as SopStageKey] ?? 0
  return urgency * 0.6 + stageWeight * 0.4
}

export function getNextAction(project: ProjectTable): string {
  return NEXT_ACTION_MAP[project.sopStage as SopStageKey] ?? '开始需求分析'
}

export function sortProjectsByPriority(projects: ProjectTable[]): ProjectWithPriority[] {
  return projects
    .filter((project) => project.status === 'active')
    .map((project) => ({
      id: project.id,
      name: project.name,
      customerName: project.customerName,
      industry: project.industry,
      deadline: project.deadline,
      sopStage: project.sopStage,
      status: project.status,
      updatedAt: project.updatedAt,
      priorityScore: calculatePriorityScore(project),
      nextAction: getNextAction(project),
    }))
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        a.id.localeCompare(b.id)
    )
}
