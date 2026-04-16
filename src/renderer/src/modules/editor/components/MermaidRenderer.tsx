import { useCallback, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { Spin } from 'antd'
import { fixArchitectureIcons } from '@shared/mermaid-types'
import { DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME } from './diagramPreview'

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'strict',
  logLevel: 'error',
})

/** Extract line number from Mermaid error messages (e.g. "Parse error on line 3:") */
function extractErrorLine(errorMsg: string): number | undefined {
  const match = errorMsg.match(/line\s+(\d+)/i)
  return match ? parseInt(match[1], 10) : undefined
}

interface MermaidRendererProps {
  source: string
  diagramId: string
  onRenderSuccess?: (svg: string) => void
  onRenderError?: (error: string, errorLine?: number) => void
}

const DEBOUNCE_MS = 500

export function MermaidRenderer({
  source,
  diagramId,
  onRenderSuccess,
  onRenderError,
}: MermaidRendererProps): React.JSX.Element {
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const renderCounterRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastSuccessSvg, setLastSuccessSvg] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [rendering, setRendering] = useState(false)

  const doRender = useCallback(
    async (src: string, token: number) => {
      if (!src.trim()) {
        setErrorMessage('')
        setRendering(false)
        return
      }

      const safeSrc = fixArchitectureIcons(src)
      setRendering(true)
      try {
        await mermaid.parse(safeSrc)
      } catch (err: unknown) {
        // Ignore stale renders
        if (token !== renderCounterRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMessage(msg)
        if (svgContainerRef.current) svgContainerRef.current.innerHTML = ''
        onRenderError?.(msg, extractErrorLine(msg))
        setRendering(false)
        return
      }

      // Ignore stale renders after parse
      if (token !== renderCounterRef.current) return

      try {
        const uniqueId = `mermaid-${diagramId}-${token}`
        const { svg } = await mermaid.render(uniqueId, safeSrc)

        // Ignore stale renders after render
        if (token !== renderCounterRef.current) return

        setLastSuccessSvg(svg)
        setErrorMessage('')
        setRendering(false)

        if (svgContainerRef.current) {
          svgContainerRef.current.innerHTML = svg
        }

        onRenderSuccess?.(svg)
      } catch (err: unknown) {
        if (token !== renderCounterRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMessage(msg)
        if (svgContainerRef.current) svgContainerRef.current.innerHTML = ''
        onRenderError?.(msg, extractErrorLine(msg))
        setRendering(false)
      }
    },
    [diagramId, onRenderSuccess, onRenderError]
  )

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      renderCounterRef.current += 1
      const token = renderCounterRef.current
      void doRender(source, token)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [source, doRender])

  // Update svg container when lastSuccessSvg changes (for initial or restored state)
  useEffect(() => {
    if (svgContainerRef.current && lastSuccessSvg && !errorMessage) {
      svgContainerRef.current.innerHTML = lastSuccessSvg
    }
  }, [lastSuccessSvg, errorMessage])

  return (
    <div data-testid="mermaid-renderer">
      {errorMessage && (
        <div
          className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
          data-testid="mermaid-error"
        >
          <span className="font-medium">语法错误：</span>
          {errorMessage}
        </div>
      )}
      {rendering && !errorMessage && (
        <div className="flex items-center justify-center py-4" data-testid="mermaid-loading">
          <Spin size="small" />
          <span className="ml-2 text-sm text-gray-400">渲染中...</span>
        </div>
      )}
      <div
        ref={svgContainerRef}
        className={DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME}
        data-testid="mermaid-svg-container"
      />
      {errorMessage && lastSuccessSvg && (
        <div
          className={`${DIAGRAM_PREVIEW_SVG_FRAME_CLASSNAME} mt-2 opacity-30`}
          data-testid="mermaid-stale-preview"
          dangerouslySetInnerHTML={{ __html: lastSuccessSvg }}
        />
      )}
    </div>
  )
}
