import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('mermaid-runtime-client')

const STARTUP_TIMEOUT_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000

type MermaidFailureKind = 'infrastructure'

export interface MermaidValidationResult {
  valid: boolean
  error?: string
  failureKind?: MermaidFailureKind
}

type RuntimeReadyMessage = {
  type: 'ready'
}

type RuntimeValidateResultMessage = {
  type: 'validate:result'
  requestId: string
  result: MermaidValidationResult
}

type RuntimeLogMessage = {
  type: 'log'
  level: 'info' | 'warn' | 'error'
  message: string
}

type RuntimeMessage = RuntimeReadyMessage | RuntimeValidateResultMessage | RuntimeLogMessage

type PendingRequest = {
  resolve: (value: MermaidValidationResult) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

let requestSequence = 0

function nextRequestId(): string {
  requestSequence += 1
  return `mermaid-runtime-${requestSequence}`
}

function safeAppPath(): string | null {
  try {
    return app.getAppPath()
  } catch {
    return null
  }
}

function resolveRuntimeScriptPath(): string {
  const envPath = process.env.BIDWISE_MERMAID_RUNTIME_SCRIPT
  const candidates = [
    envPath,
    resolve(process.cwd(), 'resources', 'mermaid-runtime', 'index.mjs'),
    safeAppPath() ? resolve(safeAppPath()!, 'resources', 'mermaid-runtime', 'index.mjs') : null,
    process.resourcesPath
      ? join(process.resourcesPath, 'resources', 'mermaid-runtime', 'index.mjs')
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate))

  const scriptPath = candidates.find((candidate) => existsSync(candidate))
  if (!scriptPath) {
    throw new Error(`Mermaid runtime script not found. Checked: ${candidates.join(', ')}`)
  }

  return scriptPath
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, BIDWISE_MERMAID_RUNTIME_CHILD: '1' }
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1'
  }
  return env
}

export class MermaidRuntimeClient {
  private child: ChildProcess | null = null
  private startPromise: Promise<void> | null = null
  private pending = new Map<string, PendingRequest>()

  async validate(source: string): Promise<MermaidValidationResult> {
    await this.ensureStarted()
    const child = this.child

    if (!child?.connected) {
      return {
        valid: false,
        error: 'Mermaid runtime unavailable',
        failureKind: 'infrastructure',
      }
    }

    return new Promise<MermaidValidationResult>((resolve, reject) => {
      const requestId = nextRequestId()
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Mermaid runtime request timed out (${REQUEST_TIMEOUT_MS}ms)`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(requestId, { resolve, reject, timeout })
      child.send({ type: 'validate', requestId, source }, (error) => {
        if (!error) return
        clearTimeout(timeout)
        this.pending.delete(requestId)
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    this.startPromise = null
    this.child = null

    if (!child) return

    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error(`Mermaid runtime stopped while request ${requestId} was pending`))
    }
    this.pending.clear()

    if (!child.connected) {
      child.kill('SIGTERM')
      return
    }

    await new Promise<void>((resolve) => {
      let finished = false
      const finish = (): void => {
        if (finished) return
        finished = true
        resolve()
      }

      const timer = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGTERM')
        }
        finish()
      }, 2_000)

      child.once('exit', () => {
        clearTimeout(timer)
        finish()
      })

      child.send({ type: 'shutdown' }, () => {
        if (child.exitCode !== null) {
          clearTimeout(timer)
          finish()
        }
      })
    })
  }

  private async ensureStarted(): Promise<void> {
    if (this.child?.connected) return
    if (this.startPromise) return this.startPromise

    this.startPromise = this.spawnChild()

    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private async spawnChild(): Promise<void> {
    const scriptPath = resolveRuntimeScriptPath()

    await this.stop()

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const child = spawn(process.execPath, [scriptPath], {
        env: buildChildEnv(),
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })

      this.child = child

      const startupTimer = setTimeout(() => {
        finishStartup(new Error(`Mermaid runtime startup timed out (${STARTUP_TIMEOUT_MS}ms)`))
      }, STARTUP_TIMEOUT_MS)

      const finishStartup = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(startupTimer)
        if (error) {
          if (child.exitCode === null) {
            child.kill('SIGTERM')
          }
          reject(error)
          return
        }
        resolve()
      }

      child.on('message', (message: RuntimeMessage) => {
        if (message?.type === 'ready') {
          logger.info('Mermaid runtime ready')
          finishStartup()
          return
        }

        if (message?.type === 'validate:result') {
          this.resolvePending(message.requestId, message.result)
          return
        }

        if (message?.type === 'log') {
          const logMethod =
            message.level === 'error'
              ? logger.error
              : message.level === 'warn'
                ? logger.warn
                : logger.info
          logMethod(`[runtime] ${message.message}`)
        }
      })

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim()
        if (output) {
          logger.info(`[runtime stdout] ${output}`)
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim()
        if (output) {
          logger.warn(`[runtime stderr] ${output}`)
        }
      })

      child.on('exit', (code, signal) => {
        const error = new Error(
          `Mermaid runtime exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
        )
        if (!settled) {
          finishStartup(error)
        }
        const pending = Array.from(this.pending.values())
        this.pending.clear()
        for (const entry of pending) {
          clearTimeout(entry.timeout)
          entry.reject(error)
        }

        if (this.child?.pid === child.pid) {
          this.child = null
        }

        if (code !== 0 && code !== null) {
          logger.warn(error.message)
        }
      })

      child.once('error', (error) => {
        finishStartup(error)
      })
    })
  }

  private resolvePending(requestId: string, result: MermaidValidationResult): void {
    const pending = this.pending.get(requestId)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(requestId)
    pending.resolve(result)
  }
}

export const mermaidRuntimeClient = new MermaidRuntimeClient()
