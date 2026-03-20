import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import type { TraceEntry } from '@main/services/ai-proxy/ai-trace-logger'

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    promises: {
      appendFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  }
})

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('ai-trace-logger', () => {
  let writeTrace: typeof import('@main/services/ai-proxy/ai-trace-logger').writeTrace

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('@main/services/ai-proxy/ai-trace-logger')
    writeTrace = mod.writeTrace
  })

  function makeEntry(overrides: Partial<TraceEntry> = {}): TraceEntry {
    return {
      timestamp: '2026-03-20T10:00:00.000Z',
      caller: 'test-agent',
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      desensitizedInput: [{ role: 'user', content: '{{COMPANY_1}}的方案' }],
      outputContent: '分析{{COMPANY_1}}的方案如下',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 2000,
      status: 'success',
      desensitizeStats: { totalReplacements: 1, byType: { COMPANY: 1 } },
      ...overrides,
    }
  }

  it('writes JSONL format (one JSON object per line)', async () => {
    const entry = makeEntry()
    await writeTrace(entry)

    expect(fs.appendFile).toHaveBeenCalledTimes(1)
    const [, content] = vi.mocked(fs.appendFile).mock.calls[0]
    expect(content).toMatch(/\n$/)
    const parsed = JSON.parse((content as string).trim())
    expect(parsed.caller).toBe('test-agent')
    expect(parsed.status).toBe('success')
  })

  it('includes desensitizedInput field in log', async () => {
    const entry = makeEntry()
    await writeTrace(entry)

    const [, content] = vi.mocked(fs.appendFile).mock.calls[0]
    const parsed = JSON.parse((content as string).trim())
    expect(parsed.desensitizedInput).toBeDefined()
    expect(parsed.desensitizedInput[0].content).toContain('{{COMPANY_1}}')
  })

  it('includes outputContent field in log', async () => {
    const entry = makeEntry()
    await writeTrace(entry)

    const [, content] = vi.mocked(fs.appendFile).mock.calls[0]
    const parsed = JSON.parse((content as string).trim())
    expect(parsed.outputContent).toBe('分析{{COMPANY_1}}的方案如下')
  })

  it('records null outputContent on pre-provider failure', async () => {
    const entry = makeEntry({
      status: 'error',
      outputContent: null,
      errorCode: 'CONFIG',
      errorMessage: '配置文件不存在',
      inputTokens: 0,
      outputTokens: 0,
    })
    await writeTrace(entry)

    const [, content] = vi.mocked(fs.appendFile).mock.calls[0]
    const parsed = JSON.parse((content as string).trim())
    expect(parsed.outputContent).toBeNull()
    expect(parsed.errorCode).toBe('CONFIG')
  })

  it('writes to date-based file path', async () => {
    const entry = makeEntry()
    await writeTrace(entry)

    const [filePath] = vi.mocked(fs.appendFile).mock.calls[0]
    expect(filePath).toMatch(/data\/logs\/ai-trace\/\d{4}-\d{2}-\d{2}\.jsonl$/)
  })

  it('does not create directories itself (relies on ensureDataDirectories)', async () => {
    const entry = makeEntry()
    await writeTrace(entry)

    // mkdir should not be called on normal write
    expect(fs.mkdir).not.toHaveBeenCalled()
  })

  it('creates directory defensively on ENOENT', async () => {
    const enoent = Object.assign(new Error('no such file'), { code: 'ENOENT' })
    vi.mocked(fs.appendFile).mockRejectedValueOnce(enoent).mockResolvedValueOnce(undefined)

    const entry = makeEntry()
    await writeTrace(entry)

    expect(fs.mkdir).toHaveBeenCalledTimes(1)
    expect(fs.appendFile).toHaveBeenCalledTimes(2)
  })

  it('never contains undesensitized original text', async () => {
    const entry = makeEntry({
      desensitizedInput: [{ role: 'user', content: '{{COMPANY_1}}的预算{{AMOUNT_1}}' }],
      outputContent: '关于{{COMPANY_1}}的方案',
    })
    await writeTrace(entry)

    const [, content] = vi.mocked(fs.appendFile).mock.calls[0]
    const line = content as string
    // Ensure no real sensitive data (this is a pattern check)
    expect(line).not.toContain('华为')
    expect(line).not.toContain('13800138000')
    // But placeholders are present
    expect(line).toContain('{{COMPANY_1}}')
    expect(line).toContain('{{AMOUNT_1}}')
  })
})
