import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Select, Spin } from 'antd'
import type { AiDiagramStyleToken, AiDiagramTypeToken } from '@shared/ai-diagram-types'
import type { SkillExecuteContext } from '@main/services/skill-engine/types'
import { extractAndSanitizeAiDiagramSvg } from '@modules/editor/utils/aiDiagramSvg'

const { TextArea } = Input

const STYLE_OPTIONS: { label: string; value: AiDiagramStyleToken }[] = [
  { label: 'Flat Icon', value: 'flat-icon' },
  { label: 'Dark Terminal', value: 'dark-terminal' },
  { label: 'Blueprint', value: 'blueprint' },
  { label: 'Notion Clean', value: 'notion-clean' },
  { label: 'Glassmorphism', value: 'glassmorphism' },
  { label: 'Claude Official', value: 'claude-official' },
  { label: 'OpenAI Official', value: 'openai-official' },
]

const TYPE_OPTIONS: { label: string; value: AiDiagramTypeToken }[] = [
  { label: 'Architecture', value: 'architecture' },
  { label: 'Data Flow', value: 'data-flow' },
  { label: 'Flowchart', value: 'flowchart' },
  { label: 'Sequence', value: 'sequence' },
  { label: 'Agent Architecture', value: 'agent-architecture' },
  { label: 'Class', value: 'class' },
  { label: 'ER', value: 'er' },
  { label: 'Network', value: 'network' },
  { label: 'Concept Map', value: 'concept-map' },
  { label: 'Timeline', value: 'timeline' },
  { label: 'Comparison', value: 'comparison' },
  { label: 'Mind Map', value: 'mind-map' },
]

export interface AiDiagramDialogResult {
  svgContent: string
  prompt: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
}

interface AiDiagramDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (result: AiDiagramDialogResult) => void
  initialPrompt?: string
  initialStyle?: AiDiagramStyleToken
  initialType?: AiDiagramTypeToken
}

type Phase = 'input' | 'generating' | 'error'

export function AiDiagramDialog({
  open,
  onClose,
  onSuccess,
  initialPrompt = '',
  initialStyle = 'flat-icon',
  initialType = 'architecture',
}: AiDiagramDialogProps): React.JSX.Element {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [style, setStyle] = useState<AiDiagramStyleToken>(initialStyle)
  const [diagramType, setDiagramType] = useState<AiDiagramTypeToken>(initialType)
  const [phase, setPhase] = useState<Phase>('input')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const taskIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const resetForm = useCallback(() => {
    setPrompt(initialPrompt)
    setStyle(initialStyle)
    setDiagramType(initialType)
    setPhase('input')
    setProgress(0)
    setProgressMessage('')
    setErrorMessage('')
  }, [initialPrompt, initialStyle, initialType])

  const handleAfterOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) resetForm()
    },
    [resetForm]
  )

  const cleanup = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    taskIdRef.current = null
  }, [])

  // Cleanup on unmount or close
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  const handleCancel = useCallback(() => {
    if (phase === 'generating' && taskIdRef.current) {
      void window.api.taskCancel(taskIdRef.current).catch(() => {
        // Best-effort cancel
      })
    }
    cleanup()
    onClose()
  }, [phase, cleanup, onClose])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return

    setPhase('generating')
    setProgress(0)
    setProgressMessage('正在启动图表生成...')
    setErrorMessage('')

    try {
      const response = await window.api.agentExecute({
        agentType: 'skill',
        context: {
          skillName: 'fireworks-tech-graph',
          args: `${style} ${diagramType}`,
          userMessage: prompt.trim(),
        } satisfies SkillExecuteContext,
      })

      if (!response.success) {
        setErrorMessage(response.error.message)
        setPhase('error')
        return
      }

      const taskId = response.data.taskId
      taskIdRef.current = taskId

      // Subscribe to progress
      unsubscribeRef.current = window.api.onTaskProgress((event) => {
        if (event.taskId !== taskId) return
        if (typeof event.progress === 'number') setProgress(event.progress)
        if (event.message) setProgressMessage(event.message)
      })

      // Poll for completion
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusResponse = await window.api.agentStatus(taskId)
          if (!statusResponse.success) return

          const status = statusResponse.data
          if (status.status === 'completed') {
            cleanup()
            const rawResult = status.result?.content ?? ''
            const svgResult = extractAndSanitizeAiDiagramSvg(rawResult)

            if (!svgResult.ok) {
              setErrorMessage(svgResult.error)
              setPhase('error')
              return
            }

            onSuccess({
              svgContent: svgResult.svg,
              prompt: prompt.trim(),
              style,
              diagramType,
            })
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            cleanup()
            setErrorMessage(status.error?.message ?? '图表生成失败')
            setPhase('error')
          }
        } catch {
          // Ignore poll errors
        }
      }, 1000)
    } catch {
      setErrorMessage('图表生成请求失败，请重试')
      setPhase('error')
    }
  }, [prompt, style, diagramType, cleanup, onSuccess])

  const handleRetry = useCallback(() => {
    setPhase('input')
    setErrorMessage('')
  }, [])

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      afterOpenChange={handleAfterOpenChange}
      title="AI 图表生成"
      footer={null}
      width={560}
      data-testid="ai-diagram-dialog"
    >
      {phase === 'input' && (
        <div className="flex flex-col gap-4" data-testid="ai-diagram-form">
          <div>
            <label className="mb-1 block text-sm text-gray-600">图表描述</label>
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你需要的图表，如：系统整体架构图，包含前端、API网关、微服务集群、数据库"
              rows={4}
              data-testid="ai-diagram-prompt"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-600">视觉风格</label>
              <Select
                value={style}
                onChange={setStyle}
                options={STYLE_OPTIONS}
                className="w-full"
                data-testid="ai-diagram-style"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-600">图表类型</label>
              <Select
                value={diagramType}
                onChange={setDiagramType}
                options={TYPE_OPTIONS}
                className="w-full"
                data-testid="ai-diagram-type"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              data-testid="ai-diagram-generate-btn"
            >
              生成
            </Button>
          </div>
        </div>
      )}

      {phase === 'generating' && (
        <div className="flex flex-col items-center gap-4 py-8" data-testid="ai-diagram-generating">
          <Spin size="large" />
          <div className="text-center">
            <div className="text-sm text-gray-600">{progressMessage}</div>
            {progress > 0 && (
              <div className="mt-1 text-xs text-gray-400">{Math.round(progress)}%</div>
            )}
          </div>
          <Button onClick={handleCancel} data-testid="ai-diagram-cancel-btn">
            取消生成
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-4" data-testid="ai-diagram-error">
          <Alert type="error" message={errorMessage} showIcon />
          <div className="flex justify-end gap-2">
            <Button onClick={handleCancel}>取消</Button>
            <Button onClick={handleRetry}>修改描述</Button>
            <Button type="primary" onClick={handleGenerate} data-testid="ai-diagram-retry-btn">
              重试
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
