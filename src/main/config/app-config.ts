/**
 * Application configuration — unified entry point for all runtime config.
 */
import { app } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import { decryptConfig, encryptConfig } from '@main/config/crypto-config'
import type { AiProxyConfig, AiProviderName } from '@shared/ai-types'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'data', 'config', 'ai-provider.enc')
}

/**
 * Read and decrypt AI proxy configuration from local encrypted file.
 * Throws AiProxyError if file missing, corrupt, or invalid.
 */
export async function getAiProxyConfig(): Promise<AiProxyConfig> {
  const configPath = getConfigPath()

  let data: Buffer
  try {
    data = await fs.readFile(configPath)
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === 'ENOENT') {
      throw new AiProxyError(
        ErrorCode.CONFIG,
        'AI provider 配置文件不存在。请运行 setupAiConfig() 完成首次配置，' +
          `配置文件路径: ${configPath}`,
        err
      )
    }
    throw new AiProxyError(ErrorCode.CONFIG, `无法读取 AI 配置文件: ${nodeErr.message}`, err)
  }

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
    anthropicApiKey: config.anthropicApiKey as string | undefined,
    openaiApiKey: config.openaiApiKey as string | undefined,
    defaultModel: config.defaultModel as string | undefined,
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
