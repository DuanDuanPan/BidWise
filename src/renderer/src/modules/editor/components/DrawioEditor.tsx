import { useCallback, useEffect, useRef } from 'react'
import { message } from 'antd'
import type { DrawioMessageIn, DrawioMessageOut } from '@shared/drawio-types'

const DRAWIO_EMBED_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&stealth=1&pwa=0'
const DRAWIO_ORIGIN = 'https://embed.diagrams.net'

interface DrawioEditorProps {
  xml: string
  projectId: string
  diagramId: string
  assetFileName: string
  onSave: (xml: string, pngBase64: string) => Promise<boolean>
  onExit: () => void
}

export function DrawioEditor({ xml, onSave, onExit }: DrawioEditorProps): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingXmlRef = useRef<string>('')
  const hasSavedRef = useRef(false)

  const postToDrawio = useCallback((msg: DrawioMessageOut) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN)
  }, [])

  useEffect(() => {
    const handleMessage = async (event: MessageEvent): Promise<void> => {
      if (event.origin !== DRAWIO_ORIGIN) return

      let parsed: DrawioMessageIn
      try {
        parsed = JSON.parse(event.data as string) as DrawioMessageIn
      } catch {
        return
      }

      switch (parsed.event) {
        case 'init':
          postToDrawio({ action: 'load', xml: xml || '' })
          break

        case 'save':
          if (parsed.xml) {
            pendingXmlRef.current = parsed.xml
            postToDrawio({ action: 'export', format: 'png', spin: true, scale: 2 })
          }
          break

        case 'export':
          if (parsed.data && pendingXmlRef.current) {
            const pngBase64 = parsed.data.replace(/^data:image\/png;base64,/, '')
            const success = await onSave(pendingXmlRef.current, pngBase64)
            if (success) {
              hasSavedRef.current = true
            } else {
              void message.error('图表保存失败，请重试')
            }
          }
          break

        case 'exit':
          if (parsed.modified && !hasSavedRef.current) {
            // draw.io embed mode handles discard confirmation internally
          }
          hasSavedRef.current = false
          onExit()
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [xml, postToDrawio, onSave, onExit])

  return (
    <iframe
      ref={iframeRef}
      src={DRAWIO_EMBED_URL}
      allow="clipboard-read; clipboard-write"
      className="w-full border-0"
      style={{ height: 500 }}
      title="draw.io 编辑器"
      data-testid="drawio-iframe"
    />
  )
}
