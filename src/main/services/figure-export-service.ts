import { join, basename, extname } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import sharp from 'sharp'

// Mermaid comment: <!-- mermaid:{diagramId}:{assetFileName}:{encodedCaption?} -->
const MERMAID_COMMENT_RE = /^<!--\s*mermaid:([^:]+):([^:>]+?)(?::([^>]*?))?\s*-->\s*$/

// draw.io comment: <!-- drawio:{diagramId}:{assetFileName} -->
const DRAWIO_COMMENT_RE = /^<!--\s*drawio:([^:]+):([^>]+?)\s*-->\s*$/

// AI diagram comment: <!-- ai-diagram:id:file:caption[:prompt:style:type] -->
const AI_DIAGRAM_COMMENT_RE =
  /^<!--\s*ai-diagram:([^:]+):([^:>]+?)(?::([^:]*))?(?::(?:[^>]*?))?\s*-->\s*$/

// SVG image reference: ![caption](assets/xxx.svg)
const SVG_IMAGE_REF_RE = /^!\[((?:[^\]\\]|\\.)*)\]\(assets\/(.+?\.svg)\)\s*$/

// Standard image reference: ![caption](path) — allows \] escapes in alt text
const IMAGE_REF_RE = /^!\[((?:[^\]\\]|\\.)*)\]\(([^)]+)\)\s*$/

// Fenced code block start
const FENCED_CODE_START_RE = /^(`{3,}|~{3,})(\w*)\s*$/

function isValidAssetFileName(assetFileName: string): boolean {
  return (
    assetFileName === basename(assetFileName) &&
    !assetFileName.includes('..') &&
    !assetFileName.includes('\\')
  )
}

function escapeMarkdownAlt(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function safeDecodeURIComponent(encoded: string): { value: string; error?: string } {
  try {
    return { value: decodeURIComponent(encoded) }
  } catch {
    return { value: encoded, error: `URI 解码失败: ${encoded}` }
  }
}

function assetBaseName(assetFileName: string, ext: string): string {
  const b = basename(assetFileName)
  if (b.endsWith(ext)) {
    return b.slice(0, -ext.length)
  }
  return b.replace(extname(b), '')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function convertSvgToPng(svgPath: string, pngPath: string): Promise<void> {
  const svgBuffer = await readFile(svgPath)
  const pngBuffer = await sharp(svgBuffer, { density: 300 }).png().toBuffer()
  await writeFile(pngPath, pngBuffer)
}

export interface PreprocessResult {
  processedMarkdown: string
  warnings: string[]
}

async function preprocessMarkdownForExport(
  markdown: string,
  projectPath: string
): Promise<PreprocessResult> {
  const lines = markdown.split('\n')
  const result: string[] = []
  const warnings: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Check for Mermaid comment
    const mermaidMatch = MERMAID_COMMENT_RE.exec(line)
    if (mermaidMatch) {
      const assetFileName = mermaidMatch[2]

      if (!isValidAssetFileName(assetFileName)) {
        warnings.push(`Mermaid 资产文件名非法 (路径遍历): ${assetFileName}`)
        result.push(`[图片未导出: ${assetFileName}]`)
        i++
        // Skip the fenced code block that follows the rejected comment
        if (i < lines.length) {
          const fenceMatch = FENCED_CODE_START_RE.exec(lines[i])
          if (fenceMatch) {
            const fenceChar = fenceMatch[1][0]
            const fenceLen = fenceMatch[1].length
            i++ // skip opening fence
            while (i < lines.length) {
              const closingRe = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`)
              if (closingRe.test(lines[i])) {
                i++ // skip closing fence
                break
              }
              i++
            }
          }
        }
        continue
      }

      const encodedCaption = mermaidMatch[3] ?? ''
      let caption = ''
      if (encodedCaption) {
        const decoded = safeDecodeURIComponent(encodedCaption)
        caption = decoded.value
        if (decoded.error) {
          warnings.push(decoded.error)
        }
      }
      const assetBase = assetBaseName(assetFileName, '.svg')
      const pngRelPath = `assets/${assetBase}.png`
      const svgAbsPath = join(projectPath, 'assets', assetFileName)
      const pngAbsPath = join(projectPath, 'assets', `${assetBase}.png`)

      // Skip the comment line
      i++

      // Skip the fenced code block that follows
      if (i < lines.length) {
        const fenceMatch = FENCED_CODE_START_RE.exec(lines[i])
        if (fenceMatch) {
          const fenceChar = fenceMatch[1][0]
          const fenceLen = fenceMatch[1].length
          i++ // skip opening fence
          while (i < lines.length) {
            const closingRe = new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`)
            if (closingRe.test(lines[i])) {
              i++ // skip closing fence
              break
            }
            i++
          }
        }
      }

      // Attempt SVG -> PNG conversion
      try {
        if (!(await fileExists(svgAbsPath))) {
          warnings.push(`Mermaid SVG 文件不存在: assets/${assetFileName}`)
          result.push(`[图片未导出: ${pngRelPath}]`)
          continue
        }
        await convertSvgToPng(svgAbsPath, pngAbsPath)
        result.push(`![${escapeMarkdownAlt(caption)}](${pngRelPath})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Mermaid SVG 转 PNG 失败: assets/${assetFileName}: ${msg}`)
        result.push(`[图片未导出: ${pngRelPath}]`)
      }
      continue
    }

    // Check for AI diagram comment
    const aiDiagramMatch = AI_DIAGRAM_COMMENT_RE.exec(line)
    if (aiDiagramMatch) {
      const assetFileName = aiDiagramMatch[2]

      if (!isValidAssetFileName(assetFileName)) {
        warnings.push(`AI diagram 资产文件名非法 (路径遍历): ${assetFileName}`)
        result.push(`[图片未导出: ${assetFileName}]`)
        i++
        // Skip the companion image reference
        if (i < lines.length && SVG_IMAGE_REF_RE.test(lines[i])) {
          i++
        }
        continue
      }

      const encodedCaption = aiDiagramMatch[3] ?? ''
      let caption = ''
      if (encodedCaption) {
        const decoded = safeDecodeURIComponent(encodedCaption)
        caption = decoded.value
        if (decoded.error) {
          warnings.push(decoded.error)
        }
      }
      const assetBase = assetBaseName(assetFileName, '.svg')
      const pngRelPath = `assets/${assetBase}.png`
      const svgAbsPath = join(projectPath, 'assets', assetFileName)
      const pngAbsPath = join(projectPath, 'assets', `${assetBase}.png`)

      // Skip the comment line
      i++

      // Skip the companion SVG image reference
      if (i < lines.length && SVG_IMAGE_REF_RE.test(lines[i])) {
        i++
      }

      // Attempt SVG -> PNG conversion
      try {
        if (!(await fileExists(svgAbsPath))) {
          warnings.push(`AI diagram SVG 文件不存在: assets/${assetFileName}`)
          result.push(`[图片未导出: ${pngRelPath}]`)
          continue
        }
        await convertSvgToPng(svgAbsPath, pngAbsPath)
        result.push(`![${escapeMarkdownAlt(caption)}](${pngRelPath})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`AI diagram SVG 转 PNG 失败: assets/${assetFileName}: ${msg}`)
        result.push(`[图片未导出: ${pngRelPath}]`)
      }
      continue
    }

    // Check for draw.io comment
    const drawioMatch = DRAWIO_COMMENT_RE.exec(line)
    if (drawioMatch) {
      const assetFileName = drawioMatch[2]

      if (!isValidAssetFileName(assetFileName)) {
        warnings.push(`draw.io 资产文件名非法 (路径遍历): ${assetFileName}`)
        result.push(`[图片未导出: ${assetFileName}]`)
        i++
        // Skip the companion image reference that follows the rejected comment
        if (i < lines.length && IMAGE_REF_RE.test(lines[i])) {
          i++
        }
        continue
      }

      const assetBase = assetBaseName(assetFileName, '.drawio')
      const pngRelPath = `assets/${assetBase}.png`
      const pngAbsPath = join(projectPath, 'assets', `${assetBase}.png`)

      // Next line should be the image reference
      if (i + 1 < lines.length) {
        const imgMatch = IMAGE_REF_RE.exec(lines[i + 1])
        if (imgMatch) {
          // Verify the sibling PNG exists
          if (await fileExists(pngAbsPath)) {
            // Keep both comment and image reference as-is
            result.push(line)
            result.push(lines[i + 1])
            i += 2
            continue
          } else {
            // PNG missing — replace with placeholder
            warnings.push(`draw.io PNG 文件不存在: ${pngRelPath}`)
            result.push(`[图片未导出: ${pngRelPath}]`)
            i += 2
            continue
          }
        }
      }

      // draw.io comment without image ref — pass through
      result.push(line)
      i++
      continue
    }

    // Regular line — pass through
    result.push(line)
    i++
  }

  return { processedMarkdown: result.join('\n'), warnings }
}

export const figureExportService = {
  preprocessMarkdownForExport,
}
