import { describe, it, expect } from 'vitest'
import { extractRenderableParagraphs, createContentDigest } from '@shared/chapter-markdown'

describe('@story-3-5 extractRenderableParagraphs', () => {
  it('@p0 should extract plain-text paragraphs with sequential indices', () => {
    const md = '第一段正文内容\n\n第二段正文内容\n\n��三段正文内容'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(3)
    expect(result[0].paragraphIndex).toBe(0)
    expect(result[0].text).toBe('第一段正文内容')
    expect(result[1].paragraphIndex).toBe(1)
    expect(result[2].paragraphIndex).toBe(2)
  })

  it('@p0 should extract list items as annotatable blocks', () => {
    const md = '- \u5217\u8868\u9879\u4e00\n- \u5217\u8868\u9879\u4e8c\n* \u5217\u8868\u9879\u4e09'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(3)
    expect(result[0].text).toBe('- \u5217\u8868\u9879\u4e00')
    expect(result[1].text).toBe('- \u5217\u8868\u9879\u4e8c')
    expect(result[2].text).toBe('* \u5217\u8868\u9879\u4e09')
  })

  it('@p0 should skip headings', () => {
    const md = '## 子标题\n\n正文段落'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('正文段落')
  })

  it('@p0 should skip blank lines', () => {
    const md = '\u6bb5\u843d\u4e00\n\n\n\n\u6bb5\u843d\u4e8c'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(2)
  })

  it('@p0 should skip guidance blockquotes', () => {
    const md = '> 这是编写指导\n\n正文段落'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('正文段落')
  })

  it('@p0 should skip fenced code blocks', () => {
    const md = '正文前\n\n```python\nprint("hello")\n```\n\n正文后'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('正文前')
    expect(result[1].text).toBe('正文后')
  })

  it('@p0 should compute digest for each paragraph', () => {
    const md = '段落内容'
    const result = extractRenderableParagraphs(md)
    expect(result[0].digest).toBe(createContentDigest('段落内容'))
    expect(result[0].digest).toHaveLength(16)
  })

  it('@p0 should compute digests from rendered plain text instead of raw markdown syntax', () => {
    const md = '- **API** 网关访问 [`/health`](https://example.com/health)'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe(md)
    expect(result[0].digest).toBe(createContentDigest('API 网关访问 /health'))
  })

  it('@p1 should handle mixed content correctly', () => {
    const md = [
      '## 产品架构',
      '',
      '> 请描述系统架构',
      '',
      '本系统采用微服务架构，包含以下核心组件：',
      '',
      '- API 网关',
      '- 用户服务',
      '- 订单服务',
      '',
      '```json',
      '{"version": "1.0"}',
      '```',
      '',
      '以上组件通过消息队列通信。',
    ].join('\n')
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(5)
    expect(result[0].text).toBe(
      '\u672c\u7cfb\u7edf\u91c7\u7528\u5fae\u670d\u52a1\u67b6\u6784\uff0c\u5305\u542b\u4ee5\u4e0b\u6838\u5fc3\u7ec4\u4ef6\uff1a'
    )
    expect(result[1].text).toBe('- API 网关')
    expect(result[2].text).toBe('- 用户服务')
    expect(result[3].text).toBe('- 订单服务')
    expect(result[4].text).toBe('以上组件通过消息队列通信。')
  })

  it('@p1 should return empty array for empty content', () => {
    expect(extractRenderableParagraphs('')).toEqual([])
    expect(extractRenderableParagraphs('   \n\n  ')).toEqual([])
  })

  it('@p1 should handle tilde fence blocks', () => {
    const md = '正文\n\n~~~\nskipped\n~~~\n\n后续'
    const result = extractRenderableParagraphs(md)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('正文')
    expect(result[1].text).toBe('后续')
  })
})
