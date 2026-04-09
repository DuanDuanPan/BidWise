import { describe, it, expect, afterAll } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'

const PYTHON_CWD = resolve(__dirname, '../../../python')
const PYTHON_SRC = join(PYTHON_CWD, 'src')
const STARTUP_TIMEOUT = 30_000
const TMP_DIR = resolve(__dirname, '../../../test-results/integration-rich-export')

function resolvePythonExe(): string {
  if (process.env.BIDWISE_PYTHON_EXE) return process.env.BIDWISE_PYTHON_EXE

  const venvBin = process.platform === 'win32' ? 'Scripts' : 'bin'
  const venvExeName = process.platform === 'win32' ? 'python.exe' : 'python3'
  const venvPython = join(PYTHON_CWD, '.venv', venvBin, venvExeName)
  if (existsSync(venvPython)) return venvPython

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
    // git not available
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

let pythonProcess: ChildProcess | null = null
let actualPort: number | null = null

function startPythonProcess(): Promise<{ port: number; pid: number }> {
  return new Promise((resolvePromise, reject) => {
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
            resolvePromise({ port, pid: child.pid! })
          }
          return
        }
      }
    })

    child.stderr!.on('data', (data: Buffer) => {
      stderrBuffer += data.toString()
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        reject(err)
      }
    })

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

describe('rich-export integration (Node.js → Python full payload)', () => {
  it(
    'starts Python process',
    async () => {
      const result = await startPythonProcess()
      expect(result.port).toBeGreaterThan(0)
    },
    STARTUP_TIMEOUT
  )

  it('renders with styleMapping/pageSetup/projectPath and returns warnings', async () => {
    expect(actualPort).not.toBeNull()

    mkdirSync(TMP_DIR, { recursive: true })
    const outputPath = join(TMP_DIR, 'rich-export.docx')

    const response = await fetch(`http://127.0.0.1:${actualPort}/api/render-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdownContent:
          '# 第一章 方案概述\n\n这是 **加粗** 和 *斜体* 正文。\n\n## 1.1 技术方案\n\n- 要点一\n- 要点二\n\n```python\ndef hello():\n    pass\n```\n\n| 项目 | 说明 |\n| --- | --- |\n| A | B |\n',
        outputPath,
        projectId: 'rich-test',
        styleMapping: {
          heading1: 'NonExistentH1',
          bodyText: '正文',
        },
        pageSetup: { contentWidthMm: 150 },
        projectPath: TMP_DIR,
      }),
    })

    const body = (await response.json()) as {
      success: boolean
      data: {
        outputPath: string
        renderTimeMs: number
        warnings: string[]
      }
    }

    expect(body.success).toBe(true)
    expect(body.data.outputPath).toBe(outputPath)
    expect(existsSync(outputPath)).toBe(true)
    expect(body.data.renderTimeMs).toBeGreaterThanOrEqual(0)
    // Should have warnings about missing styles
    expect(body.data.warnings).toBeDefined()
    expect(body.data.warnings.length).toBeGreaterThan(0)
    expect(body.data.warnings.some((w: string) => w.includes('NonExistentH1'))).toBe(true)
  })

  it('renders with camelCase fields in request', async () => {
    expect(actualPort).not.toBeNull()
    const outputPath = join(TMP_DIR, 'camel-case-test.docx')

    const response = await fetch(`http://127.0.0.1:${actualPort}/api/render-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdownContent: '# Test',
        outputPath,
        projectId: 'camel-test',
        styleMapping: { heading1: 'Heading 1' },
        pageSetup: { contentWidthMm: 160 },
      }),
    })

    const body = (await response.json()) as {
      success: boolean
      data: { warnings: string[] }
    }
    expect(body.success).toBe(true)
    // Check camelCase response fields
    expect(Array.isArray(body.data.warnings)).toBe(true)
  })

  afterAll(() => {
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill('SIGKILL')
    }
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })
})
