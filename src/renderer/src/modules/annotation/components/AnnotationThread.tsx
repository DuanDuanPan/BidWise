import { useState, useEffect, useRef } from 'react'
import { Button, Input, Skeleton } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { formatRelativeTime } from '@renderer/shared/lib/format-time'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { useUserStore } from '@renderer/stores/userStore'
import { useAnnotationReplies } from '@renderer/modules/annotation/hooks/useAnnotationReplies'
import type { AnnotationRecord } from '@shared/annotation-types'

const { TextArea } = Input

interface AnnotationThreadProps {
  rootAnnotation: AnnotationRecord
  onAiFeedback?: (rootAnnotation: AnnotationRecord, userFeedback: string) => void
}

const AI_ANNOTATION_TYPES = new Set(['ai-suggestion', 'adversarial', 'score-warning'])

export function AnnotationThread({
  rootAnnotation,
  onAiFeedback,
}: AnnotationThreadProps): React.JSX.Element {
  const { replies, loading, loadReplies } = useAnnotationReplies(rootAnnotation.id)
  const createAnnotation = useAnnotationStore((s) => s.createAnnotation)
  const currentUser = useUserStore((s) => s.currentUser)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadReplies()
  }, [loadReplies])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [replies.length])

  const handleSubmitReply = async (): Promise<void> => {
    const text = replyText.trim()
    if (!text || submitting) return

    setSubmitting(true)
    try {
      await createAnnotation({
        projectId: rootAnnotation.projectId,
        sectionId: rootAnnotation.sectionId,
        type: 'human',
        content: text,
        author: currentUser.id,
        parentId: rootAnnotation.id,
      })
      setReplyText('')

      // Trigger AI feedback if replying to AI annotation type
      if (AI_ANNOTATION_TYPES.has(rootAnnotation.type) && onAiFeedback) {
        onAiFeedback(rootAnnotation, text)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        marginLeft: 16,
        borderLeft: '2px solid #E8E8E8',
        paddingLeft: 12,
        marginTop: 8,
      }}
      data-testid="annotation-thread"
    >
      {/* Replies list */}
      {loading ? (
        <div data-testid="thread-loading">
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {replies.map((reply) => (
            <div
              key={reply.id}
              style={{
                padding: 8,
                backgroundColor: '#FAFAFA',
                borderRadius: 6,
                fontSize: 13,
              }}
              data-testid="thread-reply"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 12,
                  color: '#8C8C8C',
                }}
              >
                <span>{reply.author}</span>
                <span>{formatRelativeTime(reply.createdAt)}</span>
              </div>
              <div style={{ color: '#1F1F1F', lineHeight: 1.6 }}>{reply.content}</div>
            </div>
          ))}
          <div ref={threadEndRef} />
        </div>
      )}

      {/* Reply input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }} data-testid="thread-reply-input">
        <TextArea
          autoSize={{ minRows: 1, maxRows: 3 }}
          placeholder="输入回复..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              void handleSubmitReply()
            }
          }}
          disabled={submitting}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmitReply}
          loading={submitting}
          disabled={!replyText.trim()}
          data-testid="thread-send-btn"
        />
      </div>
    </div>
  )
}
