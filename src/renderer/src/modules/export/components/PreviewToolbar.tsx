import { Button, Tag } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons'
import { useCallback } from 'react'

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]

interface PreviewToolbarProps {
  fileName: string
  pageCount?: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onFitPage: () => void
}

export function PreviewToolbar({
  fileName,
  pageCount,
  zoom,
  onZoomChange,
  onFitPage,
}: PreviewToolbarProps): React.JSX.Element {
  const handleZoomIn = useCallback(() => {
    const next = ZOOM_LEVELS.find((z) => z > zoom + 0.001)
    if (next != null) onZoomChange(next)
  }, [zoom, onZoomChange])

  const handleZoomOut = useCallback(() => {
    const next = [...ZOOM_LEVELS].reverse().find((z) => z < zoom - 0.001)
    if (next != null) onZoomChange(next)
  }, [zoom, onZoomChange])

  const canZoomIn = ZOOM_LEVELS.some((z) => z > zoom + 0.001)
  const canZoomOut = ZOOM_LEVELS.some((z) => z < zoom - 0.001)

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
          disabled={!canZoomOut}
          onClick={handleZoomOut}
          data-testid="zoom-out-btn"
        />
        <span className="min-w-[3rem] text-center text-sm" data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          icon={<ZoomInOutlined />}
          size="small"
          disabled={!canZoomIn}
          onClick={handleZoomIn}
          data-testid="zoom-in-btn"
        />
        <Button
          icon={<ExpandOutlined />}
          size="small"
          onClick={onFitPage}
          data-testid="fit-page-btn"
          title="适合页面"
        />
      </div>
    </div>
  )
}
