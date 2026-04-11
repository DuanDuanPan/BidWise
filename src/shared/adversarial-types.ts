/**
 * Adversarial role generation shared types — consumed by adversarial-lineup-service,
 * review-handlers, reviewStore, and UI components (Story 7.2)
 */

// ─── Enums & Primitives ───

export type AdversarialIntensity = 'low' | 'medium' | 'high'

export type AdversarialGenerationSource = 'llm' | 'fallback'

export type AdversarialLineupStatus = 'generated' | 'confirmed'

// ─── LLM Output Draft ───

/** Raw role draft from LLM output — isComplianceRole is advisory only, must be re-normalized */
export interface GeneratedAdversarialRoleDraft {
  name: string
  perspective: string
  attackFocus: string[]
  intensity: AdversarialIntensity
  description: string
  isComplianceRole?: boolean
}

// ─── Domain Models ───

export interface AdversarialRole {
  id: string
  name: string
  perspective: string
  attackFocus: string[]
  intensity: AdversarialIntensity
  isProtected: boolean
  description: string
  sortOrder: number
}

export interface AdversarialLineup {
  id: string
  projectId: string
  roles: AdversarialRole[]
  status: AdversarialLineupStatus
  generationSource: AdversarialGenerationSource
  warningMessage: string | null
  generatedAt: string
  confirmedAt: string | null
}

// ─── IPC Input/Output ───

export interface GenerateRolesInput {
  projectId: string
}

export interface GenerateRolesTaskResult {
  taskId: string
}

export interface GetLineupInput {
  projectId: string
}

export interface UpdateLineupInput {
  lineupId: string
  roles: AdversarialRole[]
}

export interface ConfirmLineupInput {
  lineupId: string
}

// ─── Constants ───

export const INTENSITY_LABELS: Record<AdversarialIntensity, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

export const DEFAULT_COMPLIANCE_ROLE: Omit<AdversarialRole, 'id'> = {
  name: '合规审查官',
  perspective: '从招标文件合规性角度出发，逐项核查投标方案是否满足所有强制性要求',
  attackFocus: ['资质证明完整性', '必响应条款遗漏', '格式与签章合规', '偏离表准确性'],
  intensity: 'high',
  isProtected: true,
  description: '合规审查是投标的生死线。本角色确保方案不因形式缺陷或遗漏被废标。',
  sortOrder: 0,
}

export const DEFAULT_FALLBACK_ROLES: Omit<AdversarialRole, 'id'>[] = [
  DEFAULT_COMPLIANCE_ROLE,
  {
    name: '评标专家',
    perspective: '从评标委员会的打分视角出发，评估方案在各评分维度的得分竞争力',
    attackFocus: ['技术方案深度不足', '评分点覆盖遗漏', '量化指标缺乏支撑', '差异化优势不明显'],
    intensity: 'medium',
    isProtected: false,
    description: '模拟评标委员会的严格视角，帮助发现可能失分的薄弱环节。',
    sortOrder: 1,
  },
  {
    name: '竞对分析官',
    perspective: '从竞争对手的优势角度出发，寻找投标方案相对于竞品的短板',
    attackFocus: ['行业案例不足', '价格竞争力', '团队资质对比', '技术路线差异'],
    intensity: 'medium',
    isProtected: false,
    description: '站在竞争对手的角度审视方案，提前补强可能被比下去的领域。',
    sortOrder: 2,
  },
]
