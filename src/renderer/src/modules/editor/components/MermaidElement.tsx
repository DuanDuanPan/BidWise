import { useCallback, useEffect, useRef, useState } from 'react'
import { PlateElement, useEditorRef, useSelected } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Modal, Tooltip, message } from 'antd'
import mermaid from 'mermaid'
import { useProjectStore } from '@renderer/stores'
import { MermaidRenderer } from './MermaidRenderer'
import type { MermaidElement as MermaidElementType } from '@modules/editor/plugins/mermaidPlugin'

type MermaidMode = 'editing' | 'preview'

const DEFAULT_TEMPLATE = `graph TD
  A[开始] --> B[结束]`

export function MermaidElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const editor = useEditorRef()
  const selected = useSelected()
  const projectId = useProjectStore((s) => s.currentProject?.id)
  const node = element as unknown as MermaidElementType

  const isNewNode = !node.source
  const [mode, setMode] = useState<MermaidMode>(isNewNode ? 'editing' : 'preview')
  const [localSource, setLocalSource] = useState(node.source || DEFAULT_TEMPLATE)
  const [localCaption, setLocalCaption] = useState(node.caption || '')
  const [previewSvg, setPreviewSvg] = useState('')
  const [errorLine, setErrorLine] = useState<number | undefined>(undefined)

  // Track the latest successfully rendered source+svg pair
  const lastSuccessRef = useRef<{ source: string; svg: string } | null>(null)
  const initialRenderDone = useRef(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateNodeData = useCallback(
    (data: Partial<MermaidElementType>) => {
      const path = editor.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(data, { at: path })
    },
    [editor, element]
  )

  const handleRenderSuccess = useCallback(
    (svg: string) => {
      lastSuccessRef.current = { source: localSource, svg }
      setPreviewSvg(svg)
      setErrorLine(undefined)
    },
    [localSource]
  )

  const handleRenderError = useCallback((_error: string, line?: number) => {
    setErrorLine(line)
  }, [])

  const saveAsset = useCallback(
    async (svg: string) => {
      if (!projectId) return
      const res = await window.api.mermaidSaveAsset({
        projectId,
        diagramId: node.diagramId,
        svgContent: svg,
        assetFileName: node.assetFileName,
      })
      if (!res.success) {
        void message.warning('SVG 资产保存失败，将在下次完成编辑时重试')
      }
    },
    [projectId, node.diagramId, node.assetFileName]
  )

  const exitEditMode = useCallback(() => {
    // Check if the latest success render matches current source
    const success = lastSuccessRef.current
    if (!success || success.source !== localSource) {
      void message.warning('当前语法有误或尚未渲染完成，请修正后再完成')
      return
    }

    updateNodeData({
      source: localSource,
      caption: localCaption,
      lastModified: new Date().toISOString(),
    })

    setPreviewSvg(success.svg)
    setMode('preview')

    void saveAsset(success.svg)
  }, [localSource, localCaption, updateNodeData, saveAsset])

  const handleEdit = useCallback(() => {
    setMode('editing')
  }, [])

  const handleDelete = useCallback(() => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个 Mermaid 图表吗？',
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
            .mermaidDeleteAsset({
              projectId,
              assetFileName: node.assetFileName,
            })
            .catch(() => {
              console.warn('Mermaid 资产删除失败 (best-effort)')
            })
        }
      },
    })
  }, [editor, element, projectId, node.assetFileName])

  const handleCaptionBlur = useCallback(() => {
    if (localCaption !== node.caption) {
      updateNodeData({ caption: localCaption })
    }
  }, [localCaption, node.caption, updateNodeData])

  const handleDoubleClick = useCallback(() => {
    if (mode === 'preview') setMode('editing')
  }, [mode])

  // Sync gutter scroll with textarea
  useEffect(() => {
    const textarea = textareaRef.current
    const gutter = gutterRef.current
    if (!textarea || !gutter) return
    const syncScroll = (): void => {
      gutter.scrollTop = textarea.scrollTop
    }
    textarea.addEventListener('scroll', syncScroll)
    return () => textarea.removeEventListener('scroll', syncScroll)
  }, [mode]) // re-attach when switching to editing mode

  // One-time render on mount for deserialized/restored blocks in preview mode
  useEffect(() => {
    if (initialRenderDone.current) return
    if (mode !== 'preview' || !node.source) return
    initialRenderDone.current = true

    const renderInitial = async (): Promise<void> => {
      try {
        const uniqueId = `mermaid-init-${node.diagramId}`
        const { svg } = await mermaid.render(uniqueId, node.source)
        setPreviewSvg(svg)
        lastSuccessRef.current = { source: node.source, svg }
      } catch {
        // If initial render fails, user can double-click to edit
      }
    }
    void renderInitial()
  }, [mode, node.source, node.diagramId])

  // Click outside detection: collapse editing mode
  useEffect(() => {
    if (mode !== 'editing') return

    const handlePointerDown = (e: PointerEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        // Only exit if we have a successful render matching current source
        const success = lastSuccessRef.current
        if (success && success.source === localSource) {
          updateNodeData({
            source: localSource,
            caption: localCaption,
            lastModified: new Date().toISOString(),
          })
          setPreviewSvg(success.svg)
          setMode('preview')
          void saveAsset(success.svg)
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [mode, localSource, localCaption, updateNodeData, saveAsset])

  return (
    <PlateElement {...props}>
      <div
        ref={wrapperRef}
        contentEditable={false}
        className={`my-4 rounded-lg ${
          mode === 'editing' || selected ? 'border-2 border-blue-500' : 'border border-gray-200'
        }`}
        data-testid="mermaid-element"
      >
        {mode === 'editing' ? (
          <div className="bg-[#F0F5FF]" data-testid="mermaid-editing">
            {/* Code editor area with line numbers */}
            <div className="border-b border-blue-200 p-3">
              <div
                className="flex overflow-hidden rounded border border-gray-300 bg-white focus-within:border-blue-400"
                data-testid="mermaid-source-editor"
              >
                {/* Line number gutter */}
                <div
                  className="border-r border-gray-200 bg-gray-50 py-3 text-right font-mono text-xs leading-relaxed text-gray-400 select-none"
                  aria-hidden="true"
                  data-testid="mermaid-line-gutter"
                  ref={gutterRef}
                  style={{ overflow: 'hidden', minWidth: '2.5rem' }}
                >
                  {localSource.split('\n').map((_, i) => {
                    const lineNum = i + 1
                    const isError = errorLine === lineNum
                    return (
                      <div
                        key={lineNum}
                        className={`px-2 ${isError ? 'bg-red-100 font-semibold text-red-500' : ''}`}
                        data-testid={isError ? 'mermaid-error-line' : undefined}
                      >
                        {lineNum}
                      </div>
                    )
                  })}
                </div>
                {/* Source textarea */}
                <textarea
                  ref={textareaRef}
                  className="w-full resize-y border-0 p-3 font-mono text-sm leading-relaxed outline-none"
                  rows={8}
                  value={localSource}
                  onChange={(e) => setLocalSource(e.target.value)}
                  placeholder="输入 Mermaid 语法..."
                  spellCheck={false}
                  wrap="off"
                />
              </div>
            </div>

            {/* Live preview area */}
            <div className="min-h-[100px] bg-white p-3">
              <MermaidRenderer
                source={localSource}
                diagramId={node.diagramId}
                onRenderSuccess={handleRenderSuccess}
                onRenderError={handleRenderError}
              />
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between border-t border-blue-200 px-3 py-1.5">
              <Button
                type="primary"
                size="small"
                onClick={exitEditMode}
                data-testid="mermaid-done-btn"
              >
                完成
              </Button>
              <span className="text-xs text-gray-400">Mermaid 架构图</span>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer bg-gray-50"
            onDoubleClick={handleDoubleClick}
            data-testid="mermaid-preview"
          >
            {/* SVG preview area */}
            <div
              className="flex max-h-[400px] items-center justify-center overflow-auto p-4"
              data-testid="mermaid-preview-svg"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />

            {/* Caption bar with controls */}
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
              <input
                type="text"
                className="flex-1 border-0 bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-300"
                placeholder="输入图表标题..."
                value={localCaption}
                onChange={(e) => setLocalCaption(e.target.value)}
                onBlur={handleCaptionBlur}
                data-testid="mermaid-caption-input"
              />
              <div className="flex gap-1">
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={handleEdit}
                    data-testid="mermaid-edit-btn"
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={handleDelete}
                    danger
                    data-testid="mermaid-delete-btn"
                  />
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
      {children}
    </PlateElement>
  )
}
