import { Button, Tag } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons'
import { useState, useCallback } from 'react'

interface PreviewToolbarProps {
  fileName: string
  pageCount?: number
  onZoomChange: (zoom: number) => void
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const DEFAULT_ZOOM_INDEX = 2 // 100%

export function PreviewToolbar({
  fileName,
  pageCount,
  onZoomChange,
}: PreviewToolbarProps): React.JSX.Element {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)

  const handleZoomIn = useCallback(() => {
    setZoomIndex((prev) => {
      const next = Math.min(prev + 1, ZOOM_LEVELS.length - 1)
      onZoomChange(ZOOM_LEVELS[next])
      return next
    })
  }, [onZoomChange])

  const handleZoomOut = useCallback(() => {
    setZoomIndex((prev) => {
      const next = Math.max(prev - 1, 0)
      onZoomChange(ZOOM_LEVELS[next])
      return next
    })
  }, [onZoomChange])

  const handleFitPage = useCallback(() => {
    setZoomIndex(DEFAULT_ZOOM_INDEX)
    onZoomChange(1)
  }, [onZoomChange])

  const currentZoom = ZOOM_LEVELS[zoomIndex]

  return (
    <div
      className="flex items-center justify-between border-b border-gray-200 px-4 py-2"
      data-testid="preview-toolbar"
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-medium">方案预览</span>
        <Tag color="blue" data-testid="file-name-tag">
          {fileName}
        </Tag>
      </div>
      <div className="flex items-center gap-2">
        {pageCount != null && (
          <span className="mr-2 text-sm text-gray-500" data-testid="page-count">
            共 {pageCount} 页
          </span>
        )}
        <Button
          icon={<ZoomOutOutlined />}
          size="small"
          disabled={zoomIndex <= 0}
          onClick={handleZoomOut}
          data-testid="zoom-out-btn"
        />
        <span className="min-w-[3rem] text-center text-sm" data-testid="zoom-level">
          {Math.round(currentZoom * 100)}%
        </span>
        <Button
          icon={<ZoomInOutlined />}
          size="small"
          disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          onClick={handleZoomIn}
          data-testid="zoom-in-btn"
        />
        <Button
          icon={<ExpandOutlined />}
          size="small"
          onClick={handleFitPage}
          data-testid="fit-page-btn"
          title="适合页面"
        />
      </div>
    </div>
  )
}
