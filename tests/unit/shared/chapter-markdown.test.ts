import { describe, it, expect } from 'vitest'
import {
  extractRenderableParagraphs,
  createContentDigest,
  sanitizeGeneratedChapterMarkdown,
  normalizeGeneratedHeadingLevels,
} from '@shared/chapter-markdown'

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

  it('@p1 should strip a duplicated leading chapter heading from generated content', () => {
    const result = sanitizeGeneratedChapterMarkdown('## 系统架构设计\n\n### 总体架构\n\n正文内容', {
      title: '系统架构设计',
      level: 2,
      occurrenceIndex: 0,
    })

    expect(result).toBe('### 总体架构\n\n正文内容')
  })

  it('@p1 should keep the first heading when it is not the current chapter title', () => {
    const result = sanitizeGeneratedChapterMarkdown('### 总体架构\n\n正文内容', {
      title: '系统架构设计',
      level: 2,
      occurrenceIndex: 0,
    })

    expect(result).toBe('### 总体架构\n\n正文内容')
  })
})

describe('normalizeGeneratedHeadingLevels', () => {
  it('@p0 should not modify content when heading levels are already within valid range', () => {
    const md = '### 子章节一\n\n内容\n\n#### 子子章节\n\n更多内容'
    const result = normalizeGeneratedHeadingLevels(md, 2)
    expect(result).toBe(md)
  })

  it('@p0 should shift H1/H2 headings to H4 when target is H3', () => {
    const md = '## 设计理念与总体原则\n\n内容\n\n### C/S端架构设计\n\n更多内容'
    const result = normalizeGeneratedHeadingLevels(md, 3)
    // offset = (3+1) - 2 = +2; H2→H4, H3→clamp(5,4)=H4
    expect(result).toBe('#### 设计理念与总体原则\n\n内容\n\n#### C/S端架构设计\n\n更多内容')
  })

  it('@p0 should shift H1 headings when target is H2', () => {
    const md = '# 子章节\n\n内容\n\n## 子子章节\n\n更多内容'
    const result = normalizeGeneratedHeadingLevels(md, 2)
    // offset = (2+1) - 1 = +2; H1→H3, H2→H4
    expect(result).toBe('### 子章节\n\n内容\n\n#### 子子章节\n\n更多内容')
  })

  it('@p0 should clamp all headings to H4 when target is H4', () => {
    const md = '## 子章节\n\n内容\n\n### 子子章节\n\n更多内容'
    const result = normalizeGeneratedHeadingLevels(md, 4)
    // offset = (4+1) - 2 = +3; H2→clamp(5,4)=H4, H3→clamp(6,4)=H4
    // maxLevel = min(4+2, 4) = 4
    expect(result).toBe('#### 子章节\n\n内容\n\n#### 子子章节\n\n更多内容')
  })

  it('@p0 should handle mixed heading levels with correct offset', () => {
    const md = '# 一级\n\n## 二级\n\n### 三级\n\n内容'
    const result = normalizeGeneratedHeadingLevels(md, 2)
    // offset = (2+1) - 1 = +2; H1→H3, H2→H4, H3→clamp(5,4)=H4
    expect(result).toBe('### 一级\n\n#### 二级\n\n#### 三级\n\n内容')
  })

  it('@p0 should not modify headings inside fenced code blocks', () => {
    const md = '## 子章节\n\n```markdown\n# 代码中的标题\n## 另一个\n```\n\n### 正文子节'
    const result = normalizeGeneratedHeadingLevels(md, 3)
    // offset = (3+1) - 2 = +2; Only non-fenced headings shift
    expect(result).toBe(
      '#### 子章节\n\n```markdown\n# 代码中的标题\n## 另一个\n```\n\n#### 正文子节'
    )
  })

  it('@p1 should return content unchanged when there are no headings', () => {
    const md = '纯文本内容\n\n- 列表项\n- 另一项'
    const result = normalizeGeneratedHeadingLevels(md, 3)
    expect(result).toBe(md)
  })

  it('@p1 should handle empty content', () => {
    expect(normalizeGeneratedHeadingLevels('', 2)).toBe('')
  })

  it('@p0 invariant: all headings within allowed range after normalization', () => {
    // Reproduce the actual bug: H3 target with H1/H2 AI output including 小结
    const md = [
      '## 设计理念与总体原则',
      '内容一',
      '## 技术架构设计原则',
      '### C/S端架构设计',
      '内容二',
      '## 小结',
      '总结内容',
    ].join('\n')

    const result = normalizeGeneratedHeadingLevels(md, 3)
    const lines = result.split('\n')
    const headingRe = /^(#{1,4})\s+(.+?)\s*$/
    for (const line of lines) {
      const match = headingRe.exec(line)
      if (match) {
        const level = match[1].length
        expect(level).toBeGreaterThanOrEqual(4) // targetLevel + 1 = 4
        expect(level).toBeLessThanOrEqual(4) // min(targetLevel + 2, 4) = 4
      }
    }
  })

  it('@p0 e2e: sanitize + normalize together should fix AI output with wrong levels', () => {
    // Simulates actual bug: AI generates H1 title echo + H2 sub-headings for an H3 chapter
    const aiOutput = '# 架构设计原则\n\n## 设计理念\n\n内容段落\n\n## 技术选型\n\n选型内容'
    const target = { title: '架构设计原则', level: 3 as const, occurrenceIndex: 0 }

    const deduped = sanitizeGeneratedChapterMarkdown(aiOutput, target)
    const normalized = normalizeGeneratedHeadingLevels(deduped, target.level)

    expect(normalized).toBe('#### 设计理念\n\n内容段落\n\n#### 技术选型\n\n选型内容')
  })
})
