import { describe, it, expect } from 'vitest'
import { createPlateEditor } from 'platejs/react'
import { editorPlugins } from '@modules/editor/plugins/editorPlugins'
import { serializeToMarkdown, deserializeFromMarkdown } from '@modules/editor/serializer'

function createTestEditor(): ReturnType<typeof createPlateEditor> {
  return createPlateEditor({ plugins: editorPlugins })
}

describe('@story-3-1 markdownSerializer', () => {
  describe('serializeToMarkdown', () => {
    it('should serialize empty editor to empty or whitespace-only string', () => {
      const editor = createTestEditor()
      const md = serializeToMarkdown(editor)
      // Empty editor produces empty string or zero-width space
      expect(md.replace(/[\u200B\s]/g, '')).toBe('')
    })
  })

  describe('deserializeFromMarkdown', () => {
    it('should deserialize heading', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '# Hello World')
      expect(nodes).toBeDefined()
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize bold and italic', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '**bold** and *italic*')
      expect(nodes).toBeDefined()
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize unordered list', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '- item 1\n- item 2\n- item 3')
      expect(nodes).toBeDefined()
      expect(nodes.length).toBeGreaterThan(0)
    })

    it('should deserialize empty markdown to paragraph nodes', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '')
      expect(nodes).toBeDefined()
    })

    it('should deserialize blockquote shape', () => {
      const editor = createTestEditor()
      const nodes = deserializeFromMarkdown(editor, '> guidance')
      expect(nodes).toBeDefined()
      expect(nodes).toEqual([{ type: 'blockquote', children: [{ text: 'guidance' }] }])
    })
  })

  describe('roundtrip', () => {
    it('should roundtrip headings', () => {
      const editor = createTestEditor()
      const source = '# Heading 1\n\n## Heading 2\n\n### Heading 3'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)
      expect(result).toContain('# Heading 1')
      expect(result).toContain('## Heading 2')
      expect(result).toContain('### Heading 3')
    })

    it('should roundtrip bold text', () => {
      const editor = createTestEditor()
      const source = '**bold text**'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)
      expect(result).toContain('**bold text**')
    })

    it('should roundtrip GFM tables', () => {
      const editor = createTestEditor()
      const source = '| 列1 | 列2 |\n| --- | --- |\n| A | B |'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)

      expect(result).toContain('| 列1 | 列2 |')
      expect(result).toMatch(/\|\s*A\s+\|\s*B\s+\|/)
    })

    it('should roundtrip ordered lists, H4 headings, and GFM inline formatting', () => {
      const editor = createTestEditor()
      const source =
        '#### 小节标题\n\n1. 第一步\n2. 第二步\n\n`行内代码` ~~删除线~~ **加粗** *斜体*'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)

      expect(result).toContain('#### 小节标题')
      expect(result).toContain('1. 第一步')
      expect(result).toContain('2. 第二步')
      expect(result).toContain('`行内代码`')
      expect(result).toContain('~~删除线~~')
      expect(result).toContain('**加粗**')
      expect(result).toMatch(/_斜体_|\*斜体\*/)
    })

    it('should roundtrip fenced code blocks', () => {
      const editor = createTestEditor()
      const source = '```ts\nconst bid = true\n```'
      const nodes = deserializeFromMarkdown(editor, source)
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)

      expect(result).toContain('```')
      expect(result).toContain('const bid = true')
    })

    it('should preserve a following chapter heading and guidance after generated tables', () => {
      const editor = createTestEditor()
      const source = [
        '## 建设目标',
        '',
        '本项目旨在构建航天液体火箭发动机关键组件特性联合计算与虚拟验证平台，实现关键组件从设计仿真到试验验证的全链路数据贯通，提升发动机研制的数字化和智能化水平。',
        '',
        '### 总体目标',
        '',
        '本项目以涡轮泵、推力室大喷管、减压阀等关键组件为研究对象，建立基于实做数据的特性联合计算与虚拟验证体系。具体建设目标如下：',
        '',
        '| 阶段 | 周期 | 核心目标 | 主要交付物 |',
        '|------|------|----------|------------|',
        '| 第一阶段 | 合同签订后2个月内 | 完成需求分析与系统架构设计，搭建基础数据平台，实现关键特性联合计算模块开发 | 需求分析报告、实施方案、数据平台基础架构 |',
        '| 第二阶段 | 合同签订后4个月内 | 完成试车/飞行/实做数据处理模块开发，部署基于实做数据的关键组件参数化重建模块 | 测试大纲、数据处理模块、参数化重建模块 |',
        '| 第三阶段 | 合同签订后6个月内 | 完成各类虚拟验证模块开发与集成，实现仿真与试验数据对比分析功能，完成系统联调测试 | 测试报告、用户使用手册、系统集成报告、项目总结报告 |',
        '',
        '### 量化指标体系',
        '',
        '| 指标类别 | 具体指标 | 量化要求 |',
        '|----------|----------|----------|',
        '| 数据处理能力 | 参数数量 | ≥100个 |',
        '| | 包络分析范围 | ≥1000次 |',
        '| | 飞行数据时长 | ≥2小时 |',
        '| | 偏差分析因素 | ≥20项 |',
        '| 计算精度 | 调整偏差与试车复现偏差 | <3% |',
        '| 虚拟验证能力 | 关键组件参数化重建种类 | ≥6种 |',
        '| | 模型参数数量 | ≥100个 |',
        '| 响应性能 | 系统登录认证响应时间 | <3秒 |',
        '| | 日常业务操作响应时间 | <3秒 |',
        '| | 百万级批量查询响应时间 | <5秒 |',
        '',
        '通过上述建设目标的实现，本项目将有效支撑航天液体火箭发动机关键组件的数字化研制，缩短研制周期，降低试验成本，提升产品质量可靠性。',
        '',
        '## 建设范围与内容',
        '',
        '> 界定本期建设范围和主要建设内容。',
      ].join('\n')

      const nodes = deserializeFromMarkdown(editor, source)
      expect(nodes.slice(-2)).toEqual([
        { type: 'h2', children: [{ text: '建设范围与内容' }] },
        { type: 'blockquote', children: [{ text: '界定本期建设范围和主要建设内容。' }] },
      ])
      editor.tf.setValue(nodes)
      const result = serializeToMarkdown(editor)

      expect(result).toContain('## 建设范围与内容')
      expect(result).toContain('\n> 界定本期建设范围和主要建设内容。')
      expect(result).not.toContain('## 建设范围与内容> 界定本期建设范围和主要建设内容。')
    })
  })
})
