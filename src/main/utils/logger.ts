type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${module}] ${message}`
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
      if (shouldLog('debug')) console.debug(formatMessage('debug', module, message), ...args)
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) console.info(formatMessage('info', module, message), ...args)
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(formatMessage('warn', module, message), ...args)
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) console.error(formatMessage('error', module, message), ...args)
    },
  }
}
