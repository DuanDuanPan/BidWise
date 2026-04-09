import { describe, it, expect, afterAll } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'

const PYTHON_CWD = resolve(__dirname, '../../../python')
const PYTHON_SRC = join(PYTHON_CWD, 'src')
const STARTUP_TIMEOUT = 30_000
const TMP_DIR = resolve(__dirname, '../../../test-results/integration-docx')

function resolvePythonExe(): string {
  // 1. Explicit override (CI, worktrees, custom setups)
  if (process.env.BIDWISE_PYTHON_EXE) return process.env.BIDWISE_PYTHON_EXE

  // 2. Local venv
  const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin'
  const venvExeName = process.platform === 'win32' ? 'python.exe' : 'python3'
  const venvPython = join(PYTHON_CWD, '.venv', venvBin, venvExeName)
  if (existsSync(venvPython)) return venvPython

  // 3. Main worktree venv (for git worktree checkouts where .venv is gitignored)
  try {
    const result = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: PYTHON_CWD,
      encoding: 'utf8',
    })
    if (result.status === 0) {
      const mainRoot = resolve(result.stdout.trim(), '..')
      const mainVenv = join(mainRoot, 'python', '.venv', venvBin, venvExeName)
      if (existsSync(mainVenv)) return mainVenv
    }
  } catch {
    // git not available — skip
  }

  // 4. System Python (last resort)
  return process.platform === 'win32' ? 'python' : 'python3'
}

let pythonProcess: ChildProcess | null = null
let actualPort: number | null = null

function startPythonProcess(): Promise<{ port: number; pid: number }> {
  return new Promise((resolve, reject) => {
    const pythonExe = resolvePythonExe()

    const child = spawn(pythonExe, ['-m', 'docx_renderer', '--host', '127.0.0.1', '--port', '0'], {
      cwd: PYTHON_CWD,
      env: { ...process.env, PYTHONPATH: PYTHON_SRC },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    pythonProcess = child
    let settled = false

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      if (!settled) {
        settled = true
        reject(new Error('Python process did not emit READY within timeout'))
      }
    }, STARTUP_TIMEOUT)

    let stdoutBuffer = ''
    let stderrBuffer = ''

    child.stdout!.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const match = /^READY:(\d+)$/.exec(line.trim())
        if (match) {
          clearTimeout(timeout)
          const port = parseInt(match[1], 10)
          actualPort = port
          if (!settled) {
            settled = true
            resolve({ port, pid: child.pid! })
          }
          return
        }
      }
    })

    child.stderr!.on('data', (data: Buffer) => {
      stderrBuffer += data.toString()
      if (process.env.DEBUG) {
        console.error(`[Python stderr] ${data.toString().trim()}`)
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    // Fail fast if Python exits before emitting READY
    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        const detail = stderrBuffer.trim() ? `\nstderr: ${stderrBuffer.trim()}` : ''
        reject(new Error(`Python process exited before READY (code=${code})${detail}`))
      }
    })
  })
}

describe('docx-bridge integration (real Python process)', () => {
  // Setup: start real Python process
  it(
    'starts Python process and receives READY:{port}',
    async () => {
      const result = await startPythonProcess()
      expect(result.port).toBeGreaterThan(0)
      expect(result.pid).toBeGreaterThan(0)
    },
    STARTUP_TIMEOUT
  )

  it('GET /api/health returns healthy status', async () => {
    expect(actualPort).not.toBeNull()

    const response = await fetch(`http://127.0.0.1:${actualPort}/api/health`)
    expect(response.ok).toBe(true)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('healthy')
    expect(body.data.version).toBe('0.1.0')
    expect(typeof body.data.uptimeSeconds).toBe('number')
  })

  it('POST /api/render-documents produces docx file', async () => {
    expect(actualPort).not.toBeNull()

    mkdirSync(TMP_DIR, { recursive: true })
    const outputPath = join(TMP_DIR, 'integration-test.docx')

    const response = await fetch(`http://127.0.0.1:${actualPort}/api/render-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdownContent: '# Integration Test\n\nThis is a paragraph.\n\n- bullet item',
        outputPath,
        projectId: 'integration-test',
      }),
    })

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.outputPath).toBe(outputPath)
    expect(body.data.renderTimeMs).toBeGreaterThanOrEqual(0)
    expect(existsSync(outputPath)).toBe(true)
  })

  it('POST /api/shutdown returns accepted', async () => {
    expect(actualPort).not.toBeNull()

    const response = await fetch(`http://127.0.0.1:${actualPort}/api/shutdown`, {
      method: 'POST',
    })

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.accepted).toBe(true)
  })

  afterAll(() => {
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill('SIGKILL')
    }
    // Clean up temp files
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })
})
