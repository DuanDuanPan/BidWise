import { useCallback, useEffect, useRef, useState } from 'react'
import { PlateElement, useEditorRef, useSelected } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'
import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FullscreenOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { App, Button, Tooltip } from 'antd'
import { useProjectStore } from '@renderer/stores'
import { DiagramFullscreenModal } from './DiagramFullscreenModal'
import { DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME } from './diagramPreview'
import type { AiDiagramElement as AiDiagramElementType } from '@modules/editor/plugins/aiDiagramPlugin'
import { sanitizeSvg } from '@modules/editor/utils/aiDiagramSvg'
import { useAiDiagramContext } from '@modules/editor/context/AiDiagramContext'

export function AiDiagramElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const editor = useEditorRef()
  const selected = useSelected()
  const projectId = useProjectStore((s) => s.currentProject?.id)
  const { message: messageApi, modal } = App.useApp()
  const aiDiagramCtx = useAiDiagramContext()
  const node = element as unknown as AiDiagramElementType

  const [localCaption, setLocalCaption] = useState(node.caption || '')
  const [svgHtml, setSvgHtml] = useState(node.svgContent || '')
  const [assetMissing, setAssetMissing] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const observerTargetRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  const updateNodeData = useCallback(
    (data: Partial<AiDiagramElementType>) => {
      const path = editor.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(data, { at: path })
    },
    [editor, element]
  )

  const saveAsset = useCallback(
    async (svg: string) => {
      if (!projectId) return false
      const res = await window.api.aiDiagramSaveAsset({
        projectId,
        diagramId: node.diagramId,
        svgContent: svg,
        assetFileName: node.assetFileName,
      })
      return res.success
    },
    [projectId, node.diagramId, node.assetFileName]
  )

  // Sync local preview when node data changes externally (e.g. regenerate updates svgContent via setNodes).
  // This is subscribing to Slate node changes — the valid "sync external system" pattern for effects.
  const prevNodeSvgRef = useRef(node.svgContent)
  useEffect(() => {
    if (node.svgContent && node.svgContent !== prevNodeSvgRef.current) {
      prevNodeSvgRef.current = node.svgContent
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSvgHtml(node.svgContent)
      setAssetMissing(false)
    }
  }, [node.svgContent])

  // IntersectionObserver lazy load
  useEffect(() => {
    if (isVisible) return
    const target = observerTargetRef.current ?? wrapperRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [isVisible])

  // Load SVG from persisted asset on mount
  useEffect(() => {
    if (initialLoadDone.current) return
    if (!isVisible) return
    initialLoadDone.current = true

    const loadSvg = async (): Promise<void> => {
      // Try loading from disk — must sanitize, file could be tampered via project folder / Git sync
      if (projectId && node.assetFileName) {
        try {
          const result = await window.api.aiDiagramLoadAsset({
            projectId,
            assetFileName: node.assetFileName,
          })
          if (result.success && result.data?.svgContent) {
            const sanitized = sanitizeSvg(result.data.svgContent)
            if (sanitized.ok) {
              setSvgHtml(sanitized.svg)
              setAssetMissing(false)
              return
            }
            // Sanitize failed — fall through to in-memory or missing
          }
        } catch {
          // Fall through
        }
      }

      // Fall back to in-memory svgContent (already sanitized at generation time)
      if (node.svgContent) {
        setSvgHtml(node.svgContent)
        setAssetMissing(false)
        return
      }

      // Asset missing
      setAssetMissing(true)
    }
    void loadSvg()
  }, [isVisible, projectId, node.assetFileName, node.svgContent])

  // Auto-retry save when svgPersisted === false
  useEffect(() => {
    if (node.svgPersisted !== false || !svgHtml || !isVisible) return

    let cancelled = false
    void (async () => {
      const success = await saveAsset(svgHtml)
      if (cancelled) return
      if (success) {
        updateNodeData({ svgPersisted: true })
      } else {
        void messageApi.warning('SVG 资产保存失败，将在下次保存时重试')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [node.svgPersisted, svgHtml, isVisible, saveAsset, updateNodeData, messageApi])

  const handleDelete = useCallback(() => {
    modal.confirm({
      title: '确认删除',
      content: '确定要删除这个 AI 图表吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        const path = editor.api.findPath(element)
        if (!path) return
        editor.tf.removeNodes({ at: path })

        // Best-effort asset deletion
        if (projectId && node.assetFileName) {
          void window.api
            .aiDiagramDeleteAsset({
              projectId,
              assetFileName: node.assetFileName,
            })
            .catch(() => {
              console.warn('AI diagram 资产删除失败 (best-effort)')
            })
        }
      },
    })
  }, [modal, editor, element, projectId, node.assetFileName])

  const handleCaptionBlur = useCallback(() => {
    if (localCaption !== node.caption) {
      updateNodeData({ caption: localCaption })
    }
  }, [localCaption, node.caption, updateNodeData])

  const handleRegenerate = useCallback(() => {
    aiDiagramCtx?.requestRegenerate({
      diagramId: node.diagramId,
      assetFileName: node.assetFileName,
      caption: node.caption || '',
      prompt: node.prompt || '',
      style: node.style || 'flat-icon',
      diagramType: node.diagramType || 'architecture',
    })
  }, [
    aiDiagramCtx,
    node.diagramId,
    node.assetFileName,
    node.caption,
    node.prompt,
    node.style,
    node.diagramType,
  ])

  return (
    <PlateElement {...props}>
      <div
        ref={wrapperRef}
        contentEditable={false}
        className={`my-4 rounded-lg ${
          selected ? 'border-2 border-blue-500' : 'border border-gray-200'
        }`}
        data-testid="ai-diagram-element"
      >
        <div ref={observerTargetRef} className="bg-gray-50" data-testid="ai-diagram-preview">
          {node.generationError && !node.svgContent ? (
            <div
              className={`${DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME} flex-col gap-2 text-orange-500`}
              data-testid="ai-diagram-failed"
            >
              <ExclamationCircleOutlined className="text-2xl" />
              <span className="text-sm font-medium">图表生成失败</span>
              <span className="max-w-md text-center text-xs text-gray-400">
                {node.generationError}
              </span>
              <Button
                size="small"
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRegenerate}
              >
                重新生成
              </Button>
            </div>
          ) : assetMissing ? (
            <div
              className={`${DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME} flex-col text-gray-400`}
              data-testid="ai-diagram-missing"
            >
              <span className="mb-2 text-sm">资产丢失</span>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleRegenerate}>
                重新生成
              </Button>
            </div>
          ) : isVisible && svgHtml ? (
            <div
              className={DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME}
              data-testid="ai-diagram-svg"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div
              className={`${DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME} text-gray-300`}
              data-testid="ai-diagram-placeholder"
            >
              <span className="text-sm">AI 图表</span>
            </div>
          )}

          {/* Caption bar with controls */}
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
            <input
              type="text"
              className="flex-1 border-0 bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-300"
              placeholder="输入图表标题..."
              value={localCaption}
              onChange={(e) => setLocalCaption(e.target.value)}
              onBlur={handleCaptionBlur}
              data-testid="ai-diagram-caption-input"
            />
            <div className="flex gap-1">
              <Tooltip title="全屏查看">
                <Button
                  type="text"
                  size="small"
                  icon={<FullscreenOutlined />}
                  onClick={() => setFullscreenOpen(true)}
                  disabled={!svgHtml}
                  data-testid="ai-diagram-fullscreen-btn"
                />
              </Tooltip>
              <Tooltip title="重新生成">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRegenerate}
                  data-testid="ai-diagram-regenerate-btn"
                />
              </Tooltip>
              <Tooltip title="编辑描述">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={handleRegenerate}
                  data-testid="ai-diagram-edit-btn"
                />
              </Tooltip>
              <Tooltip title="删除">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={handleDelete}
                  danger
                  data-testid="ai-diagram-delete-btn"
                />
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
      <DiagramFullscreenModal
        open={fullscreenOpen}
        svgHtml={svgHtml}
        caption={localCaption}
        onClose={() => setFullscreenOpen(false)}
      />
      {children}
    </PlateElement>
  )
}
