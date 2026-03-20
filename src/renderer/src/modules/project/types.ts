export type SopStageKey =
  | 'not-started'
  | 'requirements-analysis'
  | 'solution-design'
  | 'proposal-writing'
  | 'cost-estimation'
  | 'compliance-review'
  | 'delivery'

export const SOP_STAGE_CONFIG: Record<SopStageKey, { label: string; color: string }> = {
  'not-started': { label: '未启动', color: 'var(--color-sop-idle)' },
  'requirements-analysis': { label: '阶段1：需求分析', color: 'var(--color-sop-active)' },
  'solution-design': { label: '阶段2：方案设计', color: 'var(--color-sop-active)' },
  'proposal-writing': { label: '阶段3：标书撰写', color: 'var(--color-sop-active)' },
  'cost-estimation': { label: '阶段4：成本估算', color: 'var(--color-sop-active)' },
  'compliance-review': { label: '阶段5：合规审查', color: 'var(--color-sop-warning)' },
  delivery: { label: '阶段6：交付', color: 'var(--color-sop-done)' },
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
