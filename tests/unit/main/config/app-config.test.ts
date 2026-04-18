import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'fs'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData'
        ? '/mock-user-data'
        : name === 'appData'
          ? '/mock-app-data'
          : '/mock-path',
  },
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
  let getAiProxyConfigStatus: typeof import('@main/config/app-config').getAiProxyConfigStatus
  let saveAiProxyConfig: typeof import('@main/config/app-config').saveAiProxyConfig
  let setupAiConfig: typeof import('@main/config/app-config').setupAiConfig
  let decryptConfig: ReturnType<typeof vi.fn>
  let encryptConfig: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('@main/config/app-config')
    getAiProxyConfig = mod.getAiProxyConfig
    getAiProxyConfigStatus = mod.getAiProxyConfigStatus
    saveAiProxyConfig = mod.saveAiProxyConfig
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
        openaiBaseUrl: 'https://example.com/v1',
      })
    )

    const config = await getAiProxyConfig()
    expect(config.provider).toBe('claude')
    expect(config.anthropicApiKey).toBe('sk-test-123')
    expect(config.openaiBaseUrl).toBe('https://example.com/v1')
    expect(config.desensitizeEnabled).toBe(true)
  })

  it('throws AiProxyError when config file does not exist', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' })
    vi.mocked(fs.readFile).mockRejectedValue(enoent)

    const err = await getAiProxyConfig().catch((e) => e)
    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/配置文件不存在/)
    expect(err.message).toMatch(/右上角“设置”/)
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

  it('trims optional string fields from config file', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: '  key  ',
        openaiBaseUrl: ' https://minimax.a7m.com.cn/v1 ',
        defaultModel: ' MiniMax-M2.7-highspeed ',
      })
    )

    const config = await getAiProxyConfig()
    expect(config.openaiApiKey).toBe('key')
    expect(config.openaiBaseUrl).toBe('https://minimax.a7m.com.cn/v1')
    expect(config.defaultModel).toBe('MiniMax-M2.7-highspeed')
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

  it('setupAiConfig persists openaiBaseUrl when provided', async () => {
    await setupAiConfig({
      provider: 'openai',
      openaiApiKey: 'sk-openai-test',
      openaiBaseUrl: 'https://minimax.a7m.com.cn/v1',
      defaultModel: 'MiniMax-M2.7-highspeed',
      desensitizeEnabled: true,
    })

    expect(encryptConfig).toHaveBeenCalledWith(
      expect.stringContaining('"openaiBaseUrl": "https://minimax.a7m.com.cn/v1"')
    )
  })

  it('getAiProxyConfigStatus reports unconfigured when file is missing', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' })
    vi.mocked(fs.readFile).mockRejectedValue(enoent)

    const status = await getAiProxyConfigStatus()

    expect(status).toEqual(
      expect.objectContaining({
        configured: false,
        configPath: '/mock-user-data/data/config/ai-provider.enc',
        desensitizeEnabled: true,
        hasApiKey: false,
      })
    )
    expect(status.lastError).toMatch(/配置文件不存在/)
  })

  it('getAiProxyConfigStatus reports ready config without exposing secrets', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('encrypted-data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: 'sk-live',
        defaultModel: 'gpt-4o',
        openaiBaseUrl: 'https://example.com/v1',
        desensitizeEnabled: false,
      })
    )

    const status = await getAiProxyConfigStatus()

    expect(status).toEqual({
      configured: true,
      configPath: '/mock-user-data/data/config/ai-provider.enc',
      provider: 'openai',
      defaultModel: 'gpt-4o',
      openaiBaseUrl: 'https://example.com/v1',
      desensitizeEnabled: false,
      hasApiKey: true,
    })
  })

  it('migrates legacy setup config from Electron userData when current file is missing', async () => {
    const enoent = Object.assign(new Error('missing current file'), { code: 'ENOENT' })
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(enoent)
      .mockResolvedValueOnce(Buffer.from('legacy-encrypted-data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: 'sk-legacy',
        defaultModel: 'gpt-4o',
        desensitizeEnabled: true,
      })
    )

    const config = await getAiProxyConfig()

    expect(fs.readFile).toHaveBeenNthCalledWith(1, '/mock-user-data/data/config/ai-provider.enc')
    expect(fs.readFile).toHaveBeenNthCalledWith(
      2,
      '/mock-app-data/Electron/data/config/ai-provider.enc'
    )
    expect(fs.mkdir).toHaveBeenCalledWith('/mock-user-data/data/config', { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/mock-user-data/data/config/ai-provider.enc',
      Buffer.from('legacy-encrypted-data')
    )
    expect(config.openaiApiKey).toBe('sk-legacy')
  })

  it('getAiProxyConfigStatus reports configured after migrating legacy setup config', async () => {
    const enoent = Object.assign(new Error('missing current file'), { code: 'ENOENT' })
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(enoent)
      .mockResolvedValueOnce(Buffer.from('legacy-encrypted-data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'claude',
        anthropicApiKey: 'sk-legacy-claude',
        defaultModel: 'claude-sonnet-4-20250514',
        desensitizeEnabled: true,
      })
    )

    const status = await getAiProxyConfigStatus()

    expect(status).toEqual({
      configured: true,
      configPath: '/mock-user-data/data/config/ai-provider.enc',
      provider: 'claude',
      defaultModel: 'claude-sonnet-4-20250514',
      openaiBaseUrl: undefined,
      desensitizeEnabled: true,
      hasApiKey: true,
    })
  })

  it('saveAiProxyConfig preserves existing key when updating non-secret settings', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('encrypted-data'))
    decryptConfig.mockReturnValue(
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: 'sk-existing',
        defaultModel: 'gpt-4o',
        openaiBaseUrl: 'https://old.example.com/v1',
        desensitizeEnabled: true,
      })
    )

    await saveAiProxyConfig({
      provider: 'openai',
      defaultModel: 'gpt-4o-mini',
      openaiBaseUrl: 'https://new.example.com/v1',
      desensitizeEnabled: false,
    })

    expect(encryptConfig).toHaveBeenCalledWith(
      expect.stringContaining('"openaiApiKey": "sk-existing"')
    )
    expect(encryptConfig).toHaveBeenCalledWith(
      expect.stringContaining('"defaultModel": "gpt-4o-mini"')
    )
    expect(encryptConfig).toHaveBeenCalledWith(
      expect.stringContaining('"openaiBaseUrl": "https://new.example.com/v1"')
    )
    expect(encryptConfig).toHaveBeenCalledWith(
      expect.stringContaining('"desensitizeEnabled": false')
    )
  })

  it('saveAiProxyConfig requires a key when creating first config', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' })
    vi.mocked(fs.readFile).mockRejectedValue(enoent)

    const err = await saveAiProxyConfig({
      provider: 'claude',
      defaultModel: 'claude-sonnet-4-20250514',
    }).catch((e) => e)

    expect(err.name).toBe('AiProxyError')
    expect(err.message).toMatch(/API Key/)
  })
})
