import type { AnnotationType, AnnotationStatus } from '@shared/annotation-types'
import { AnnotationAiIcon } from '@renderer/shared/components/icons/AnnotationAiIcon'
import { AnnotationAssetIcon } from '@renderer/shared/components/icons/AnnotationAssetIcon'
import { AnnotationScoreIcon } from '@renderer/shared/components/icons/AnnotationScoreIcon'
import { AnnotationAttackIcon } from '@renderer/shared/components/icons/AnnotationAttackIcon'
import { AnnotationHumanIcon } from '@renderer/shared/components/icons/AnnotationHumanIcon'
import type { IconProps } from '@renderer/shared/components/icons/types'

// ── 五色映射常量（精确 hex 值，UX-DR9） ──

export const ANNOTATION_TYPE_COLORS: Record<AnnotationType, string> = {
  'ai-suggestion': '#1677FF',
  'asset-recommendation': '#52C41A',
  'score-warning': '#FAAD14',
  adversarial: '#FF4D4F',
  human: '#722ED1',
  'cross-role': '#722ED1', // 与 human 共享紫色
}

// ── 类型标签（中文） ──

export const ANNOTATION_TYPE_LABELS: Record<AnnotationType, string> = {
  'ai-suggestion': 'AI 建议',
  'asset-recommendation': '资产推荐',
  'score-warning': '评分预警',
  adversarial: '对抗攻击',
  human: '人工批注',
  'cross-role': '跨角色',
}

// ── 类型图标映射 ──

export const ANNOTATION_TYPE_ICONS: Record<
  AnnotationType,
  (props: IconProps) => React.JSX.Element
> = {
  'ai-suggestion': AnnotationAiIcon,
  'asset-recommendation': AnnotationAssetIcon,
  'score-warning': AnnotationScoreIcon,
  adversarial: AnnotationAttackIcon,
  human: AnnotationHumanIcon,
  'cross-role': AnnotationHumanIcon, // 复用 human 图标
}

// ── 操作按钮配置（AC #2, #3） ──

export interface AnnotationAction {
  key: string
  label: string
  targetStatus?: AnnotationStatus
  primary?: boolean
}

export const ANNOTATION_TYPE_ACTIONS: Record<AnnotationType, AnnotationAction[]> = {
  'ai-suggestion': [
    { key: 'accept', label: '采纳', targetStatus: 'accepted', primary: true },
    { key: 'reject', label: '驳回', targetStatus: 'rejected' },
    { key: 'edit', label: '修改' },
  ],
  'asset-recommendation': [
    { key: 'insert', label: '插入', targetStatus: 'accepted', primary: true },
    { key: 'ignore', label: '忽略', targetStatus: 'rejected' },
    { key: 'view', label: '查看' },
  ],
  'score-warning': [
    { key: 'handle', label: '处理', targetStatus: 'accepted', primary: true },
    { key: 'defer', label: '标记待决策', targetStatus: 'needs-decision' },
  ],
  adversarial: [
    { key: 'accept-edit', label: '接受并修改', targetStatus: 'accepted', primary: true },
    { key: 'refute', label: '反驳', targetStatus: 'rejected' },
    { key: 'request-guidance', label: '请求指导', targetStatus: 'needs-decision' },
  ],
  human: [
    { key: 'mark-handled', label: '标记已处理', targetStatus: 'accepted', primary: true },
    { key: 'reply', label: '回复' },
  ],
  'cross-role': [
    { key: 'mark-handled', label: '标记已处理', targetStatus: 'accepted', primary: true },
    { key: 'reply', label: '回复' },
  ],
}

// ── 已处理状态标签与颜色（AC #6） ──

export const ANNOTATION_STATUS_LABELS: Record<Exclude<AnnotationStatus, 'pending'>, string> = {
  accepted: '已采纳 ✓',
  rejected: '已驳回 ✗',
  'needs-decision': '待决策 ⏳',
}

export const ANNOTATION_STATUS_COLORS: Record<Exclude<AnnotationStatus, 'pending'>, string> = {
  accepted: '#52C41A',
  rejected: '#FF4D4F',
  'needs-decision': '#FAAD14',
}
