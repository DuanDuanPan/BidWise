import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMermaidRuntimeValidate = vi.fn()

vi.mock('@main/services/diagram-runtime/mermaid-runtime-client', () => ({
  mermaidRuntimeClient: {
    validate: (...args: unknown[]) => mockMermaidRuntimeValidate(...args),
  },
}))

const {
  buildDiagramFailureMarkdown,
  buildAiDiagramMarkdown,
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
    mockMermaidRuntimeValidate.mockReset()
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

    it('@p0 should parse wrapped base64 descriptions from chapter prompt output', () => {
      const desc = Buffer.from('展示自动生成模块与外部系统集成关系').toString('base64')
      const wrappedDesc = `${desc.slice(0, 12)}\n${desc.slice(12)}`
      const md = `%%DIAGRAM:mermaid:自动生成模块集成架构图:base64(${wrappedDesc})%%`
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].title).toBe('自动生成模块集成架构图')
      expect(result.placeholders[0].description).toBe('展示自动生成模块与外部系统集成关系')
      expect(result.markdownWithSkeletons).not.toContain('%%DIAGRAM:')
    })

    it('@p1 should fall back to raw wrapped description when content is not base64', () => {
      const md = '%%DIAGRAM:drawio:系统部署图:base64(应用服务到数据库的调用链路)%%'
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].description).toBe('应用服务到数据库的调用链路')
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

    it('@p0 should repair an unclosed placeholder line and keep parsing later diagrams', () => {
      const d1 = Buffer.from('展示系统逻辑架构').toString('base64')
      const brokenLine =
        '%%DIAGRAM:mermaid:自动生成模块架构图:' +
        '展示自动生成模块与外部系统集成，包含模型自动生成引擎、仿真自动执行引擎、报告自动生成引擎、数据交换接口层:' +
        Buffer.from('flowchart TD\nA[自动生成模块] --> B[外部系统]').toString('base64')
      const md = `%%DIAGRAM:mermaid:系统逻辑架构图:${d1}%%\n正文\n${brokenLine}`

      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(2)
      expect(result.placeholders[0].title).toBe('系统逻辑架构图')
      expect(result.placeholders[1].title).toBe('自动生成模块架构图')
      expect(result.placeholders[1].description).toBe(
        '展示自动生成模块与外部系统集成，包含模型自动生成引擎、仿真自动执行引擎、报告自动生成引擎、数据交换接口层'
      )
      expect(result.markdownWithSkeletons).not.toContain('%%DIAGRAM:')
      expect(result.markdownWithSkeletons).toContain('> [图表生成中] 系统逻辑架构图')
      expect(result.markdownWithSkeletons).toContain('> [图表生成中] 自动生成模块架构图')
    })

    it('@p1 should strip a trailing base64 suffix from hybrid descriptions', () => {
      const encodedDsl = Buffer.from('flowchart LR\nA --> B').toString('base64')
      const md = `%%DIAGRAM:mermaid:自动生成模块架构图:展示模块与外部系统集成:${encodedDsl}%%`

      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].description).toBe('展示模块与外部系统集成')
    })

    it('@p0 should return empty array when no placeholders', () => {
      const result = parseDiagramPlaceholders('纯文本内容\n\n## 子标题')
      expect(result.placeholders).toHaveLength(0)
      expect(result.markdownWithSkeletons).toBe('纯文本内容\n\n## 子标题')
    })

    it('@p0 @story-3-10 should parse a skill placeholder and produce ai-diagram asset name', () => {
      const desc = Buffer.from('展示系统架构分层').toString('base64')
      const md = `%%DIAGRAM:skill:系统架构图:${desc}%%`
      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].type).toBe('skill')
      expect(result.placeholders[0].title).toBe('系统架构图')
      expect(result.placeholders[0].description).toBe('展示系统架构分层')
      expect(result.placeholders[0].assetFileName).toMatch(/^ai-diagram-[a-f0-9]{8}\.svg$/)
    })

    it('@p1 should normalize non-standard type to mermaid', () => {
      const md = '%%DIAGRAM:C4Container:系统架构图:abc%%'
      const result = parseDiagramPlaceholders(md)
      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].type).toBe('mermaid')
    })

    it('@p1 should ignore truly malformed placeholders', () => {
      // No title/description fields at all
      const md = '%%DIAGRAM:mermaid%%'
      const result = parseDiagramPlaceholders(md)
      expect(result.placeholders).toHaveLength(0)
    })

    it('@p0 should fall back to title when description is truncated base64', () => {
      // Simulate LLM-emitted base64 truncated mid-UTF-8 (drops the last Chinese byte).
      const fullBytes = Buffer.from('展示自动生成模块的集成链路架构图', 'utf-8')
      const truncatedBytes = fullBytes.subarray(0, fullBytes.length - 1)
      const truncatedBase64 = truncatedBytes.toString('base64').replace(/=+$/, '')
      const md = `%%DIAGRAM:skill:自动生成模块集成链路架构:${truncatedBase64}%%`

      const result = parseDiagramPlaceholders(md)

      expect(result.placeholders).toHaveLength(1)
      expect(result.placeholders[0].description).toBe('自动生成模块集成链路架构')
      expect(result.placeholders[0].description).not.toMatch(/^[A-Za-z0-9+/=]+$/)
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
    it('@p0 should return valid when the isolated runtime validates successfully', async () => {
      mockMermaidRuntimeValidate.mockResolvedValueOnce({ valid: true })
      const result = await validateMermaidDiagram('graph TD\nA-->B')
      expect(result.valid).toBe(true)
      expect(mockMermaidRuntimeValidate).toHaveBeenCalledWith('graph TD\nA-->B')
    })

    it('@p0 should normalize recoverable declaration ordering before runtime validation', async () => {
      mockMermaidRuntimeValidate.mockResolvedValueOnce({ valid: true })

      const result = await validateMermaidDiagram(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'classDef primary fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333',
          'graph TB',
          'A[应用层]:::primary --> B[服务层]:::primary',
        ].join('\n')
      )

      expect(result).toEqual({ valid: true })
      expect(mockMermaidRuntimeValidate).toHaveBeenCalledWith(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'graph TB',
          'classDef primary fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333',
          'A[应用层]:::primary --> B[服务层]:::primary',
        ].join('\n')
      )
    })

    it('@p1 should preserve runtime validation failures returned by the isolated runtime', async () => {
      mockMermaidRuntimeValidate.mockResolvedValueOnce({
        valid: false,
        error: 'Parse error at line 2',
      })

      const result = await validateMermaidDiagram('graph TD\nA -->')

      expect(result).toEqual({
        valid: false,
        error: 'Parse error at line 2',
      })
    })

    it('@p0 should reject mermaid source without a supported diagram declaration', async () => {
      const result = await validateMermaidDiagram(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'classDef primary fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333',
          'A[应用层]:::primary --> B[服务层]:::primary',
        ].join('\n')
      )

      expect(result).toEqual({
        valid: false,
        error:
          'Mermaid 缺少图表类型声明；请在 init 之后以 flowchart/graph、sequenceDiagram、classDiagram、stateDiagram-v2、architecture-beta、gantt、C4Context、C4Container、C4Component、C4Deployment、block-beta 开头。',
      })
      expect(mockMermaidRuntimeValidate).not.toHaveBeenCalled()
    })

    it('@p1 should accept architecture-beta declarations as valid supported mermaid syntax', async () => {
      mockMermaidRuntimeValidate.mockResolvedValueOnce({ valid: true })

      const result = await validateMermaidDiagram(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'architecture-beta',
          'group client(cloud)[客户端]',
          'service ui(server)[BidWise UI] in client',
        ].join('\n')
      )

      expect(result).toEqual({ valid: true })
      expect(mockMermaidRuntimeValidate).toHaveBeenCalledWith(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'architecture-beta',
          'group client(cloud)[客户端]',
          'service ui(server)[BidWise UI] in client',
        ].join('\n')
      )
    })

    it('@p0 should auto-fix unsupported architecture-beta icons and forward to runtime', async () => {
      mockMermaidRuntimeValidate.mockResolvedValueOnce({ valid: true })

      const result = await validateMermaidDiagram(
        [
          "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
          'architecture-beta',
          'group infra["基础设施层"]',
          'service gw(gateway)["安全网关"] in infra',
          'service db(database)["数据库"] in infra',
        ].join('\n')
      )

      expect(result.valid).toBe(true)
      // Should have forwarded to runtime with gateway replaced by internet
      expect(mockMermaidRuntimeValidate).toHaveBeenCalledOnce()
      const passedSource = mockMermaidRuntimeValidate.mock.calls[0][0] as string
      expect(passedSource).toContain('service gw(internet)')
      expect(passedSource).not.toContain('gateway')
    })

    it('@p0 should mark runtime bootstrap failures as infrastructure errors', async () => {
      mockMermaidRuntimeValidate.mockRejectedValueOnce(new Error('Mermaid runtime unavailable'))

      const result = await validateMermaidDiagram('graph TD\nA --> B')

      expect(result).toEqual({
        valid: false,
        error: 'Mermaid runtime unavailable',
        failureKind: 'infrastructure',
      })
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

  describe('buildAiDiagramMarkdown', () => {
    it('@p0 @story-3-10 should produce ai-diagram comment + image reference', () => {
      const result = buildAiDiagramMarkdown({
        diagramId: 'id-3',
        assetFileName: 'ai-diagram-abc12345.svg',
        caption: '系统架构图',
        prompt: '展示系统架构分层',
        style: 'flat-icon',
        diagramType: 'architecture',
      })
      expect(result).toContain('<!-- ai-diagram:id-3:ai-diagram-abc12345.svg:')
      expect(result).toContain(':flat-icon:architecture -->')
      expect(result).toContain('![系统架构图](assets/ai-diagram-abc12345.svg)')
    })
  })

  describe('buildDiagramFailureMarkdown', () => {
    it('@p0 should produce structured comment + visible failure note', () => {
      const result = buildDiagramFailureMarkdown({
        type: 'mermaid',
        diagramId: 'test-id-1',
        assetFileName: 'mermaid-test1234.svg',
        caption: '系统集成架构图',
        description: '描述系统集成架构',
        style: '',
        diagramType: 'mermaid',
        error: 'Parse error at line 2',
      })

      expect(result).toContain('<!-- ai-diagram-failed:test-id-1:mermaid-test1234.svg:')
      expect(result).toContain('> [图表生成失败] 系统集成架构图（mermaid）: Parse error at line 2')
      // Verify prompt is encoded in comment
      expect(result).toContain(encodeURIComponent('描述系统集成架构'))
    })

    it('@p0 @story-3-10 should produce skill type in failure markdown with full context', () => {
      const result = buildDiagramFailureMarkdown({
        type: 'skill',
        diagramId: 'test-id-2',
        assetFileName: 'ai-diagram-test5678.svg',
        caption: '部署拓扑图',
        description: '展示系统部署拓扑',
        style: 'flat-icon',
        diagramType: 'architecture',
        error: 'SVG validation failed',
      })

      expect(result).toContain('<!-- ai-diagram-failed:test-id-2:ai-diagram-test5678.svg:')
      expect(result).toContain(':flat-icon:architecture:')
      expect(result).toContain('> [图表生成失败] 部署拓扑图（skill）: SVG validation failed')
      expect(result).toContain(encodeURIComponent('展示系统部署拓扑'))
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
