import type { ComponentType } from 'react'
import type { IconProps } from '@renderer/shared/components/icons'
import { SopAnalysisIcon } from '@renderer/shared/components/icons'
import { SopDesignIcon } from '@renderer/shared/components/icons'
import { SopWritingIcon } from '@renderer/shared/components/icons'
import { SopCostIcon } from '@renderer/shared/components/icons'
import { SopReviewIcon } from '@renderer/shared/components/icons'
import { SopDeliveryIcon } from '@renderer/shared/components/icons'

export type SopStageKey =
  | 'not-started'
  | 'requirements-analysis'
  | 'solution-design'
  | 'proposal-writing'
  | 'cost-estimation'
  | 'compliance-review'
  | 'delivery'

/** SOP 阶段运行时状态（由 sopStage 字段派生） */
export type SopStageStatus = 'not-started' | 'in-progress' | 'completed' | 'warning'

export const SOP_STAGE_CONFIG: Record<SopStageKey, { label: string; color: string }> = {
  'not-started': { label: '未启动', color: 'var(--color-sop-idle)' },
  'requirements-analysis': { label: '阶段1：需求分析', color: 'var(--color-sop-active)' },
  'solution-design': { label: '阶段2：方案设计', color: 'var(--color-sop-active)' },
  'proposal-writing': { label: '阶段3：标书撰写', color: 'var(--color-sop-active)' },
  'cost-estimation': { label: '阶段4：成本估算', color: 'var(--color-sop-active)' },
  'compliance-review': { label: '阶段5：合规审查', color: 'var(--color-sop-warning)' },
  delivery: { label: '阶段6：交付', color: 'var(--color-sop-done)' },
}

/** 6 个 SOP 阶段有序常量（不含 'not-started'） */
export interface SopStageDefinition {
  key: Exclude<SopStageKey, 'not-started'>
  label: string
  shortLabel: string
  stageNumber: number
  altKey: number | null
  icon: ComponentType<IconProps>
  description: string
  ctaLabel: string
}

export const SOP_STAGES: readonly SopStageDefinition[] = [
  {
    key: 'requirements-analysis',
    label: '需求分析',
    shortLabel: '需求',
    stageNumber: 1,
    altKey: null,
    icon: SopAnalysisIcon,
    description: '本阶段目标：理解甲方要什么。请上传招标文件和客户沟通素材。',
    ctaLabel: '上传招标文件',
  },
  {
    key: 'solution-design',
    label: '方案设计',
    shortLabel: '设计',
    stageNumber: 2,
    altKey: 2,
    icon: SopDesignIcon,
    description: '本阶段目标：确定方案骨架。选择模板并生成方案大纲。',
    ctaLabel: '选择方案模板',
  },
  {
    key: 'proposal-writing',
    label: '方案撰写',
    shortLabel: '撰写',
    stageNumber: 3,
    altKey: 3,
    icon: SopWritingIcon,
    description: '本阶段目标：完成方案正文。AI 辅助生成内容，逐章编辑打磨。',
    ctaLabel: '开始撰写方案',
  },
  {
    key: 'cost-estimation',
    label: '成本评估',
    shortLabel: '成本',
    stageNumber: 4,
    altKey: 4,
    icon: SopCostIcon,
    description: '本阶段目标：识别 GAP 并估算成本。对比方案需求与产品基线。',
    ctaLabel: '启动 GAP 分析',
  },
  {
    key: 'compliance-review',
    label: '评审打磨',
    shortLabel: '评审',
    stageNumber: 5,
    altKey: 5,
    icon: SopReviewIcon,
    description: '本阶段目标：多维对抗评审，发现方案薄弱点。',
    ctaLabel: '启动对抗评审',
  },
  {
    key: 'delivery',
    label: '交付归档',
    shortLabel: '交付',
    stageNumber: 6,
    altKey: 6,
    icon: SopDeliveryIcon,
    description: '本阶段目标：合规校验后一键导出 docx。',
    ctaLabel: '检查合规状态',
  },
] as const

/** SOP 阶段 key 在有序数组中的索引（用于派生前序/后续状态） */
export function getSopStageIndex(key: SopStageKey): number {
  if (key === 'not-started') return -1
  return SOP_STAGES.findIndex((s) => s.key === key)
}

/** 根据当前活跃阶段派生每个阶段的状态 */
export function deriveSopStageStatuses(
  currentStageKey: Exclude<SopStageKey, 'not-started'>
): Record<Exclude<SopStageKey, 'not-started'>, SopStageStatus> {
  const currentIdx = SOP_STAGES.findIndex((s) => s.key === currentStageKey)
  const result = {} as Record<Exclude<SopStageKey, 'not-started'>, SopStageStatus>
  for (let i = 0; i < SOP_STAGES.length; i++) {
    const stage = SOP_STAGES[i]
    if (i < currentIdx) {
      result[stage.key] = 'completed'
    } else if (i === currentIdx) {
      result[stage.key] = 'in-progress'
    } else {
      result[stage.key] = 'not-started'
    }
  }
  return result
}

export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  'presale-technical': '售前技术方案',
}

export const INDUSTRY_OPTIONS = [
  '军工',
  '医疗',
  '能源',
  '金融',
  '教育',
  '交通',
  '制造',
  '通信',
  '政务',
  '其他',
] as const
