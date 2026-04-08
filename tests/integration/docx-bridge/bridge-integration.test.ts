import { describe, it, expect, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'

const PYTHON_CWD = resolve(__dirname, '../../../python')
const PYTHON_SRC = join(PYTHON_CWD, 'src')
const STARTUP_TIMEOUT = 30_000
const TMP_DIR = resolve(__dirname, '../../../test-results/integration-docx')

function resolvePythonExe(): string {
  // Prefer venv Python if available
  const venvPython = join(PYTHON_CWD, '.venv', 'bin', 'python3')
  if (existsSync(venvPython)) return venvPython
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

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Python process did not emit READY within timeout'))
    }, STARTUP_TIMEOUT)

    let stdoutBuffer = ''

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
          resolve({ port, pid: child.pid! })
          return
        }
      }
    })

    child.stderr!.on('data', (data: Buffer) => {
      // Suppress stderr in test output unless debugging
      if (process.env.DEBUG) {
        console.error(`[Python stderr] ${data.toString().trim()}`)
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
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
