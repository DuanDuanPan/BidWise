import { useCallback, useRef, useState } from 'react'
import { Modal } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons'

interface DiagramFullscreenModalProps {
  open: boolean
  svgHtml: string
  caption?: string
  onClose: () => void
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const SCALE_STEP = 0.25

export function DiagramFullscreenModal({
  open,
  svgHtml,
  caption,
  onClose,
}: DiagramFullscreenModalProps): React.JSX.Element {
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset transform when modal open state changes
  const handleAfterOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    },
    [isDragging]
  )

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP))
  }, [])

  const handleReset = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={handleAfterOpenChange}
      footer={null}
      width="90vw"
      centered
      title={caption || '图表预览'}
      styles={{ body: { padding: 0, height: '80vh', overflow: 'hidden' } }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <button
          className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
          onClick={handleZoomOut}
          title="缩小"
        >
          <ZoomOutOutlined />
        </button>
        <span className="min-w-[4rem] text-center text-sm text-gray-500">
          {Math.round(scale * 100)}%
        </span>
        <button
          className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
          onClick={handleZoomIn}
          title="放大"
        >
          <ZoomInOutlined />
        </button>
        <button
          className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
          onClick={handleReset}
          title="重置"
        >
          <ExpandOutlined />
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="h-full cursor-grab overflow-hidden bg-gray-100 active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ height: 'calc(80vh - 44px)' }}
      >
        <div
          data-testid="diagram-fullscreen-stage"
          className="flex h-full w-full items-center justify-center [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
    </Modal>
  )
}
