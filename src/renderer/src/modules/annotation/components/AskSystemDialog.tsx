import { useState, useCallback, useEffect, useRef } from 'react'
import { Button, Input, Tooltip, message } from 'antd'
import {
  QuestionCircleOutlined,
  SendOutlined,
  CloseOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { useDocumentStore } from '@renderer/stores'
import { extractMarkdownSectionContent } from '@shared/chapter-markdown'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const { TextArea } = Input

type AskPhase = 'idle' | 'input' | 'loading' | 'revealing' | 'done'

interface AskSystemDialogProps {
  projectId: string
  currentSection: {
    locator: ChapterHeadingLocator
    sectionKey: string
    label: string
  } | null
}

export function AskSystemDialog({
  projectId,
  currentSection,
}: AskSystemDialogProps): React.JSX.Element {
  const [phase, setPhase] = useState<AskPhase>('idle')
  const [question, setQuestion] = useState('')
  const [revealedText, setRevealedText] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const taskIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const createAnnotation = useAnnotationStore((s) => s.createAnnotation)
  const documentContent = useDocumentStore((s) => s.content)

  const disabled = !currentSection

  const cleanup = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const handleOpen = useCallback(() => {
    if (disabled) return
    setPhase('input')
    setQuestion('')
    setRevealedText('')
    setProgressMessage('')
  }, [disabled])

  const handleClose = useCallback(() => {
    cleanup()
    setPhase('idle')
    setQuestion('')
    setRevealedText('')
    setProgressMessage('')
    taskIdRef.current = null
  }, [cleanup])

  const startProgressiveReveal = useCallback(
    (fullText: string) => {
      setPhase('revealing')
      let index = 0
      const chars = [...fullText] // Handle multi-byte chars correctly
      const interval = setInterval(() => {
        index += 2
        if (index >= chars.length) {
          setRevealedText(fullText)
          clearInterval(interval)

          // Create annotation from answer
          if (currentSection) {
            void createAnnotation({
              projectId,
              sectionId: currentSection.sectionKey,
              type: 'ai-suggestion',
              content: fullText,
              author: 'agent:ask-system',
            })
          }
          setPhase('done')
        } else {
          setRevealedText(chars.slice(0, index).join(''))
        }
      }, 30)
    },
    [currentSection, projectId, createAnnotation]
  )

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || !currentSection) return

    setPhase('loading')
    setProgressMessage('正在分析问题...')

    const sectionContent = extractMarkdownSectionContent(documentContent, currentSection.locator)

    try {
      const response = await window.api.agentExecute({
        agentType: 'generate',
        context: {
          mode: 'ask-system',
          chapterTitle: currentSection.locator.title,
          chapterLevel: currentSection.locator.level,
          sectionContent,
          userQuestion: question.trim(),
        },
      })

      if (!response.success) {
        void message.error('提问失败，请重试')
        setPhase('input')
        return
      }

      const taskId = response.data.taskId
      taskIdRef.current = taskId

      // Listen for progress events
      const unsubscribe = window.api.onTaskProgress((event) => {
        if (event.taskId !== taskId) return
        if (event.message === 'analyzing') setProgressMessage('正在分析问题...')
        else if (event.message === 'generating') setProgressMessage('正在生成回答...')
        else if (event.message) setProgressMessage(event.message)
      })

      // Poll for completion
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusResponse = await window.api.agentStatus(taskId)
          if (!statusResponse.success) return

          const status = statusResponse.data
          if (status.status === 'completed' && status.result?.content) {
            cleanup()
            unsubscribe()
            startProgressiveReveal(status.result.content)
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            cleanup()
            unsubscribe()
            void message.error(status.error?.message ?? '回答生成失败')
            setPhase('input')
          }
        } catch {
          // Ignore poll errors, will retry
        }
      }, 1000)
    } catch {
      void message.error('提问失败，请重试')
      setPhase('input')
    }
  }, [question, currentSection, documentContent, cleanup, startProgressiveReveal])

  // Idle state: just show the button
  if (phase === 'idle') {
    return (
      <div
        className="flex shrink-0 items-center justify-center border-t p-3"
        style={{ borderColor: 'var(--color-border)' }}
        data-testid="ask-system-trigger"
      >
        <Tooltip title={disabled ? '进入具体章节后可向系统提问' : '向系统提问'}>
          <Button
            type="default"
            icon={<QuestionCircleOutlined />}
            disabled={disabled}
            onClick={handleOpen}
            data-testid="ask-system-button"
            block
          >
            向系统提问
          </Button>
        </Tooltip>
      </div>
    )
  }

  // Input / Loading / Revealing / Done states
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-t p-3"
      style={{ borderColor: 'var(--color-border)' }}
      data-testid="ask-system-dialog"
    >
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          向系统提问
        </span>
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5"
          onClick={handleClose}
          aria-label="关闭提问"
          data-testid="ask-system-close"
        >
          <CloseOutlined style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }} />
        </button>
      </div>

      {phase === 'input' && (
        <>
          <TextArea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="输入您关于当前章节的问题..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            data-testid="ask-system-input"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void handleSubmit()}
            disabled={!question.trim()}
            data-testid="ask-system-submit"
            block
          >
            提交
          </Button>
        </>
      )}

      {phase === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-4" data-testid="ask-system-loading">
          <LoadingOutlined style={{ fontSize: 24, color: 'var(--color-brand)' }} spin />
          <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>
            {progressMessage}
          </span>
        </div>
      )}

      {(phase === 'revealing' || phase === 'done') && (
        <div
          className="rounded-md p-3 text-sm leading-relaxed"
          style={{
            backgroundColor: 'var(--color-bg-global)',
            color: 'var(--color-text-primary)',
            maxHeight: 200,
            overflowY: 'auto',
          }}
          data-testid="ask-system-answer"
        >
          {revealedText}
          {phase === 'revealing' && <span className="animate-pulse">▌</span>}
        </div>
      )}

      {phase === 'done' && (
        <p className="text-caption m-0" style={{ color: 'var(--color-text-tertiary)' }}>
          回答已保存为批注
        </p>
      )}
    </div>
  )
}
