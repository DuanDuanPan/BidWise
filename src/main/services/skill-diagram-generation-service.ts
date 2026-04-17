/**
 * Skill Diagram Generation Service
 *
 * Orchestrates fireworks-tech-graph skill to produce SVG diagrams
 * for the chapter generation pipeline. Handles:
 * - Skill prompt expansion with style/icon references
 * - SVG extraction from AI response
 * - Validation via validate-svg.js + export-level check
 * - Repair loop (max 3 attempts)
 * - Asset saving via aiDiagramAssetService
 */

import { join } from 'path'
import { writeFile, unlink, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { execFile as execFileCb } from 'child_process'
import { createLogger } from '@main/utils/logger'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { extractFirstSvg } from '@main/utils/svg-extract'
import { skillLoader, skillExecutor } from '@main/services/skill-engine'
import { aiDiagramAssetService } from '@main/services/ai-diagram-asset-service'
import {
  buildAiDiagramMarkdown,
  buildDiagramFailureMarkdown,
} from '@main/services/diagram-validation-service'
import type { AiDiagramStyleToken, AiDiagramTypeToken } from '@shared/ai-diagram-types'
import type { AiChatMessage, AiProxyResponse, TokenUsage } from '@shared/ai-types'

const logger = createLogger('skill-diagram-generation-service')

function execFileAsync(
  cmd: string,
  args: string[],
  opts?: { timeout?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, opts ?? {}, (err, stdout, stderr) => {
      const stdoutStr = stdout?.toString() ?? ''
      const stderrStr = stderr?.toString() ?? ''
      if (err) {
        const enriched = err as Error & { stdout?: string; stderr?: string }
        enriched.stdout = stdoutStr
        enriched.stderr = stderrStr
        reject(enriched)
        return
      }
      resolve({ stdout: stdoutStr, stderr: stderrStr })
    })
  })
}

const MAX_REPAIR_ATTEMPTS = 3
const SKILL_NAME = 'fireworks-tech-graph'

// Per-attempt AI call budget. 4 attempts × 10 min = 40 min theoretical max,
// but outer chapter task (30 min) cuts sooner. 10 min per attempt is enough
// for a 65k-token SVG at normal streaming rates (~120 tokens/s).
const AI_CALL_TIMEOUT_MS = 600_000

// Output-cap escalation: double maxTokens each time truncation is detected,
// up to 128k (what Claude Sonnet 4.6 / Opus 4.7 / Gemini 3 Pro all support).
// Baseline 65536 leaves headroom for dense architecture diagrams without
// paying for unused quota on simple flowcharts.
const DEFAULT_MAX_TOKENS = 65536
const MAX_TOKENS_CEILING = 131072
const TRUNCATION_DETECTION_SLACK = 64

// Map style token → actual reference filename (must match files in references/)
const STYLE_TO_REFERENCE_FILE: Record<AiDiagramStyleToken, string> = {
  'flat-icon': 'style-1-flat-icon.md',
  'dark-terminal': 'style-2-dark-terminal.md',
  blueprint: 'style-3-blueprint.md',
  'notion-clean': 'style-4-notion-clean.md',
  glassmorphism: 'style-5-glassmorphism.md',
  'claude-official': 'style-6-claude-official.md',
  'openai-official': 'style-7-openai.md',
}

export interface SkillDiagramInput {
  diagramId: string
  title: string
  description: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
  chapterTitle: string
  chapterMarkdown: string
  assetFileName?: string
}

export interface SkillDiagramResult {
  kind: 'success' | 'failure'
  markdown: string
  assetFileName?: string
  svgContent?: string
  error?: string
  repairAttempts: number
}

interface AiProxy {
  call(params: {
    caller: string
    signal: AbortSignal
    maxTokens: number
    messages: AiChatMessage[]
    timeoutMs?: number
  }): Promise<AiProxyResponse>
}

/**
 * Detect whether rsvg-convert is available on this machine.
 * Result is cached after first call.
 */
let rsvgAvailable: boolean | null = null

async function probeRsvgConvert(): Promise<boolean> {
  if (rsvgAvailable !== null) return rsvgAvailable
  try {
    await execFileAsync('rsvg-convert', ['--version'])
    rsvgAvailable = true
    logger.info('rsvg-convert available for export-level SVG validation')
  } catch {
    rsvgAvailable = false
    logger.info('rsvg-convert not found, will use sharp for export-level validation')
  }
  return rsvgAvailable
}

/**
 * Load style reference content and icons.md from skill directory.
 */
async function loadSkillReferences(
  skillDirPath: string,
  style: AiDiagramStyleToken
): Promise<string> {
  const parts: string[] = []

  // Load style reference
  const styleFileName = STYLE_TO_REFERENCE_FILE[style]
  if (styleFileName) {
    const stylePath = join(skillDirPath, 'references', styleFileName)
    try {
      const content = await readFile(stylePath, 'utf-8')
      parts.push(`## Style Reference: ${style}\n\n${content}`)
    } catch {
      logger.warn(`Style reference not found: ${stylePath}`)
    }
  }

  // Load icons reference
  const iconsPath = join(skillDirPath, 'references', 'icons.md')
  try {
    const content = await readFile(iconsPath, 'utf-8')
    parts.push(`## Icon Reference\n\n${content}`)
  } catch {
    logger.warn(`Icons reference not found: ${iconsPath}`)
  }

  return parts.join('\n\n')
}

/**
 * Run validate-svg.js on an SVG string. Returns null on success, error string on failure.
 */
async function runSvgValidator(svgContent: string, skillDirPath: string): Promise<string | null> {
  const tmpPath = join(tmpdir(), `bidwise-svg-validate-${randomUUID().slice(0, 8)}.svg`)
  try {
    await writeFile(tmpPath, svgContent, 'utf-8')
    const scriptPath = join(skillDirPath, 'scripts', 'validate-svg.js')
    await execFileAsync(process.execPath, [scriptPath, tmpPath], {
      timeout: 15_000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    return null // success
  } catch (err) {
    // validate-svg.js writes failure details (tag balance, marker refs, arrow
    // collisions, rsvg-convert output) to stdout, then exits non-zero. Capture
    // stdout + stderr so the repair prompt and logs show the real reason.
    const e = err as Error & { stdout?: string; stderr?: string; code?: number | string }
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').trim()
    const stdout = stripAnsi(e.stdout ?? '')
    const stderr = stripAnsi(e.stderr ?? '')
    const failureLines = stdout
      .split('\n')
      .filter((line) => /✗|Fail|Error|Missing marker/i.test(line))
      .join(' | ')
    const details = failureLines || stdout || stderr || e.message
    return details.slice(0, 800)
  } finally {
    try {
      await unlink(tmpPath)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Export-level validation: rsvg-convert (preferred) or sharp PNG rasterization.
 */
async function runExportValidation(svgContent: string): Promise<string | null> {
  const hasRsvg = await probeRsvgConvert()

  if (hasRsvg) {
    const tmpPath = join(tmpdir(), `bidwise-svg-export-${randomUUID().slice(0, 8)}.svg`)
    const outPath = tmpPath.replace('.svg', '.png')
    try {
      await writeFile(tmpPath, svgContent, 'utf-8')
      await execFileAsync('rsvg-convert', [tmpPath, '-o', outPath], { timeout: 15_000 })
      return null
    } catch (err) {
      return `rsvg-convert failed: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      try {
        await unlink(tmpPath)
      } catch {
        /* ignore */
      }
      try {
        await unlink(outPath)
      } catch {
        /* ignore */
      }
    }
  }

  // Fallback: sharp PNG rasterization
  try {
    const sharp = await import('sharp')
    await sharp.default(Buffer.from(svgContent)).png().toBuffer()
    return null
  } catch (err) {
    return `sharp rasterization failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * Generate a single skill diagram with validation and repair loop.
 */
export async function generateSkillDiagram(params: {
  input: SkillDiagramInput
  projectId: string
  aiProxy: AiProxy
  signal: AbortSignal
  usage: TokenUsage
}): Promise<SkillDiagramResult> {
  const { input, projectId, aiProxy, signal, usage } = params
  const assetFileName = input.assetFileName || `ai-diagram-${input.diagramId.slice(0, 8)}.svg`
  const skill = skillLoader.getSkill(SKILL_NAME)

  if (!skill) {
    logger.error(`Skill "${SKILL_NAME}" not loaded`)
    return {
      kind: 'failure',
      markdown: buildDiagramFailureMarkdown({
        type: 'skill',
        diagramId: input.diagramId,
        assetFileName: assetFileName,
        caption: input.title,
        description: input.description,
        style: input.style,
        diagramType: input.diagramType,
        error: `Skill "${SKILL_NAME}" 未加载`,
      }),
      error: `Skill "${SKILL_NAME}" not loaded`,
      repairAttempts: 0,
    }
  }

  // Load references
  const references = await loadSkillReferences(skill.dirPath, input.style)

  // Build args: "$style $diagramType"
  const skillArgs = `${input.style} ${input.diagramType}`

  // Expand prompt
  const expandedPrompt = await skillExecutor.expandPrompt(skill, skillArgs, undefined, signal)

  // Build user message with diagram context + references
  const userMessage = buildSkillUserMessage(input, references)
  const messages = skillExecutor.buildMessages(expandedPrompt, userMessage, skill)

  let lastError = ''
  const baseMaxTokens = skill.frontmatter.maxTokens ?? DEFAULT_MAX_TOKENS
  let truncationCount = 0
  // Track whether the previous iteration terminated due to output-cap truncation.
  // Truncation means the model generated a valid SVG that ran out of tokens, not
  // that the SVG had validation errors — so the next attempt should re-issue the
  // original messages with a larger budget, NOT the validation-repair prompt which
  // would mislead the model into "fixing" non-existent structural errors.
  let lastWasTruncation = false

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    throwIfAborted(signal, 'Skill diagram generation cancelled')

    const isValidationRepair = attempt > 0 && !lastWasTruncation
    const caller =
      !isValidationRepair && attempt > 0
        ? `skill-diagram:escalate:${attempt}`
        : isValidationRepair
          ? `skill-diagram:repair:${attempt}`
          : 'skill-diagram:generate'

    const currentMessages: AiChatMessage[] = isValidationRepair
      ? buildRepairMessages(messages, lastError, input)
      : messages

    const currentMaxTokens = Math.min(baseMaxTokens * 2 ** truncationCount, MAX_TOKENS_CEILING)

    try {
      const response = await aiProxy.call({
        caller,
        signal,
        maxTokens: currentMaxTokens,
        messages: currentMessages,
        timeoutMs: AI_CALL_TIMEOUT_MS,
      })
      usage.promptTokens += response.usage.promptTokens
      usage.completionTokens += response.usage.completionTokens

      // Detect output-cap truncation before extraction so escalation is not
      // masked as a "missing </svg>" parser error, which would otherwise
      // burn repair attempts at the same maxTokens and fail deterministically.
      //
      // Primary signal is termination.kind='truncated' (adapter-normalized,
      // covers length / max_tokens across providers). hitCap is a fallback
      // for backends that forget to set finish_reason but still exhaust the
      // budget.
      const outputTokens = response.usage.completionTokens
      const hitCap = outputTokens >= currentMaxTokens - TRUNCATION_DETECTION_SLACK
      const terminationKind = response.termination?.kind
      const truncated =
        terminationKind === 'truncated' || response.finishReason === 'length' || hitCap

      if (truncated) {
        lastError = `Output truncated at ${outputTokens} tokens (cap ${currentMaxTokens}, finishReason=${response.finishReason ?? 'unknown'}, termination=${terminationKind ?? 'unknown'}).`
        lastWasTruncation = true
        logger.warn(`SVG output truncated (attempt ${attempt + 1})`, {
          finishReason: response.finishReason,
          termination: terminationKind ?? 'unknown',
          outputTokens,
          currentMaxTokens,
        })
        if (currentMaxTokens < MAX_TOKENS_CEILING) {
          truncationCount += 1
        }
        continue
      }

      lastWasTruncation = false

      // Extract SVG
      const extraction = extractFirstSvg(response.content)
      if (!extraction.svg) {
        lastError = extraction.error ?? 'Failed to extract SVG from response'
        logger.warn(`SVG extraction failed (attempt ${attempt + 1})`, { error: lastError })
        continue
      }

      // Run validate-svg.js
      const validationError = await runSvgValidator(extraction.svg, skill.dirPath)
      if (validationError) {
        lastError = `validate-svg.js: ${validationError}`
        logger.warn(`SVG validation failed (attempt ${attempt + 1})`, { error: lastError })
        continue
      }

      // Run export-level validation
      const exportError = await runExportValidation(extraction.svg)
      if (exportError) {
        lastError = exportError
        logger.warn(`Export validation failed (attempt ${attempt + 1})`, { error: lastError })
        continue
      }

      // All validations passed — save asset
      await aiDiagramAssetService.saveAiDiagramAsset({
        projectId,
        diagramId: input.diagramId,
        svgContent: extraction.svg,
        assetFileName,
      })

      const markdown = buildAiDiagramMarkdown({
        diagramId: input.diagramId,
        assetFileName,
        caption: input.title,
        prompt: input.description,
        style: input.style,
        diagramType: input.diagramType,
      })

      logger.info(`Skill diagram generated successfully`, {
        diagramId: input.diagramId,
        style: input.style,
        diagramType: input.diagramType,
        attempts: attempt + 1,
      })

      return {
        kind: 'success',
        markdown,
        assetFileName,
        svgContent: extraction.svg,
        repairAttempts: attempt,
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      lastError = err instanceof Error ? err.message : String(err)
      logger.error(`Skill diagram AI call failed (attempt ${attempt + 1})`, { error: lastError })
    }
  }

  // All attempts exhausted
  const failureMarkdown = buildDiagramFailureMarkdown({
    type: 'skill',
    diagramId: input.diagramId,
    assetFileName,
    caption: input.title,
    description: input.description,
    style: input.style,
    diagramType: input.diagramType,
    error: lastError || 'skill 图表生成在所有修复轮次后仍然失败',
  })

  return {
    kind: 'failure',
    markdown: failureMarkdown,
    error: lastError,
    repairAttempts: MAX_REPAIR_ATTEMPTS,
  }
}

function buildSkillUserMessage(input: SkillDiagramInput, references: string): string {
  const parts: string[] = []

  parts.push(`请为以下章节生成一个 ${input.diagramType} 类型的技术图表。`)
  parts.push(``)
  parts.push(`**章节标题：** ${input.chapterTitle}`)
  parts.push(`**图表标题：** ${input.title}`)
  parts.push(`**图表描述：** ${input.description}`)
  parts.push(`**风格：** ${input.style}`)
  parts.push(`**类型：** ${input.diagramType}`)

  if (references) {
    parts.push(``)
    parts.push(`---`)
    parts.push(``)
    parts.push(references)
  }

  return parts.join('\n')
}

function buildRepairMessages(
  originalMessages: AiChatMessage[],
  error: string,
  input: SkillDiagramInput
): AiChatMessage[] {
  return [
    ...originalMessages,
    {
      role: 'assistant' as const,
      content: '(previous SVG output had validation errors)',
    },
    {
      role: 'user' as const,
      content: [
        `上一次生成的 SVG 校验失败，请修复以下问题后重新输出完整 SVG：`,
        ``,
        `**错误详情：** ${error}`,
        ``,
        `**要求：**`,
        `1. 输出必须以 <svg 开头，以 </svg> 结尾`,
        `2. 不要包含 markdown 围栏或解释文字`,
        `3. 保持原始的图表标题「${input.title}」和结构意图`,
        `4. 确保所有标签闭合、marker 引用匹配、属性带引号`,
      ].join('\n'),
    },
  ]
}
