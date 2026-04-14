import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMermaidParse = vi.fn()

vi.mock('mermaid', () => ({
  default: { parse: (...args: unknown[]) => mockMermaidParse(...args) },
}))

const {
  parseDiagramPlaceholders,
  replaceSkeletonWithDiagram,
  removeSkeletonPlaceholder,
  validateDrawioDiagram,
  validateMermaidDiagram,
  buildMermaidMarkdown,
  buildDrawioMarkdown,
  extractJsonObject,
} = await import('@main/services/diagram-validation-service')

const VALID_DRAWIO_XML = `<mxGraphModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" value="A" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="10" y="10" width="80" height="40" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`

describe('diagram-validation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseDiagramPlaceholders', () => {
    it('@p0 should parse a mermaid placeholder and produce skeleton', () => {
      const desc = Buffer.from('展示流程').toString('base64')
      const md = `正文段落\n\n%%DIAGRAM:mermaid:总体流程:${desc}%%\n\n更多正文`
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].type).toBe('mermaid')
      expect(result.placeholders[0].title).toBe('总体流程')
      expect(result.placeholders[0].description).toBe('展示流程')
      expect(result.placeholders[0].assetFileName).toMatch(/^mermaid-[a-f0-9]{8}\.svg$/)
      expect(result.markdownWithSkeletons).toContain('> [图表生成中] 总体流程')
      expect(result.markdownWithSkeletons).not.toContain('%%DIAGRAM:')
    })

    it('@p0 should parse a drawio placeholder', () => {
      const desc = Buffer.from('架构图').toString('base64')
      const md = `%%DIAGRAM:drawio:系统架构:${desc}%%`
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].type).toBe('drawio')
      expect(result.placeholders[0].assetFileName).toMatch(/^diagram-[a-f0-9]{8}\.drawio$/)
    })

    it('@p0 should parse multiple placeholders', () => {
      const d1 = Buffer.from('desc1').toString('base64')
      const d2 = Buffer.from('desc2').toString('base64')
      const md = `%%DIAGRAM:mermaid:图一:${d1}%%\n中间\n%%DIAGRAM:drawio:图二:${d2}%%`
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(2)
      expect(result.placeholders[0].title).toBe('图一')
      expect(result.placeholders[1].title).toBe('图二')
    })

    it('@p0 should return empty array when no placeholders', () => {
      const result = parseDiagramPlaceholders('纯文本内容\n\n## 子标题')
      expect(result.placeholders).toHaveLength(0)
      expect(result.markdownWithSkeletons).toBe('纯文本内容\n\n## 子标题')
    })

    it('@p1 should ignore malformed placeholders', () => {
      const md = '%%DIAGRAM:unknown:title:abc%%\n%%DIAGRAM:mermaid%%'
      const result = parseDiagramPlaceholders(md)
      expect(result.placeholders).toHaveLength(0)
    })
  })

  describe('replaceSkeletonWithDiagram', () => {
    it('@p0 should replace skeleton marker with diagram markdown', () => {
      const id = 'abc-123'
      const md = `正文\n> [图表生成中] 标题 {#diagram-placeholder:${id}}\n尾部`
      const result = replaceSkeletonWithDiagram(md, id, '```mermaid\ngraph TD\n```')
      expect(result).toBe('正文\n```mermaid\ngraph TD\n```\n尾部')
    })

    it('@p0 should leave markdown unchanged if placeholder not found', () => {
      const md = '正文\n尾部'
      const result = replaceSkeletonWithDiagram(md, 'nonexistent', '图表')
      expect(result).toBe('正文\n尾部')
    })
  })

  describe('removeSkeletonPlaceholder', () => {
    it('@p0 should remove the skeleton line', () => {
      const id = 'abc-123'
      const md = `正文\n> [图表生成中] 标题 {#diagram-placeholder:${id}}\n尾部`
      const result = removeSkeletonPlaceholder(md, id)
      expect(result).toBe('正文\n尾部')
    })
  })

  describe('validateDrawioDiagram', () => {
    it('@p0 should accept valid draw.io XML', () => {
      const result = validateDrawioDiagram(VALID_DRAWIO_XML)
      expect(result.valid).toBe(true)
    })

    it('@p0 should reject XML without mxGraphModel root', () => {
      const result = validateDrawioDiagram('<div>not a diagram</div>')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('mxGraphModel')
    })

    it('@p0 should reject XML without root node', () => {
      const result = validateDrawioDiagram('<mxGraphModel><notroot /></mxGraphModel>')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('root')
    })

    it('@p0 should reject when fewer than 2 mxCell nodes', () => {
      const xml = '<mxGraphModel><root><mxCell id="0" /></root></mxGraphModel>'
      const result = validateDrawioDiagram(xml)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('不足')
    })

    it('@p0 should reject when more than 50 mxCell nodes', () => {
      const cells = Array.from({ length: 55 }, (_, i) => `<mxCell id="${i}" />`).join('')
      const xml = `<mxGraphModel><root>${cells}</root></mxGraphModel>`
      const result = validateDrawioDiagram(xml)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('过多')
      expect(result.error).toContain('55')
    })

    it('@p0 should reject XML without root cells (id=0/1)', () => {
      const xml = `<mxGraphModel><root>
        <mxCell id="10" /><mxCell id="11" /><mxCell id="12" />
      </root></mxGraphModel>`
      const result = validateDrawioDiagram(xml)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('基础根')
    })

    it('@p1 should reject malformed XML gracefully', () => {
      const result = validateDrawioDiagram('not xml at all <<>>')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('validateMermaidDiagram', () => {
    it('@p0 should return valid when mermaid.parse succeeds', async () => {
      mockMermaidParse.mockResolvedValueOnce(true)
      const result = await validateMermaidDiagram('graph TD\nA-->B')
      expect(result.valid).toBe(true)
    })

    it('@p0 should return error when mermaid.parse throws', async () => {
      mockMermaidParse.mockRejectedValueOnce(new Error('Parse error at line 2'))
      const result = await validateMermaidDiagram('invalid diagram')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Parse error')
    })
  })

  describe('buildMermaidMarkdown', () => {
    it('@p0 should produce comment + fenced mermaid block', () => {
      const result = buildMermaidMarkdown({
        diagramId: 'id-1',
        assetFileName: 'mermaid-abc.svg',
        caption: '流程图',
        source: 'graph TD\nA-->B',
      })
      expect(result).toContain('<!-- mermaid:id-1:mermaid-abc.svg:')
      expect(result).toContain('```mermaid')
      expect(result).toContain('graph TD\nA-->B')
    })
  })

  describe('buildDrawioMarkdown', () => {
    it('@p0 should produce comment + image reference', () => {
      const result = buildDrawioMarkdown({
        diagramId: 'id-2',
        assetFileName: 'diagram-abc.drawio',
        caption: '架构图',
      })
      expect(result).toContain('<!-- drawio:id-2:diagram-abc.drawio -->')
      expect(result).toContain('![架构图](assets/diagram-abc.png)')
    })
  })

  describe('extractJsonObject', () => {
    it('@p0 should extract JSON from mixed content', () => {
      const content = 'Some text before {"pass":true,"issues":[]} and after'
      const result = extractJsonObject<{ pass: boolean }>(content)
      expect(result).toEqual({ pass: true, issues: [] })
    })

    it('@p0 should return null when no braces', () => {
      expect(extractJsonObject('no json here')).toBeNull()
    })

    it('@p0 should return null for malformed JSON', () => {
      expect(extractJsonObject('{invalid json}')).toBeNull()
    })

    it('@p1 should handle nested objects', () => {
      const content = '{"outer":{"inner":1}}'
      const result = extractJsonObject<{ outer: { inner: number } }>(content)
      expect(result).toEqual({ outer: { inner: 1 } })
    })
  })
})
