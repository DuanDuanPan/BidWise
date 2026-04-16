import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockExec = vi.fn()

vi.mock('child_process', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}))

import { SkillExecutor } from '@main/services/skill-engine/skill-executor'
import type { ParsedSkill } from '@main/services/skill-engine/types'

function makeSkill(overrides: Partial<ParsedSkill> = {}): ParsedSkill {
  return {
    name: 'test-skill',
    dirPath: '/skills/test-skill',
    frontmatter: { name: 'test-skill', description: 'A test skill' },
    body: 'Hello $ARGUMENTS',
    ...overrides,
  }
}

describe('SkillExecutor', () => {
  let executor: SkillExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new SkillExecutor()
  })

  // ─── expandPrompt ───

  describe('expandPrompt', () => {
    it('should replace $ARGUMENTS with full args string', async () => {
      const skill = makeSkill({ body: 'Generate $ARGUMENTS' })
      const result = await executor.expandPrompt(skill, 'arch style-1')
      expect(result).toBe('Generate arch style-1')
    })

    it('should replace positional $0 and $1', async () => {
      const skill = makeSkill({ body: 'First: $0, Second: $1' })
      const result = await executor.expandPrompt(skill, 'arch style-1')
      expect(result).toBe('First: arch, Second: style-1')
    })

    it('should replace ${CLAUDE_SKILL_DIR}', async () => {
      const skill = makeSkill({ body: 'Dir: ${CLAUDE_SKILL_DIR}' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('Dir: /skills/test-skill')
    })

    it('should replace ${CLAUDE_SESSION_ID} with value or empty', async () => {
      const skill = makeSkill({ body: 'Session: ${CLAUDE_SESSION_ID}' })
      const withId = await executor.expandPrompt(skill, undefined, 'abc-123')
      expect(withId).toBe('Session: abc-123')

      const withoutId = await executor.expandPrompt(skill)
      expect(withoutId).toBe('Session: ')
    })

    it('should replace named arguments from frontmatter', async () => {
      const skill = makeSkill({
        body: 'File: $file, Style: $style',
        frontmatter: {
          name: 'test-skill',
          description: 'test',
          arguments: ['$file', '$style'],
        },
      })
      const result = await executor.expandPrompt(skill, 'arch style-1')
      expect(result).toBe('File: arch, Style: style-1')
    })

    it('should handle quoted arguments', async () => {
      const skill = makeSkill({ body: 'Arg: $0' })
      const result = await executor.expandPrompt(skill, '"hello world"')
      expect(result).toBe('Arg: hello world')
    })

    it('should follow substitution order: variables → named → positional', async () => {
      const skill = makeSkill({
        body: 'Dir: ${CLAUDE_SKILL_DIR}, File: $file, All: $ARGUMENTS',
        frontmatter: {
          name: 'test-skill',
          description: 'test',
          arguments: ['$file'],
        },
      })
      const result = await executor.expandPrompt(skill, 'myfile.txt')
      expect(result).toBe('Dir: /skills/test-skill, File: myfile.txt, All: myfile.txt')
    })

    it('should replace $ARGUMENTS with empty string when no args', async () => {
      const skill = makeSkill({ body: 'Args: $ARGUMENTS' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('Args: ')
    })

    // F3: named arg word boundary
    it('should not replace $file inside $filename (F3 word boundary)', async () => {
      const skill = makeSkill({
        body: '$file and $filename',
        frontmatter: {
          name: 'test-skill',
          description: 'test',
          arguments: ['$file'],
        },
      })
      const result = await executor.expandPrompt(skill, 'test.txt')
      expect(result).toBe('test.txt and $filename')
    })

    // F4: $1 should not corrupt $10
    it('should not corrupt $10 when replacing $1 (F4 descending order)', async () => {
      const tokens = Array.from({ length: 11 }, (_, i) => `arg${i}`)
      const skill = makeSkill({ body: '$1 and $10' })
      const result = await executor.expandPrompt(skill, tokens.join(' '))
      expect(result).toBe('arg1 and arg10')
    })

    // F13: unreferenced positional params replaced with empty
    it('should replace unreferenced $0 with empty when no args (F13)', async () => {
      const skill = makeSkill({ body: 'Value: $0 end' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('Value:  end')
    })

    // F1: args cannot inject shell patterns
    it('should not execute shell patterns injected via args (F1)', async () => {
      const skill = makeSkill({ body: 'Result: $ARGUMENTS' })
      const result = await executor.expandPrompt(skill, '!`whoami`')
      // The !`whoami` should be literal text, not executed
      expect(mockExec).not.toHaveBeenCalled()
      expect(result).toBe('Result: !`whoami`')
    })
  })

  // ─── Shell execution ───

  describe('shell execution', () => {
    it('should execute inline shell commands', async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
          cb(null, 'hello\n', '')
          return { on: vi.fn(), kill: vi.fn() }
        }
      )

      const skill = makeSkill({ body: 'Result: !`echo hello`' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('Result: hello')
    })

    it('should execute code block shell commands', async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
          cb(null, 'block-output\n', '')
          return { on: vi.fn(), kill: vi.fn() }
        }
      )

      const skill = makeSkill({ body: '```!\necho block\n```' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('block-output')
    })

    it('should return error string on shell failure', async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
          cb(new Error('command not found'), '', '')
          return { on: vi.fn(), kill: vi.fn() }
        }
      )

      const result = await executor.executeShellCommand('bad-cmd', '/tmp')
      expect(result).toBe('[Shell error: command not found]')
    })

    it('should return timeout error when command times out', async () => {
      const timeoutErr = new Error('timeout') as Error & { killed: boolean }
      timeoutErr.killed = true
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
          cb(timeoutErr, '', '')
          return { on: vi.fn(), kill: vi.fn() }
        }
      )

      const result = await executor.executeShellCommand('sleep 60', '/tmp')
      expect(result).toBe('[Shell error: Command timed out after 30000ms]')
    })

    it('should kill child process on abort', async () => {
      const mockKill = vi.fn()
      const mockOn = vi.fn()
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, _cb: (...args: unknown[]) => void) => {
          return { on: mockOn, kill: mockKill }
        }
      )

      const controller = new AbortController()
      const promise = executor.executeShellCommand('sleep 60', '/tmp', controller.signal)
      controller.abort()

      expect(mockKill).toHaveBeenCalledWith('SIGTERM')
      void promise
    })

    // F10: distinguish abort from timeout
    it('should report abort cancellation separately from timeout (F10)', async () => {
      const mockKill = vi.fn()
      mockExec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (...args: unknown[]) => void) => {
          // Simulate: abort fires, then exec callback fires with killed=true
          const child = {
            on: vi.fn(),
            kill: () => {
              mockKill()
              const err = new Error('killed') as Error & { killed: boolean }
              err.killed = true
              cb(err, '', '')
            },
          }
          return child
        }
      )

      const controller = new AbortController()
      const promise = executor.executeShellCommand('sleep 60', '/tmp', controller.signal)
      controller.abort()

      const result = await promise
      expect(result).toBe('[Shell error: Command cancelled by abort signal]')
    })

    it('should not scan for shell when body has no shell markers', async () => {
      const skill = makeSkill({ body: 'Plain text with no commands' })
      const result = await executor.expandPrompt(skill)
      expect(result).toBe('Plain text with no commands')
      expect(mockExec).not.toHaveBeenCalled()
    })

    // F8: minimal env
    it('should pass minimal env to exec (F8)', async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          opts: { env?: Record<string, string> },
          cb: (...args: unknown[]) => void
        ) => {
          cb(null, 'ok\n', '')
          return { on: vi.fn(), kill: vi.fn() }
        }
      )

      await executor.executeShellCommand('echo ok', '/tmp')
      const opts = mockExec.mock.calls[0][1] as { env?: Record<string, string> }
      expect(opts.env).toBeDefined()
      expect(Object.keys(opts.env!).length).toBeLessThanOrEqual(4)
      expect(opts.env!.PATH).toBeDefined()
    })
  })

  // ─── buildMessages ───

  describe('buildMessages', () => {
    it('should use description-based system prompt when description exists', () => {
      const messages = executor.buildMessages('test prompt', undefined, makeSkill())
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('A test skill')
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toBe('test prompt')
    })

    it('should use generic system prompt when no description', () => {
      const skill = makeSkill({
        frontmatter: { name: 'test', description: '' },
      })
      const messages = executor.buildMessages('test prompt', undefined, skill)
      expect(messages[0].content).toBe('你是一个专业的 AI 助手，请根据以下指令完成任务。')
    })

    it('should append userMessage to user content', () => {
      const messages = executor.buildMessages('prompt', 'extra context', makeSkill())
      expect(messages[1].content).toBe('prompt\n\nextra context')
    })

    it('should use generic system prompt when skill is undefined', () => {
      const messages = executor.buildMessages('test prompt')
      expect(messages[0].content).toBe('你是一个专业的 AI 助手，请根据以下指令完成任务。')
    })
  })
})
