import { forwardRef } from 'react'
import { Button, Tag, Tooltip, message } from 'antd'
import { formatRelativeTime } from '@renderer/shared/lib/format-time'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import {
  ANNOTATION_TYPE_COLORS,
  ANNOTATION_TYPE_LABELS,
  ANNOTATION_TYPE_ICONS,
  ANNOTATION_TYPE_ACTIONS,
  ANNOTATION_STATUS_LABELS,
  ANNOTATION_STATUS_COLORS,
} from '@renderer/modules/annotation/constants/annotation-colors'
import type { AnnotationRecord } from '@shared/annotation-types'

interface AnnotationCardProps {
  annotation: AnnotationRecord
  focused?: boolean
}

export const AnnotationCard = forwardRef<HTMLDivElement, AnnotationCardProps>(
  function AnnotationCard({ annotation, focused }, ref) {
    const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation)
    const { type, status, content, author, createdAt, id } = annotation

    const color = ANNOTATION_TYPE_COLORS[type]
    const label = ANNOTATION_TYPE_LABELS[type]
    const IconComponent = ANNOTATION_TYPE_ICONS[type]
    const actions = ANNOTATION_TYPE_ACTIONS[type]
    const isPending = status === 'pending'

    const handleAction = (action: (typeof actions)[number]): void => {
      if (action.targetStatus) {
        void updateAnnotation({ id, status: action.targetStatus })
      } else {
        void message.info('功能将在后续版本实现')
      }
    }

    return (
      <div
        ref={ref}
        role="listitem"
        tabIndex={-1}
        data-testid="annotation-card"
        data-annotation-id={id}
        aria-label={`${label} — ${author}: ${content.slice(0, 50)}`}
        style={{
          borderLeft: `3px solid ${color}`,
          borderRadius: 8,
          padding: 12,
          backgroundColor: '#FFFFFF',
          opacity: isPending ? 1 : 0.6,
          outline: focused ? '2px solid #1677FF' : 'none',
          outlineOffset: focused ? 2 : 0,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <IconComponent size="1rem" color={color} />
          <Tag
            style={{
              margin: 0,
              fontSize: 12,
              color: color,
              borderColor: color,
              backgroundColor: `${color}14`,
            }}
          >
            {label}
          </Tag>
          <span
            style={{
              marginLeft: 'auto',
              color: '#8C8C8C',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            {author} · {formatRelativeTime(createdAt)}
          </span>
        </div>

        {/* Content */}
        <Tooltip title={content.length > 80 ? content : undefined}>
          <p
            style={{
              margin: '0 0 8px 0',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#1F1F1F',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {content}
          </p>
        </Tooltip>

        {/* Actions or Status Label */}
        {isPending ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {actions.map((action) => (
              <Button
                key={action.key}
                size="small"
                type={action.primary ? 'primary' : 'default'}
                autoInsertSpace={false}
                style={action.primary ? { backgroundColor: color, borderColor: color } : undefined}
                onClick={() => handleAction(action)}
                data-testid={`annotation-action-${action.key}`}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : (
          <div
            style={{ display: 'flex', justifyContent: 'flex-end' }}
            data-testid="annotation-status-label"
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: ANNOTATION_STATUS_COLORS[status as Exclude<typeof status, 'pending'>],
              }}
            >
              {ANNOTATION_STATUS_LABELS[status as Exclude<typeof status, 'pending'>]}
            </span>
          </div>
        )}
      </div>
    )
  }
)
