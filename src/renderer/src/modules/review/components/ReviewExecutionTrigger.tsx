import React, { useMemo } from 'react'
import { Button, Popconfirm } from 'antd'
import type { AdversarialReviewSession, AdversarialLineup } from '@shared/adversarial-types'

interface ReviewExecutionTriggerProps {
  lineup: AdversarialLineup
  reviewSession: AdversarialReviewSession | null
  reviewLoading: boolean
  onStartReview: () => void
  onViewResults: () => void
}

export const ReviewExecutionTrigger: React.FC<ReviewExecutionTriggerProps> = ({
  lineup,
  reviewSession,
  reviewLoading,
  onStartReview,
  onViewResults,
}) => {
  const roleCount = lineup.roles.length
  const sessionStatus = reviewSession?.status

  const buttonConfig = useMemo(() => {
    if (reviewLoading) {
      return {
        text: '评审进行中…',
        loading: true,
        disabled: true,
        onClick: undefined as (() => void) | undefined,
        needsConfirm: false,
      }
    }

    if (sessionStatus === 'completed' || sessionStatus === 'partial') {
      return {
        text: '查看评审结果',
        loading: false,
        disabled: false,
        onClick: onViewResults,
        needsConfirm: false,
      }
    }

    if (sessionStatus === 'failed') {
      return {
        text: '重新启动评审',
        loading: false,
        disabled: false,
        onClick: onStartReview,
        needsConfirm: true,
      }
    }

    // Default: no review yet or idle
    return {
      text: '启动对抗评审',
      loading: false,
      disabled: false,
      onClick: onStartReview,
      needsConfirm: true,
    }
  }, [reviewLoading, sessionStatus, onStartReview, onViewResults])

  if (lineup.status !== 'confirmed') return null

  if (buttonConfig.needsConfirm) {
    return (
      <Popconfirm
        title={`确认对 ${roleCount} 个角色启动方案评审？`}
        description="评审将对方案进行多角色并行攻击，预计需要 3-5 分钟"
        okText="确认启动"
        cancelText="取消"
        onConfirm={buttonConfig.onClick}
      >
        <Button type="primary" loading={buttonConfig.loading} disabled={buttonConfig.disabled}>
          {buttonConfig.text}
        </Button>
      </Popconfirm>
    )
  }

  return (
    <Button
      type="primary"
      loading={buttonConfig.loading}
      disabled={buttonConfig.disabled}
      onClick={buttonConfig.onClick}
    >
      {buttonConfig.text}
    </Button>
  )
}
