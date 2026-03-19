/**
 * Cold-start smoke test for the packaged Electron app.
 *
 * 1. Runs `electron-builder --dir` to produce an unpacked platform build.
 * 2. Launches the resulting binary.
 * 3. Captures stdout for the `cold-start: <N>ms` timing log.
 * 4. Asserts the value is < 5000 ms.
 */
import { execSync, spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

const THRESHOLD_MS = 5000
const LAUNCH_TIMEOUT_MS = 30000
const root = resolve(import.meta.dirname, '..')

// ── Step 1: Build unpacked app ──────────────────────────────────────────
console.log('Building unpacked app with electron-builder --dir …')
execSync('pnpm build && pnpm exec electron-builder --dir', {
  cwd: root,
  stdio: 'inherit',
})

// ── Step 2: Locate the platform binary ──────────────────────────────────
function findBinary() {
  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) {
    throw new Error(`dist/ directory not found after build.`)
  }

  if (process.platform === 'darwin') {
    // Look for mac-arm64 or mac-x64 or mac-universal directory
    const macDir = readdirSync(distDir).find((d) => d.startsWith('mac'))
    if (!macDir) throw new Error('No mac* directory found in dist/')
    const appDir = readdirSync(join(distDir, macDir)).find((f) => f.endsWith('.app'))
    if (!appDir) throw new Error('No .app bundle found in dist/' + macDir)
    return join(distDir, macDir, appDir, 'Contents', 'MacOS', appDir.replace('.app', ''))
  }

  if (process.platform === 'win32') {
    const winDir = readdirSync(distDir).find((d) => d.startsWith('win'))
    if (!winDir) throw new Error('No win* directory found in dist/')
    const exe = readdirSync(join(distDir, winDir)).find((f) => f.endsWith('.exe'))
    if (!exe) throw new Error('No .exe found in dist/' + winDir)
    return join(distDir, winDir, exe)
  }

  // Linux
  const linuxDir = readdirSync(distDir).find((d) => d.startsWith('linux'))
  if (!linuxDir) throw new Error('No linux* directory found in dist/')
  const appImage = readdirSync(join(distDir, linuxDir)).find(
    (f) => !f.endsWith('.txt') && !f.endsWith('.yml')
  )
  if (!appImage) throw new Error('No binary found in dist/' + linuxDir)
  return join(distDir, linuxDir, appImage)
}

const binaryPath = findBinary()
console.log(`Launching binary: ${binaryPath}`)

// ── Step 3: Launch and capture cold-start time ──────────────────────────
const coldStartMs = await new Promise((resolve, reject) => {
  const child = spawn(binaryPath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  })

  let output = ''
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    reject(new Error(`Timed out after ${LAUNCH_TIMEOUT_MS}ms without cold-start log`))
  }, LAUNCH_TIMEOUT_MS)

  function processOutput(chunk) {
    output += chunk.toString()
    const match = output.match(/cold-start:\s*([\d.]+)\s*ms/)
    if (match) {
      clearTimeout(timer)
      const ms = parseFloat(match[1])
      child.kill('SIGTERM')
      resolve(ms)
    }
  }

  child.stdout.on('data', processOutput)
  child.stderr.on('data', processOutput)

  child.on('error', (err) => {
    clearTimeout(timer)
    reject(err)
  })

  child.on('close', (code) => {
    clearTimeout(timer)
    if (!output.match(/cold-start/)) {
      reject(
        new Error(
          `App exited (code ${code}) without emitting cold-start timing.\nOutput: ${output}`
        )
      )
    }
  })
})

// ── Step 4: Assert threshold ────────────────────────────────────────────
console.log(`\nCold-start time: ${coldStartMs.toFixed(1)} ms (threshold: ${THRESHOLD_MS} ms)`)

if (coldStartMs >= THRESHOLD_MS) {
  console.error(`FAIL: Cold-start ${coldStartMs.toFixed(1)} ms >= ${THRESHOLD_MS} ms threshold`)
  process.exit(1)
} else {
  console.log('PASS: Cold-start within threshold.')
}
