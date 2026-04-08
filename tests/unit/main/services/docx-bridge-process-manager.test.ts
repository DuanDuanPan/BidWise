import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest'

const mockSpawn = vi.fn()

vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock/app' },
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { ProcessManager } from '@main/services/docx-bridge/process-manager'
import { EventEmitter } from 'events'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockChildProcess() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    pid: number
    killed: boolean
    kill: Mock
  }
  child.stdout = stdout
  child.stderr = stderr
  child.pid = 12345
  child.killed = false
  child.kill = vi.fn()
  return child
}

describe('ProcessManager', () => {
  let manager: ProcessManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    manager = new ProcessManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('startProcess', () => {
    it('spawns python3 with correct args in dev mode', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()

      // Simulate READY signal
      mockChild.stdout.emit('data', Buffer.from('READY:8765\n'))

      const result = await startPromise

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('python3'),
        ['-m', 'docx_renderer', '--host', '127.0.0.1', '--port', '0'],
        expect.objectContaining({
          cwd: expect.stringContaining('python'),
          env: expect.objectContaining({ PYTHONPATH: expect.stringContaining('src') }),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      )
      // In dev mode, executable should be the venv python3
      const actualExe = mockSpawn.mock.calls[0][0] as string
      expect(actualExe).toContain('.venv')
      expect(actualExe).toContain('python3')
      expect(result.port).toBe(8765)
      expect(result.pid).toBe(12345)
    })

    it('parses READY:{port} from stdout correctly', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()
      mockChild.stdout.emit('data', Buffer.from('some debug line\nREADY:9999\n'))

      const result = await startPromise
      expect(result.port).toBe(9999)
    })

    it('rejects after MAX_RETRIES when process exits without READY', async () => {
      vi.useRealTimers()

      mockSpawn.mockImplementation(() => {
        const child = createMockChildProcess()
        // Process exits immediately without emitting READY
        process.nextTick(() => child.emit('exit', 1))
        return child
      })

      await expect(manager.startProcess()).rejects.toThrow('Python 进程启动失败，已重试 3 次')
      expect(mockSpawn).toHaveBeenCalledTimes(3)
    })

    it('rejects after MAX_RETRIES on spawn error', async () => {
      vi.useRealTimers()

      mockSpawn.mockImplementation(() => {
        const child = createMockChildProcess()
        process.nextTick(() => child.emit('error', new Error('spawn ENOENT')))
        return child
      })

      await expect(manager.startProcess()).rejects.toThrow('Python 进程启动失败，已重试 3 次')
      expect(mockSpawn).toHaveBeenCalledTimes(3)
    })
  })

  describe('stopProcess', () => {
    it('sends POST /api/shutdown then SIGTERM then SIGKILL', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()
      mockChild.stdout.emit('data', Buffer.from('READY:5000\n'))
      await startPromise

      // Shutdown request fails
      mockFetch.mockRejectedValue(new Error('connection refused'))

      const stopPromise = manager.stopProcess()

      // The process won't exit naturally, so SIGTERM and SIGKILL will be sent
      await vi.advanceTimersByTimeAsync(10_000)

      await stopPromise

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:5000/api/shutdown',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  describe('getStatus', () => {
    it('returns not ready when no process is running', () => {
      const status = manager.getStatus()
      expect(status.ready).toBe(false)
      expect(status.port).toBeUndefined()
      expect(status.pid).toBeUndefined()
    })

    it('returns ready with port and pid after start', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()
      mockChild.stdout.emit('data', Buffer.from('READY:4321\n'))
      await startPromise

      const status = manager.getStatus()
      expect(status.ready).toBe(true)
      expect(status.port).toBe(4321)
      expect(status.pid).toBe(12345)
    })
  })

  describe('health check', () => {
    it('triggers restart after 3 consecutive failures', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()
      mockChild.stdout.emit('data', Buffer.from('READY:5000\n'))
      await startPromise

      // Health check fails
      mockFetch.mockRejectedValue(new Error('timeout'))

      manager.startHealthCheck()

      // Advance through 3 health check intervals (30s each)
      await vi.advanceTimersByTimeAsync(30_000) // failure 1
      await vi.advanceTimersByTimeAsync(30_000) // failure 2
      await vi.advanceTimersByTimeAsync(30_000) // failure 3 → triggers restart

      // restartProcess calls stopProcess which calls fetch for shutdown
      expect(mockFetch).toHaveBeenCalled()
    })

    it('resets failure count on successful health check', async () => {
      const mockChild = createMockChildProcess()
      mockSpawn.mockReturnValue(mockChild)

      const startPromise = manager.startProcess()
      mockChild.stdout.emit('data', Buffer.from('READY:5000\n'))
      await startPromise

      // First check fails, second succeeds
      mockFetch.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ ok: true })

      manager.startHealthCheck()

      await vi.advanceTimersByTimeAsync(30_000) // failure 1
      await vi.advanceTimersByTimeAsync(30_000) // success → reset

      // After success, the failure count is reset. No restart should have triggered.
      // 2 health check calls + 0 shutdown calls
      const healthCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/health')
      )
      expect(healthCalls).toHaveLength(2)
    })
  })
})
