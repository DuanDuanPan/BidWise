import { spawn, type ChildProcess } from 'child_process'
import { join, resolve } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { DocxBridgeError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { ErrorCode } from '@shared/constants'
import type { DocxBridgeStatus } from '@shared/docx-types'

const logger = createLogger('docx-bridge-process')

const STARTUP_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const HEALTH_CHECK_INTERVAL_MS = 30_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000
const MAX_CONSECUTIVE_FAILURES = 3

function resolvePythonExecutable(): string {
  if (is.dev) {
    const cwd = resolve(app.getAppPath(), 'python')
    const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin'
    const venvExe = process.platform === 'win32' ? 'python.exe' : 'python3'
    return join(cwd, '.venv', venvBin, venvExe)
  }
  const ext = process.platform === 'win32' ? 'python.exe' : 'python3'
  return join(process.resourcesPath, 'python', 'bin', ext)
}

function resolvePythonCwd(): string {
  if (is.dev) {
    return resolve(app.getAppPath(), 'python')
  }
  return join(process.resourcesPath, 'python')
}

export class ProcessManager {
  private child: ChildProcess | null = null
  private port: number | null = null
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private consecutiveFailures = 0
  private isRestarting = false
  private intentionalStop = false

  async startProcess(): Promise<{ port: number; pid: number }> {
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.spawnOnce()
        logger.info(
          `Python 进程启动成功 (port=${result.port}, pid=${result.pid}, attempt=${attempt})`
        )
        return result
      } catch (err) {
        lastError = err
        logger.warn(`Python 进程启动失败 (attempt ${attempt}/${MAX_RETRIES}): ${err}`)
        this.cleanup()
      }
    }

    throw new DocxBridgeError(
      ErrorCode.DOCX_BRIDGE_UNAVAILABLE,
      `Python 进程启动失败，已重试 ${MAX_RETRIES} 次`,
      lastError
    )
  }

  async stopProcess(): Promise<void> {
    this.intentionalStop = true
    this.stopHealthCheck()

    if (!this.child) return

    const port = this.port

    // Try graceful shutdown first
    if (port) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5_000)
        await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
          method: 'POST',
          signal: controller.signal,
        })
        clearTimeout(timeout)

        // Wait up to 5 seconds for process to exit
        const exited = await this.waitForExit(5_000)
        if (exited) {
          logger.info('Python 进程优雅关闭完成')
          this.cleanup()
          return
        }
      } catch {
        logger.warn('Shutdown 请求失败，将发送 SIGTERM')
      }
    }

    // SIGTERM
    if (this.child && this.child.exitCode === null) {
      this.child.kill('SIGTERM')
      const exited = await this.waitForExit(2_000)
      if (exited) {
        logger.info('Python 进程 SIGTERM 关闭完成')
        this.cleanup()
        return
      }
    }

    // SIGKILL — check exitCode, not killed (killed only means "signal was sent")
    if (this.child && this.child.exitCode === null) {
      this.child.kill('SIGKILL')
      logger.warn('Python 进程已 SIGKILL 强制终止')
    }

    this.cleanup()
  }

  async restartProcess(): Promise<void> {
    if (this.isRestarting) return
    this.isRestarting = true

    try {
      logger.info('正在重启 Python 进程...')
      this.intentionalStop = false
      await this.stopProcess()
      this.intentionalStop = false
      await this.startProcess()
      this.startHealthCheck()
    } finally {
      this.isRestarting = false
    }
  }

  getStatus(): DocxBridgeStatus {
    return {
      ready: this.child !== null && this.port !== null && this.child.exitCode === null,
      port: this.port ?? undefined,
      pid: this.child?.pid ?? undefined,
    }
  }

  startHealthCheck(): void {
    this.stopHealthCheck()
    this.consecutiveFailures = 0

    this.healthCheckTimer = setInterval(async () => {
      if (!this.port || this.isRestarting) return

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
        const response = await fetch(`http://127.0.0.1:${this.port}/api/health`, {
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (response.ok) {
          this.consecutiveFailures = 0
          return
        }
        this.consecutiveFailures++
      } catch {
        this.consecutiveFailures++
      }

      logger.warn(`健康检查失败 (${this.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error('连续健康检查失败达到阈值，触发重启')
        this.consecutiveFailures = 0
        void this.restartProcess()
      }
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private spawnOnce(): Promise<{ port: number; pid: number }> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = <T>(fn: (v: T) => void, v: T): void => {
        if (settled) return
        settled = true
        fn(v)
      }

      const pythonExe = resolvePythonExecutable()
      const cwd = resolvePythonCwd()
      const pythonPath = join(cwd, 'src')

      const child = spawn(
        pythonExe,
        ['-m', 'docx_renderer', '--host', '127.0.0.1', '--port', '0'],
        {
          cwd,
          env: { ...process.env, PYTHONPATH: pythonPath },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )

      this.child = child

      const timeoutId = setTimeout(() => {
        settle(
          reject,
          new DocxBridgeError(
            ErrorCode.DOCX_BRIDGE_UNAVAILABLE,
            `Python 进程启动超时 (${STARTUP_TIMEOUT_MS}ms)`
          )
        )
      }, STARTUP_TIMEOUT_MS)

      let stdoutBuffer = ''

      child.stdout!.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const match = /^READY:(\d+)$/.exec(line.trim())
          if (match) {
            clearTimeout(timeoutId)
            const port = parseInt(match[1], 10)
            this.port = port

            // Set up exit handler for auto-restart
            child.on('exit', (code) => {
              logger.info(`Python 进程退出 (code=${code})`)
              if (!this.intentionalStop && !this.isRestarting) {
                logger.warn('Python 进程意外退出，触发自动重启')
                void this.restartProcess()
              }
            })

            settle(resolve, { port, pid: child.pid! })
            return
          }
        }
      })

      child.stderr!.on('data', (data: Buffer) => {
        logger.debug(`Python stderr: ${data.toString().trim()}`)
      })

      child.on('error', (err) => {
        clearTimeout(timeoutId)
        settle(
          reject,
          new DocxBridgeError(
            ErrorCode.DOCX_BRIDGE_UNAVAILABLE,
            `Python 进程启动错误: ${err.message}`,
            err
          )
        )
      })

      child.on('exit', (code) => {
        clearTimeout(timeoutId)
        if (!this.port) {
          settle(
            reject,
            new DocxBridgeError(
              ErrorCode.DOCX_BRIDGE_UNAVAILABLE,
              `Python 进程未输出 READY 信号即退出 (code=${code})`
            )
          )
        }
      })
    })
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.child) {
        resolve(true)
        return
      }

      // Check if process already exited (exitCode is non-null after exit)
      if (this.child.exitCode !== null) {
        resolve(true)
        return
      }

      const timer = setTimeout(() => {
        resolve(false)
      }, timeoutMs)

      this.child.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  private cleanup(): void {
    if (this.child && this.child.exitCode === null) {
      try {
        this.child.kill('SIGKILL')
      } catch {
        // already dead
      }
    }
    this.child = null
    this.port = null
  }
}

export const processManager = new ProcessManager()
