/**
 * Application configuration — unified entry point for all runtime config.
 */
import { app } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import { decryptConfig, encryptConfig } from '@main/config/crypto-config'
import type {
  AiConfigStatus,
  AiProxyConfig,
  AiProviderName,
  SaveAiProxyConfigInput,
} from '@shared/ai-types'

const AI_CONFIG_RECOVERY_HINT =
  '请在应用右上角“设置”中完成 AI 配置；若为开发环境，也可运行 pnpm setup:ai-config'
const LEGACY_SETUP_APP_NAME = 'Electron'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'data', 'config', 'ai-provider.enc')
}

function readOptionalString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function buildConfigFileMissingMessage(configPath: string): string {
  return `AI provider 配置文件不存在。${AI_CONFIG_RECOVERY_HINT}。配置文件路径: ${configPath}`
}

function getLegacyConfigPath(): string {
  return join(app.getPath('appData'), LEGACY_SETUP_APP_NAME, 'data', 'config', 'ai-provider.enc')
}

async function readConfigFile(configPath: string): Promise<Buffer> {
  try {
    return await fs.readFile(configPath)
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code !== 'ENOENT') {
      throw new AiProxyError(ErrorCode.CONFIG, `无法读取 AI 配置文件: ${nodeErr.message}`, err)
    }

    const legacyConfigPath = getLegacyConfigPath()
    if (legacyConfigPath === configPath) {
      throw new AiProxyError(ErrorCode.CONFIG, buildConfigFileMissingMessage(configPath), err)
    }

    try {
      // Older setup:ai-config writes to Electron's default userData dir. Copy it forward once.
      const legacyData = await fs.readFile(legacyConfigPath)
      await fs.mkdir(dirname(configPath), { recursive: true })
      await fs.writeFile(configPath, legacyData)
      return legacyData
    } catch (legacyErr: unknown) {
      const legacyNodeErr = legacyErr as NodeJS.ErrnoException
      if (legacyNodeErr.code === 'ENOENT') {
        throw new AiProxyError(ErrorCode.CONFIG, buildConfigFileMissingMessage(configPath), err)
      }
      throw new AiProxyError(
        ErrorCode.CONFIG,
        `无法迁移旧 AI 配置文件: ${legacyNodeErr.message}`,
        legacyErr
      )
    }
  }
}

function getProviderApiKey(
  config: AiProxyConfig | null,
  provider: AiProviderName
): string | undefined {
  if (!config) return undefined
  return provider === 'claude' ? config.anthropicApiKey : config.openaiApiKey
}

async function loadExistingAiProxyConfig(): Promise<AiProxyConfig | null> {
  try {
    return await getAiProxyConfig()
  } catch (err) {
    if (err instanceof AiProxyError && err.code === ErrorCode.CONFIG) {
      return null
    }
    throw err
  }
}

/**
 * Read and decrypt AI proxy configuration from local encrypted file.
 * Throws AiProxyError if file missing, corrupt, or invalid.
 */
export async function getAiProxyConfig(): Promise<AiProxyConfig> {
  const configPath = getConfigPath()

  const data = await readConfigFile(configPath)

  let json: string
  try {
    json = decryptConfig(data)
  } catch (err) {
    throw new AiProxyError(
      ErrorCode.CONFIG,
      'AI 配置文件解密失败，文件可能已损坏或在其他机器上创建',
      err
    )
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(json) as Record<string, unknown>
  } catch (err) {
    throw new AiProxyError(ErrorCode.CONFIG, 'AI 配置文件格式错误，JSON 解析失败', err)
  }

  if (!config.provider || !['claude', 'openai'].includes(config.provider as string)) {
    throw new AiProxyError(
      ErrorCode.CONFIG,
      'AI 配置缺少有效的 provider 字段（需为 "claude" 或 "openai"）'
    )
  }

  return {
    provider: config.provider as AiProviderName,
    anthropicApiKey: readOptionalString(config, 'anthropicApiKey'),
    openaiApiKey: readOptionalString(config, 'openaiApiKey'),
    // baseUrl with openaiBaseUrl fallback for backwards-compat
    baseUrl: readOptionalString(config, 'baseUrl') ?? readOptionalString(config, 'openaiBaseUrl'),
    defaultModel: readOptionalString(config, 'defaultModel'),
    desensitizeEnabled: config.desensitizeEnabled !== false,
  }
}

/**
 * CLI helper for first-time AI config setup (Alpha).
 * Story 9.2 will provide admin UI wizard.
 */
export async function setupAiConfig(config: AiProxyConfig): Promise<void> {
  const configPath = getConfigPath()
  await fs.mkdir(dirname(configPath), { recursive: true })
  const plaintext = JSON.stringify(config, null, 2)
  const encrypted = encryptConfig(plaintext)
  await fs.writeFile(configPath, encrypted)
}

export async function getAiProxyConfigStatus(): Promise<AiConfigStatus> {
  const configPath = getConfigPath()

  try {
    const config = await getAiProxyConfig()
    const apiKey = getProviderApiKey(config, config.provider)
    return {
      configured: Boolean(apiKey),
      configPath,
      provider: config.provider,
      defaultModel: config.defaultModel,
      baseUrl: config.baseUrl,
      desensitizeEnabled: config.desensitizeEnabled,
      hasApiKey: Boolean(apiKey),
    }
  } catch (err) {
    if (err instanceof AiProxyError && err.code === ErrorCode.CONFIG) {
      return {
        configured: false,
        configPath,
        desensitizeEnabled: true,
        hasApiKey: false,
        lastError: err.message,
      }
    }

    throw err
  }
}

export async function saveAiProxyConfig(input: SaveAiProxyConfigInput): Promise<void> {
  const provider = input.provider
  const existing = await loadExistingAiProxyConfig()
  const existingProviderKey = getProviderApiKey(existing, provider)
  const nextApiKey = normalizeOptionalString(input.apiKey) ?? existingProviderKey

  if (!nextApiKey) {
    throw new AiProxyError(
      ErrorCode.CONFIG,
      `缺少 ${provider} 的 API Key。${AI_CONFIG_RECOVERY_HINT}`
    )
  }

  const nextConfig: AiProxyConfig = {
    provider,
    anthropicApiKey: provider === 'claude' ? nextApiKey : undefined,
    openaiApiKey: provider === 'openai' ? nextApiKey : undefined,
    baseUrl: normalizeOptionalString(input.baseUrl),
    defaultModel: normalizeOptionalString(input.defaultModel),
    desensitizeEnabled: input.desensitizeEnabled ?? existing?.desensitizeEnabled ?? true,
  }

  await setupAiConfig(nextConfig)
}

export function getAiConfigRecoveryHint(): string {
  return AI_CONFIG_RECOVERY_HINT
}
