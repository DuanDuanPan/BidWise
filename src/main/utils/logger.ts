import { app } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { inspect } from 'util'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'
let fileWriteChain = Promise.resolve()

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${message}`
}

function getLogDir(): string {
  return join(app.getPath('userData'), 'data', 'logs', 'app')
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10)
  return join(getLogDir(), `${date}.log`)
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  return inspect(arg, {
    depth: 6,
    breakLength: 120,
    maxArrayLength: 20,
    maxStringLength: 4000,
    compact: true,
  })
}

function appendLogLine(line: string): void {
  fileWriteChain = fileWriteChain
    .then(async () => {
      await mkdir(getLogDir(), { recursive: true })
      await appendFile(getLogFilePath(), `${line}\n`, 'utf-8')
    })
    .catch((error) => {
      console.error('[logger:file-sink] append failed', error)
    })
}

function writeLog(level: LogLevel, module: string, message: string, args: unknown[]): void {
  const formatted = formatMessage(level, module, message)
  const suffix = args.length > 0 ? ` ${args.map((arg) => formatArg(arg)).join(' ')}` : ''
  const line = `${formatted}${suffix}`

  if (level === 'debug') console.debug(line)
  if (level === 'info') console.info(line)
  if (level === 'warn') console.warn(line)
  if (level === 'error') console.error(line)

  appendLogLine(line)
}

type Logger = {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

export function createLogger(module: string): Logger {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) writeLog('debug', module, message, args)
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) writeLog('info', module, message, args)
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) writeLog('warn', module, message, args)
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) writeLog('error', module, message, args)
    },
  }
}
