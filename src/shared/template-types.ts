import type { ChapterHeadingLocator } from './chapter-types'

/** 模板章节定义 */
export interface TemplateSection {
  id: string // 如 "s1", "s1.1"
  title: string // 章节标题
  level: 1 | 2 | 3 | 4 // 标题层级
  guidanceText?: string // 章节引导提示（写入 proposal.md 作为占位）
  children: TemplateSection[]
}

/** 模板摘要（列表展示用） */
export interface TemplateSummary {
  id: string
  name: string
  description: string
  sectionCount: number // 一级章节数
  source: 'built-in' | 'company'
}

/** 模板完整定义 */
export interface ProposalTemplate {
  id: string
  name: string
  description: string
  version: string
  sections: TemplateSection[]
  source: 'built-in' | 'company'
}

/** 骨架章节（模板 + 评分权重合并后） */
export interface SkeletonSection {
  id: string
  title: string
  level: 1 | 2 | 3 | 4
  guidanceText?: string
  weightPercent?: number // 0-100 展示百分比
  isKeyFocus: boolean // weightPercent >= 15
  scoringCriterionId?: string
  scoringCriterionName?: string
  scoringSubItemId?: string
  scoringSubItemName?: string
  children: SkeletonSection[]
}

/** 持久化到 proposal.meta.json 的权重映射 */
export interface SectionWeightEntry {
  sectionId: string // 稳定骨架节点 ID
  sectionTitle: string
  weightPercent: number
  isKeyFocus: boolean
  scoringCriterionId?: string
  scoringCriterionName?: string
  scoringSubItemId?: string
  scoringSubItemName?: string
}

/** 追溯矩阵章节索引条目 (Story 2.8) */
export interface ProposalSectionIndexEntry {
  sectionId: string
  title: string
  level: 1 | 2 | 3 | 4
  parentSectionId?: string
  order: number
  occurrenceIndex: number
  headingLocator: ChapterHeadingLocator
  weightPercent?: number
  isKeyFocus?: boolean
}

// --- IPC 输入/输出类型 ---

export interface GenerateSkeletonInput {
  projectId: string
  templateId: string
  overwriteExisting?: boolean
}

export interface GenerateSkeletonOutput {
  skeleton: SkeletonSection[]
  markdown: string
  sectionWeights: SectionWeightEntry[]
  sectionCount: number
  lastSavedAt: string
}

export interface PersistSkeletonInput {
  projectId: string
  templateId: string
  skeleton: SkeletonSection[]
}

export interface PersistSkeletonOutput {
  markdown: string
  sectionWeights: SectionWeightEntry[]
  sectionCount: number
  lastSavedAt: string
}
