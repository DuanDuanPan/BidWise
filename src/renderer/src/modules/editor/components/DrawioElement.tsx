import { useCallback, useEffect, useRef, useState } from 'react'
import { PlateElement, useEditorRef, useSelected } from 'platejs/react'
import type { PlateElementProps } from 'platejs/react'
import { DeleteOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useProjectStore } from '@renderer/stores'
import { DrawioEditor } from './DrawioEditor'
import type { DrawioElement as DrawioElementType } from '@modules/editor/plugins/drawioPlugin'

type DrawioMode = 'preview' | 'editing'

export function DrawioElement(props: PlateElementProps): React.JSX.Element {
  const { children, element } = props
  const editor = useEditorRef()
  const selected = useSelected()
  const projectId = useProjectStore((s) => s.currentProject?.id)
  const node = element as unknown as DrawioElementType

  const [mode, setMode] = useState<DrawioMode>(node.xml ? 'preview' : 'editing')
  const [localCaption, setLocalCaption] = useState(node.caption || '')
  const [loadError, setLoadError] = useState(false)
  const [pngDataUrl, setPngDataUrl] = useState(node.pngDataUrl || '')
  const [xml, setXml] = useState(node.xml || '')
  const hasAttemptedLoad = useRef(false)

  // Lazy-load asset data when xml/pngDataUrl is missing
  useEffect(() => {
    if (hasAttemptedLoad.current) return
    if (xml && pngDataUrl) return
    if (!projectId || !node.assetFileName) return

    hasAttemptedLoad.current = true
    void (async () => {
      try {
        const res = await window.api.drawioLoadAsset({
          projectId,
          fileName: node.assetFileName,
        })
        if (res.success && res.data) {
          setXml(res.data.xml)
          setPngDataUrl(res.data.pngDataUrl)
          setLoadError(false)
          setMode('preview')
        } else {
          setLoadError(true)
        }
      } catch {
        setLoadError(true)
      }
    })()
  }, [projectId, node.assetFileName, xml, pngDataUrl])

  const updateNodeData = useCallback(
    (data: Partial<DrawioElementType>) => {
      const path = editor.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(data, { at: path })
    },
    [editor, element]
  )

  const handleSave = useCallback(
    async (savedXml: string, pngBase64: string): Promise<boolean> => {
      if (!projectId) return false

      const res = await window.api.drawioSaveAsset({
        projectId,
        diagramId: node.diagramId,
        xml: savedXml,
        pngBase64,
        fileName: node.assetFileName,
      })

      if (!res.success) return false

      const newPngDataUrl = `data:image/png;base64,${pngBase64}`
      setXml(savedXml)
      setPngDataUrl(newPngDataUrl)
      setLoadError(false)

      updateNodeData({
        xml: savedXml,
        pngDataUrl: newPngDataUrl,
        lastModified: new Date().toISOString(),
      })
      return true
    },
    [projectId, node.diagramId, node.assetFileName, updateNodeData]
  )

  const handleExit = useCallback(() => {
    setMode('preview')
  }, [])

  const handleEdit = useCallback(() => {
    setMode('editing')
  }, [])

  const handleDelete = useCallback(() => {
    const path = editor.api.findPath(element)
    if (!path) return
    editor.tf.removeNodes({ at: path })

    // Best-effort asset deletion
    if (projectId && node.assetFileName) {
      void window.api
        .drawioDeleteAsset({
          projectId,
          fileName: node.assetFileName,
        })
        .catch(() => {
          // Non-blocking: warn only
          console.warn('draw.io 资产删除失败 (best-effort)')
        })
    }
  }, [editor, element, projectId, node.assetFileName])

  const handleCaptionBlur = useCallback(() => {
    if (localCaption !== node.caption) {
      updateNodeData({ caption: localCaption })
    }
  }, [localCaption, node.caption, updateNodeData])

  const handleDoubleClick = useCallback(() => {
    if (mode === 'preview') setMode('editing')
  }, [mode])

  return (
    <PlateElement {...props}>
      <div
        contentEditable={false}
        className={`my-4 rounded border ${selected ? 'border-blue-500' : 'border-gray-200'}`}
        data-testid="drawio-element"
      >
        {mode === 'editing' && projectId ? (
          <DrawioEditor
            xml={xml}
            projectId={projectId}
            diagramId={node.diagramId}
            assetFileName={node.assetFileName}
            onSave={handleSave}
            onExit={handleExit}
          />
        ) : (
          <div
            className="cursor-pointer"
            onDoubleClick={handleDoubleClick}
            data-testid="drawio-preview"
          >
            {loadError && !pngDataUrl ? (
              <div className="flex flex-col items-center gap-2 p-8 text-orange-500">
                <WarningOutlined style={{ fontSize: 32 }} />
                <span>图表资产加载失败</span>
              </div>
            ) : pngDataUrl ? (
              <img
                src={pngDataUrl}
                alt={localCaption || '架构图'}
                className="mx-auto max-w-full"
                data-testid="drawio-preview-img"
              />
            ) : (
              <div className="flex items-center justify-center p-8 text-gray-400">
                <span>空白图表 — 双击编辑</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
              <input
                type="text"
                className="flex-1 border-0 bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-300"
                placeholder="输入图表标题..."
                value={localCaption}
                onChange={(e) => setLocalCaption(e.target.value)}
                onBlur={handleCaptionBlur}
                data-testid="drawio-caption-input"
              />
              <div className="flex gap-1">
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={handleEdit}
                    disabled={!projectId}
                    data-testid="drawio-edit-btn"
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={handleDelete}
                    danger
                    data-testid="drawio-delete-btn"
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
