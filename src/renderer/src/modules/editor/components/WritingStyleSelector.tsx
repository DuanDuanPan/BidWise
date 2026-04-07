import { useCallback, useEffect, useMemo, useState } from 'react'
import { Select, message, Tooltip, Tag } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import type { WritingStyleTemplate, WritingStyleId } from '@shared/writing-style-types'

const FALLBACK_GENERAL: WritingStyleTemplate = {
  id: 'general',
  name: '通用文风',
  description: '专业清晰的通用技术写作规范',
  version: '1.0.0',
  toneGuidance: '',
  vocabularyRules: [],
  forbiddenWords: [],
  sentencePatterns: [],
  source: 'built-in',
}

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
        } else {
          setStyles([FALLBACK_GENERAL])
          setSelectedId('general')
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

  const options = useMemo(() => {
    const builtIn = styles.filter((s) => s.source === 'built-in')
    const company = styles.filter((s) => s.source === 'company')

    const result: {
      value: string
      label: string
      description: string
      source: string
      disabled?: boolean
    }[] = []

    for (const s of builtIn) {
      result.push({ value: s.id, label: s.name, description: s.description, source: s.source })
    }

    if (company.length > 0) {
      result.push({
        value: '__divider__',
        label: '',
        description: '',
        source: 'divider',
        disabled: true,
      })
      for (const s of company) {
        result.push({ value: s.id, label: s.name, description: s.description, source: s.source })
      }
    }

    return result
  }, [styles])

  return (
    <Select
      data-testid="writing-style-selector"
      aria-label="选择写作风格"
      value={selectedId}
      onChange={handleChange}
      loading={loading}
      size="small"
      variant="borderless"
      placement="bottomRight"
      prefix={<EditOutlined />}
      style={{ minWidth: 120 }}
      options={options}
      optionRender={(option) => {
        if (option.data.source === 'divider') {
          return <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
        }
        return (
          <Tooltip title={option.data.description as string} placement="left">
            <span data-testid={`writing-style-option-${option.data.value}`}>
              {option.data.label}
              {option.data.source === 'company' && (
                <Tag color="default" style={{ marginLeft: 8, fontSize: 12 }}>
                  自定义
                </Tag>
              )}
            </span>
          </Tooltip>
        )
      }}
    />
  )
}
