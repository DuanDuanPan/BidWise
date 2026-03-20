/**
 * AI call-chain JSONL trace logger.
 * Writes desensitized input + output only — never records restored plaintext.
 * Directory created by ensureDataDirectories() at startup.
 */
import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { createLogger } from '@main/utils/logger'
import type { AiChatMessage } from '@shared/ai-types'
import type { DesensitizeStats } from '@main/services/ai-proxy/desensitizer'

const logger = createLogger('ai-proxy')

export interface TraceEntry {
  timestamp: string
  caller: string
  provider: string
  model: string
  desensitizedInput: AiChatMessage[]
  outputContent: string | null
  inputTokens: number
  outputTokens: number
  latencyMs: number
  status: 'success' | 'error'
  errorCode?: string
  errorMessage?: string
  desensitizeStats: DesensitizeStats
}

function getLogDir(): string {
  return join(app.getPath('userData'), 'data', 'logs', 'ai-trace')
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10)
  return join(getLogDir(), `${date}.jsonl`)
}

export async function writeTrace(entry: TraceEntry): Promise<void> {
  const line = JSON.stringify(entry) + '\n'
  try {
    await fs.appendFile(getLogFile(), line, 'utf8')
  } catch (err) {
    // Defensive: if directory doesn't exist at runtime, try to create it
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === 'ENOENT') {
      await fs.mkdir(getLogDir(), { recursive: true })
      await fs.appendFile(getLogFile(), line, 'utf8')
    } else {
      logger.error('Failed to write AI trace log', err)
      throw err
    }
  }
}
