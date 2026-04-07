import { useCallback, useEffect, useState } from 'react'
import { Select, message, Tooltip } from 'antd'
import type { WritingStyleTemplate, WritingStyleId } from '@shared/writing-style-types'

interface WritingStyleSelectorProps {
  projectId: string
}

export function WritingStyleSelector({ projectId }: WritingStyleSelectorProps): React.JSX.Element {
  const [styles, setStyles] = useState<WritingStyleTemplate[]>([])
  const [selectedId, setSelectedId] = useState<WritingStyleId>('general')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function init(): Promise<void> {
      setLoading(true)
      try {
        const [listRes, metaRes] = await Promise.all([
          window.api.writingStyleList(),
          window.api.documentGetMetadata({ projectId }),
        ])

        if (cancelled) return

        if (listRes.success) {
          setStyles(listRes.data.styles)

          const metaStyleId = metaRes.success ? metaRes.data.writingStyleId : undefined
          const validIds = new Set(listRes.data.styles.map((s) => s.id))
          setSelectedId(metaStyleId && validIds.has(metaStyleId) ? metaStyleId : 'general')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const handleChange = useCallback(
    async (styleId: WritingStyleId) => {
      const previousId = selectedId
      setSelectedId(styleId)
      const res = await window.api.writingStyleUpdateProject({ projectId, writingStyleId: styleId })
      if (res.success) {
        void message.info('新文风将在下次生成章节时生效')
      } else {
        setSelectedId(previousId)
        void message.error('文风切换失败，请重试')
      }
    },
    [projectId, selectedId]
  )

  return (
    <Select
      data-testid="writing-style-selector"
      value={selectedId}
      onChange={handleChange}
      loading={loading}
      size="small"
      style={{ minWidth: 120 }}
      options={styles.map((s) => ({
        value: s.id,
        label: (
          <Tooltip title={s.description} placement="left">
            <span>{s.name}</span>
          </Tooltip>
        ),
      }))}
    />
  )
}
