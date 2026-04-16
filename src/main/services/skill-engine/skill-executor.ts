import { exec } from 'child_process'
import { createLogger } from '@main/utils/logger'
import type { AiChatMessage } from '@shared/ai-types'
import type { ParsedSkill } from './types'

const logger = createLogger('skill-executor')

/** Regex to tokenize arguments, respecting quoted strings */
const ARG_SPLIT_PATTERN = /[^\s"']+|"([^"]*)"|'([^']*)'/g

/** Shell code block pattern: ```! ... ``` */
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g

/** Shell inline pattern: !`cmd` */
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm

const SYSTEM_PROMPT_TEMPLATE = '你是一个专业的 AI 助手。以下是你的专业领域：\n\n'
const SYSTEM_PROMPT_GENERIC = '你是一个专业的 AI 助手，请根据以下指令完成任务。'

/** Minimal env for shell commands — F8: don't leak full process.env */
const SHELL_ENV: Record<string, string> = {
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: process.env.HOME ?? '',
  LANG: process.env.LANG ?? 'en_US.UTF-8',
}

interface ShellMatch {
  fullMatch: string
  command: string
  index: number
}

export class SkillExecutor {
  /**
   * Expand skill prompt: collect shell → variable substitution → named args →
   * positional args → execute shell → replace placeholders.
   *
   * F1/F2 fix: shell patterns are collected from the ORIGINAL body before any
   * substitution, so user-supplied args cannot inject shell syntax.
   * F9 fix: shell placeholders prevent variable-expansion results from being
   * re-expanded by later substitution stages.
   */
  async expandPrompt(
    skill: ParsedSkill,
    args?: string,
    sessionId?: string,
    signal?: AbortSignal
  ): Promise<string> {
    let body = skill.body

    // ⓪ Collect shell patterns from ORIGINAL body before any substitution (F1/F2)
    const shellMatches = this.collectShellMatches(body)
    const placeholderMap = new Map<string, ShellMatch>()
    // Replace shell patterns with unique placeholders so they survive substitution
    for (let idx = shellMatches.length - 1; idx >= 0; idx--) {
      const m = shellMatches[idx]
      const placeholder = `\x00SHELL_${idx}\x00`
      placeholderMap.set(placeholder, m)
      body = body.slice(0, m.index) + placeholder + body.slice(m.index + m.fullMatch.length)
    }

    // ① Variable substitution
    body = body.replaceAll('${CLAUDE_SKILL_DIR}', skill.dirPath)
    body = body.replaceAll('${CLAUDE_SESSION_ID}', sessionId ?? '')

    // Parse arguments
    const argTokens = args ? this.tokenizeArgs(args) : []
    const namedArgs = skill.frontmatter.arguments ?? []

    // ② Named argument substitution (F3: word-boundary to avoid prefix collision)
    for (let i = 0; i < namedArgs.length; i++) {
      const paramName = namedArgs[i].replace(/^\$/, '')
      if (paramName && i < argTokens.length) {
        body = body.replace(new RegExp(`\\$${paramName}(?!\\w)`, 'g'), argTokens[i])
      }
    }

    // ③ Positional argument substitution
    body = body.replaceAll('$ARGUMENTS', args ?? '')
    // F4: replace in descending order so $10 is replaced before $1
    for (let i = Math.max(argTokens.length - 1, 9); i >= 0; i--) {
      const value = i < argTokens.length ? argTokens[i] : ''
      // F13: replace unreferenced positional params with empty string
      body = body.replace(new RegExp(`\\$${i}(?!\\d)`, 'g'), value)
    }

    // ⑤ Execute collected shell commands and replace placeholders
    for (const [placeholder, m] of placeholderMap) {
      if (body.includes(placeholder)) {
        logger.info(`Executing shell command: ${m.command.slice(0, 80)}`)
        const result = await this.executeShellCommand(m.command, skill.dirPath, signal)
        if (result.startsWith('[Shell error:')) {
          logger.error(`Shell command failed: ${result}`)
        }
        body = body.replace(placeholder, result)
      }
    }

    return body
  }

  /**
   * Execute a single shell command. Returns stdout or an error description string.
   * F10 fix: distinguish timeout from abort cancellation.
   */
  async executeShellCommand(command: string, cwd: string, signal?: AbortSignal): Promise<string> {
    let abortedBySignal = false
    return new Promise((resolve) => {
      const child = exec(
        command,
        { cwd, timeout: 30_000, maxBuffer: 1_048_576, env: SHELL_ENV },
        (err, stdout) => {
          if (err) {
            if (abortedBySignal) {
              resolve('[Shell error: Command cancelled by abort signal]')
            } else {
              resolve(
                err.killed
                  ? '[Shell error: Command timed out after 30000ms]'
                  : `[Shell error: ${err.message}]`
              )
            }
            return
          }
          resolve(stdout.trim())
        }
      )
      if (signal) {
        const onAbort = (): void => {
          abortedBySignal = true
          child.kill('SIGTERM')
        }
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('exit', () => signal.removeEventListener('abort', onAbort))
      }
    })
  }

  buildMessages(
    expandedPrompt: string,
    userMessage?: string,
    skill?: ParsedSkill
  ): AiChatMessage[] {
    const description = skill?.frontmatter.description
    const systemContent = description
      ? `${SYSTEM_PROMPT_TEMPLATE}${description}`
      : SYSTEM_PROMPT_GENERIC

    const userContent = userMessage ? `${expandedPrompt}\n\n${userMessage}` : expandedPrompt

    return [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]
  }

  private tokenizeArgs(args: string): string[] {
    const tokens: string[] = []
    let match: RegExpExecArray | null
    const regex = new RegExp(ARG_SPLIT_PATTERN.source, ARG_SPLIT_PATTERN.flags)
    while ((match = regex.exec(args)) !== null) {
      tokens.push(match[1] ?? match[2] ?? match[0])
    }
    return tokens
  }

  /**
   * Collect all shell command matches (block + inline) from the body in one pass.
   * F2 fix: both types collected from the same snapshot — no re-scanning.
   */
  private collectShellMatches(body: string): ShellMatch[] {
    if (!body.includes('!`') && !body.includes('```!')) {
      return []
    }
    const matches: ShellMatch[] = []

    const blockRegex = new RegExp(BLOCK_PATTERN.source, BLOCK_PATTERN.flags)
    let m: RegExpExecArray | null
    while ((m = blockRegex.exec(body)) !== null) {
      matches.push({ fullMatch: m[0], command: m[1].trim(), index: m.index })
    }

    const inlineRegex = new RegExp(INLINE_PATTERN.source, INLINE_PATTERN.flags)
    while ((m = inlineRegex.exec(body)) !== null) {
      // Skip inline matches that fall inside already-collected block matches
      const inBlock = matches.some(
        (b) => m!.index >= b.index && m!.index < b.index + b.fullMatch.length
      )
      if (!inBlock) {
        matches.push({ fullMatch: m[0], command: m[1].trim(), index: m.index })
      }
    }

    // Sort by position descending for safe replacement
    matches.sort((a, b) => b.index - a.index)
    return matches
  }
}
