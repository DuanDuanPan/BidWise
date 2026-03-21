import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import mammoth from 'mammoth'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'

const execFileAsync = promisify(execFile)
const WINDOWS_LIBREOFFICE_PATHS = [
  process.env.PROGRAMFILES
    ? path.win32.join(process.env.PROGRAMFILES, 'LibreOffice', 'program', 'soffice.exe')
    : null,
  process.env['PROGRAMFILES(X86)']
    ? path.win32.join(process.env['PROGRAMFILES(X86)'], 'LibreOffice', 'program', 'soffice.exe')
    : null,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
].filter((candidate): candidate is string => Boolean(candidate))
const WINDOWS_LIBREOFFICE_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\LibreOffice\\UNO\\InstallPath',
  'HKLM\\SOFTWARE\\WOW6432Node\\LibreOffice\\UNO\\InstallPath',
  'HKCU\\SOFTWARE\\LibreOffice\\UNO\\InstallPath',
]

export interface WordSection {
  title: string
  content: string
  level: number
}

export interface WordExtractResult {
  text: string
  html: string
  sections: WordSection[]
}

/** Cache LibreOffice detection result */
let libreOfficePath: string | null | undefined

async function resolveCommandPath(command: string): Promise<string | null> {
  try {
    const locator = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(locator, [command])
    const match = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)

    return match ?? null
  } catch {
    return null
  }
}

async function resolveWindowsLibreOfficeFromRegistry(): Promise<string | null> {
  for (const registryKey of WINDOWS_LIBREOFFICE_REGISTRY_KEYS) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', registryKey, '/ve'])
      const value = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.includes('REG_SZ'))

      if (!value) {
        continue
      }

      const installPath = value.replace(/^.*REG_SZ\s+/, '').trim()
      const candidate = installPath.toLowerCase().endsWith('.exe')
        ? installPath
        : path.win32.join(installPath, 'soffice.exe')

      if (fs.existsSync(candidate)) {
        return candidate
      }
    } catch {
      // Try the next registry key or fallback path.
    }
  }

  return null
}

async function findLibreOffice(): Promise<string | null> {
  if (libreOfficePath !== undefined) return libreOfficePath

  if (process.platform === 'win32') {
    const registryPath = await resolveWindowsLibreOfficeFromRegistry()
    if (registryPath) {
      libreOfficePath = registryPath
      return registryPath
    }

    for (const candidate of WINDOWS_LIBREOFFICE_PATHS) {
      if (fs.existsSync(candidate)) {
        libreOfficePath = candidate
        return candidate
      }
    }

    libreOfficePath = null
    return null
  }

  const fixedCandidates =
    process.platform === 'darwin' ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice'] : []

  for (const candidate of fixedCandidates) {
    if (fs.existsSync(candidate)) {
      libreOfficePath = candidate
      return candidate
    }
  }

  const commandCandidates = process.platform === 'darwin' ? ['soffice'] : ['soffice', 'libreoffice']
  for (const command of commandCandidates) {
    const resolvedPath = await resolveCommandPath(command)
    if (resolvedPath) {
      libreOfficePath = resolvedPath
      return resolvedPath
    }
  }

  libreOfficePath = null
  return null
}

export async function convertDocToDocx(filePath: string): Promise<string> {
  const soffice = await findLibreOffice()
  if (!soffice) {
    throw new BidWiseError(
      ErrorCode.UNSUPPORTED_FORMAT,
      '.doc 格式自动转换失败，请安装 LibreOffice 或手动将文件另存为 .docx 格式后重试'
    )
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bidwise-doc-'))
  try {
    await execFileAsync(soffice, [
      '--headless',
      '--convert-to',
      'docx',
      '--outdir',
      tmpDir,
      filePath,
    ])
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.UNSUPPORTED_FORMAT,
      '.doc 格式自动转换失败，请安装 LibreOffice 或手动将文件另存为 .docx 格式后重试',
      err
    )
  }

  const baseName = path.basename(filePath, path.extname(filePath))
  const convertedPath = path.join(tmpDir, `${baseName}.docx`)

  if (!fs.existsSync(convertedPath)) {
    throw new BidWiseError(
      ErrorCode.UNSUPPORTED_FORMAT,
      '.doc 格式自动转换失败，请安装 LibreOffice 或手动将文件另存为 .docx 格式后重试'
    )
  }

  return convertedPath
}

/** Parse <h1>-<h6> tags from HTML to extract section structure */
function parseHtmlSections(html: string): WordSection[] {
  const sections: WordSection[] = []
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi
  let match: RegExpExecArray | null

  // Collect heading positions
  const headings: { level: number; title: string; index: number }[] = []
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      title: match[2].replace(/<[^>]+>/g, '').trim(),
      index: match.index,
    })
  }

  if (headings.length === 0) return sections

  // Extract content between headings
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length
    const contentHtml = html.slice(start, end)
    // Strip all HTML tags for plain text content
    const content = contentHtml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    sections.push({
      title: headings[i].title,
      content,
      level: headings[i].level,
    })
  }

  return sections
}

export async function extractWordText(filePath: string): Promise<WordExtractResult> {
  let actualPath = filePath
  const ext = path.extname(filePath).toLowerCase()

  // .doc format: convert via LibreOffice first
  if (ext === '.doc') {
    actualPath = await convertDocToDocx(filePath)
  }

  let text: string
  let html: string
  try {
    const textResult = await mammoth.extractRawText({ path: actualPath })
    text = textResult.value

    const htmlResult = await mammoth.convertToHtml({ path: actualPath })
    html = htmlResult.value
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.TENDER_PARSE,
      `Word 文件解析失败: ${(err as Error).message}`,
      err
    )
  }

  const sections = parseHtmlSections(html)

  return { text, html, sections }
}

/** Reset LibreOffice detection cache (for testing) */
export function _resetLibreOfficeCache(): void {
  libreOfficePath = undefined
}
