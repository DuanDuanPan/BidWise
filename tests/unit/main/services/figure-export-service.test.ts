import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockAccess = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

const mockSharpPng = vi.fn().mockReturnThis()
const mockSharpToBuffer = vi.fn()
const mockSharp = vi.fn(() => ({
  png: mockSharpPng,
  toBuffer: mockSharpToBuffer,
}))

vi.mock('sharp', () => ({
  default: (...args: unknown[]) => mockSharp(...args),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { figureExportService } from '@main/services/figure-export-service'

describe('@story-8-4 figureExportService.preprocessMarkdownForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSharpPng.mockReturnValue({ toBuffer: mockSharpToBuffer })
  })

  it('converts Mermaid SVG to PNG and replaces block with image ref', async () => {
    const markdown = [
      '# Title',
      '<!-- mermaid:id1:diagram.svg:系统架构图 -->',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      'Some text',
    ].join('\n')

    mockAccess.mockResolvedValue(undefined) // SVG exists
    mockReadFile.mockResolvedValue(Buffer.from('<svg></svg>'))
    mockSharpToBuffer.mockResolvedValue(Buffer.from('PNG'))
    mockWriteFile.mockResolvedValue(undefined)

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('![系统架构图](assets/diagram.png)')
    expect(result.processedMarkdown).not.toContain('```mermaid')
    expect(result.processedMarkdown).toContain('# Title')
    expect(result.processedMarkdown).toContain('Some text')
    expect(result.warnings).toHaveLength(0)
  })

  it('handles Mermaid SVG missing — placeholder + warning', async () => {
    const markdown = [
      '<!-- mermaid:id1:missing.svg:流程图 -->',
      '```mermaid',
      'graph TD; A-->B',
      '```',
    ].join('\n')

    mockAccess.mockRejectedValue(new Error('ENOENT'))

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('[图片未导出: assets/missing.png]')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Mermaid SVG 文件不存在')
  })

  it('handles Mermaid SVG conversion failure — placeholder + warning', async () => {
    const markdown = [
      '<!-- mermaid:id1:bad.svg:图表 -->',
      '```mermaid',
      'graph TD; A-->B',
      '```',
    ].join('\n')

    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('invalid'))
    mockSharpToBuffer.mockRejectedValue(new Error('SVG parse error'))

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('[图片未导出: assets/bad.png]')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Mermaid SVG 转 PNG 失败')
  })

  it('handles draw.io PNG missing — placeholder + warning', async () => {
    const markdown = ['<!-- drawio:id1:arch.drawio -->', '![架构图](assets/arch.png)'].join('\n')

    mockAccess.mockRejectedValue(new Error('ENOENT'))

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('[图片未导出: assets/arch.png]')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('draw.io PNG 文件不存在')
  })

  it('keeps draw.io block when PNG exists', async () => {
    const markdown = ['<!-- drawio:id1:arch.drawio -->', '![架构图](assets/arch.png)'].join('\n')

    mockAccess.mockResolvedValue(undefined) // PNG exists

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('<!-- drawio:id1:arch.drawio -->')
    expect(result.processedMarkdown).toContain('![架构图](assets/arch.png)')
    expect(result.warnings).toHaveLength(0)
  })

  it('handles old Mermaid format without caption', async () => {
    const markdown = ['<!-- mermaid:id1:flow.svg -->', '```mermaid', 'graph LR; X-->Y', '```'].join(
      '\n'
    )

    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('<svg></svg>'))
    mockSharpToBuffer.mockResolvedValue(Buffer.from('PNG'))
    mockWriteFile.mockResolvedValue(undefined)

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toContain('![](assets/flow.png)')
    expect(result.warnings).toHaveLength(0)
  })

  it('does not modify regular images', async () => {
    const markdown = ['# Title', '![photo](assets/photo.png)', 'Normal text.'].join('\n')

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    expect(result.processedMarkdown).toBe(markdown)
    expect(result.warnings).toHaveLength(0)
  })

  it('handles mixed document — draw.io + Mermaid + regular images', async () => {
    const markdown = [
      '# Chapter 1',
      '<!-- drawio:d1:design.drawio -->',
      '![设计图](assets/design.png)',
      '',
      '<!-- mermaid:m1:flow.svg:流程 -->',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      '![screenshot](assets/screenshot.png)',
    ].join('\n')

    // First access: draw.io PNG exists
    // Second access: mermaid SVG exists
    mockAccess.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('<svg></svg>'))
    mockSharpToBuffer.mockResolvedValue(Buffer.from('PNG'))
    mockWriteFile.mockResolvedValue(undefined)

    const result = await figureExportService.preprocessMarkdownForExport(markdown, '/project')

    // draw.io preserved
    expect(result.processedMarkdown).toContain('![设计图](assets/design.png)')
    // Mermaid replaced
    expect(result.processedMarkdown).toContain('![流程](assets/flow.png)')
    // Regular image untouched
    expect(result.processedMarkdown).toContain('![screenshot](assets/screenshot.png)')
    expect(result.warnings).toHaveLength(0)
  })
})
