import { join, basename, extname } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import sharp from 'sharp'

// Mermaid comment: <!-- mermaid:{diagramId}:{assetFileName}:{encodedCaption?} -->
const MERMAID_COMMENT_RE = /^<!--\s*mermaid:([^:]+):([^:>]+?)(?::([^>]*?))?\s*-->\s*$/

// draw.io comment: <!-- drawio:{diagramId}:{assetFileName} -->
const DRAWIO_COMMENT_RE = /^<!--\s*drawio:([^:]+):([^>]+?)\s*-->\s*$/

// Standard image reference: ![caption](path)
const IMAGE_REF_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/

// Fenced code block start
const FENCED_CODE_START_RE = /^(`{3,}|~{3,})(\w*)\s*$/

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
  const pngBuffer = await sharp(svgBuffer, { density: 192 }).png().toBuffer()
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
      const encodedCaption = mermaidMatch[3] ?? ''
      const caption = encodedCaption ? decodeURIComponent(encodedCaption) : ''
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
        result.push(`![${caption}](${pngRelPath})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Mermaid SVG 转 PNG 失败: assets/${assetFileName}: ${msg}`)
        result.push(`[图片未导出: ${pngRelPath}]`)
      }
      continue
    }

    // Check for draw.io comment
    const drawioMatch = DRAWIO_COMMENT_RE.exec(line)
    if (drawioMatch) {
      const assetFileName = drawioMatch[2]
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
