import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'fs'

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  }
})

// Mock crypto-config to avoid real encryption
vi.mock('@main/config/crypto-config', () => ({
  decryptConfig: vi.fn(),
  encryptConfig: vi.fn().mockReturnValue(Buffer.from('encrypted')),
}))

describe('app-config', () => {
  let getAiProxyConfig: typeof import('@main/config/app-config').getAiProxyConfig
  let setupAiConfig: typeof import('@main/config/app-config').setupAiConfig
  let decryptConfig: ReturnType<typeof vi.fn>
  let encryptConfig: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('@main/config/app-config')
    getAiProxyConfig = mod.getAiProxyConfig
    setupAiConfig = mod.setupAiConfig
    const cryptoMod = await import('@main/config/crypto-config')
    decryptConfig = vi.mocked(cryptoMod.decryptConfig)
    encryptConfig = vi.mocked(cryptoMod.encryptConfig)
  })

  it('returns complete AiProxyConfig on valid encrypted file', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('encrypted-data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'claude',
        anthropicApiKey: 'sk-test-123',
        desensitizeEnabled: true,
        defaultModel: 'claude-sonnet-4-20250514',
      })
    )

    const config = await getAiProxyConfig()
    expect(config.provider).toBe('claude')
    expect(config.anthropicApiKey).toBe('sk-test-123')
    expect(config.desensitizeEnabled).toBe(true)
  })

  it('throws AiProxyError when config file does not exist', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' })
    vi.mocked(fs.readFile).mockRejectedValue(enoent)

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/配置文件不存在/)
  })

  it('throws AiProxyError when decryption fails', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('bad-data'))
    decryptConfig.mockImplementation(() => {
      throw new Error('decryption failed')
    })

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/解密失败/)
  })

  it('throws AiProxyError when JSON is invalid', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'))
    decryptConfig.mockReturnValue('not valid json {{{')

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/JSON 解析失败/)
  })

  it('throws AiProxyError when provider field is missing', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'))
    decryptConfig.mockReturnValue(JSON.stringify({ anthropicApiKey: 'key' }))

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/provider/)
  })

  it('throws AiProxyError when provider is invalid value', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'))
    decryptConfig.mockReturnValue(JSON.stringify({ provider: 'gemini' }))

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/provider/)
  })

  it('defaults desensitizeEnabled to true when not specified', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'))
    decryptConfig.mockReturnValue(JSON.stringify({ provider: 'openai', openaiApiKey: 'key' }))

    const config = await getAiProxyConfig()
    expect(config.desensitizeEnabled).toBe(true)
  })

  it('setupAiConfig creates config directory before writing encrypted file', async () => {
    await setupAiConfig({
      provider: 'claude',
      anthropicApiKey: 'sk-test-123',
      defaultModel: 'claude-sonnet-4-20250514',
      desensitizeEnabled: true,
    })

    expect(fs.mkdir).toHaveBeenCalledWith('/mock-user-data/data/config', { recursive: true })
    expect(encryptConfig).toHaveBeenCalledWith(expect.stringContaining('"provider": "claude"'))
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/mock-user-data/data/config/ai-provider.enc',
      Buffer.from('encrypted')
    )
  })
})
