import { Modal, Button, Alert } from 'antd'
import { useRef, useEffect, useState, useCallback } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import {
  renderDocxPreview,
  clearPreview,
  getRenderedPageCount,
} from '@modules/export/lib/docx-preview-adapter'

interface ExportPreviewModalProps {
  open: boolean
  docxBase64: string | null
  fileName: string
  pageCount?: number
  error: string | null
  onClose: () => void
  onConfirmExport: () => void
  onRetry: () => void
}

export function ExportPreviewModal({
  open,
  docxBase64,
  fileName,
  pageCount,
  error,
  onClose,
  onConfirmExport,
  onRetry,
}: ExportPreviewModalProps): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [renderedPageCount, setRenderedPageCount] = useState<number | undefined>(pageCount)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !docxBase64 || !bodyRef.current) return

    const container = bodyRef.current
    setRenderError(null)
    clearPreview(container)
    renderDocxPreview(docxBase64, container)
      .then(() => {
        const count = getRenderedPageCount(container)
        if (count != null) setRenderedPageCount(count)
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : '文档预览渲染失败'
        setRenderError(msg)
      })
  }, [open, docxBase64])

  useEffect(() => {
    setRenderedPageCount(pageCount)
  }, [pageCount])

  const handleAfterClose = useCallback(() => {
    if (bodyRef.current) clearPreview(bodyRef.current)
    setZoom(1)
    setRenderedPageCount(undefined)
    setRenderError(null)
  }, [])

  const handleFitPage = useCallback(() => {
    const container = bodyRef.current
    if (!container) {
      setZoom(1)
      return
    }
    const content = container.firstElementChild as HTMLElement | null
    if (!content || content.offsetWidth <= 0) {
      setZoom(1)
      return
    }
    const fitZoom = container.clientWidth / content.offsetWidth
    setZoom(Math.max(0.5, Math.min(2, fitZoom)))
  }, [])

  const effectiveError = error ?? renderError
  const hasError = effectiveError != null
  const hasContent = docxBase64 != null && !hasError

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={handleAfterClose}
      width="95vw"
      style={{ top: 20 }}
      closable
      keyboard
      destroyOnClose={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} data-testid="back-to-edit-btn">
            返回编辑
          </Button>
          {hasContent && (
            <Button type="primary" onClick={onConfirmExport} data-testid="confirm-export-btn">
              确认导出
            </Button>
          )}
          {hasError && (
            <Button type="primary" onClick={onRetry} data-testid="retry-btn">
              重试
            </Button>
          )}
        </div>
      }
      data-testid="export-preview-modal"
    >
      {hasContent && (
        <>
          <PreviewToolbar
            fileName={fileName}
            pageCount={renderedPageCount}
            zoom={zoom}
            onZoomChange={setZoom}
            onFitPage={handleFitPage}
          />
          <div
            ref={bodyRef}
            className="overflow-auto"
            style={{
              height: 'calc(85vh - 120px)',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
            data-testid="docx-preview-container"
          />
        </>
      )}
      {hasError && (
        <div className="flex h-[60vh] items-center justify-center">
          <Alert
            type="error"
            showIcon
            message="预览生成失败"
            description={effectiveError}
            data-testid="preview-error-alert"
          />
        </div>
      )}
    </Modal>
  )
}
