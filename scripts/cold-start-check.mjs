/**
 * Cold-start smoke test for the packaged Electron app.
 *
 * 1. Runs `electron-builder --dir` to produce an unpacked platform build.
 * 2. Launches the resulting binary.
 * 3. Captures stdout for the `cold-start: <N>ms` timing log.
 * 4. Asserts the value is < 5000 ms.
 */
import { execSync, spawn } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

const THRESHOLD_MS = 5000
const LAUNCH_TIMEOUT_MS = 30000
const root = resolve(import.meta.dirname, '..')

function parseColdStartMs(output) {
  const match = output.match(/cold-start:\s*([\d.]+)\s*(ms|s)/)
  if (!match) return null

  const value = parseFloat(match[1])
  if (Number.isNaN(value)) return null

  return match[2] === 's' ? value * 1000 : value
}

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

// ── Step 2b: Validate build output integrity ───────────────────────────
// Verify critical files inside the asar archive are not corrupted.
// With asar enabled, Electron can read files out of app.asar transparently
// via the patched fs module, but this script runs in plain Node. We read the
// asar header directly to validate file offsets without needing the full
// asar npm package.
function validateBuildIntegrity() {
  const distDir = join(root, 'dist')

  if (process.platform === 'darwin') {
    const macDir = readdirSync(distDir).find((d) => d.startsWith('mac'))
    if (!macDir) return
    const appDir = readdirSync(join(distDir, macDir)).find((f) => f.endsWith('.app'))
    if (!appDir) return
    const resourcesDir = join(distDir, macDir, appDir, 'Contents', 'Resources')

    const asarPath = join(resourcesDir, 'app.asar')
    const unpackedDir = join(resourcesDir, 'app')

    if (existsSync(asarPath)) {
      // Read asar header to validate structure.
      // Asar uses Chromium Pickle encoding:
      //   [0..3]  size pickle payload size (uint32 LE)
      //   [4..7]  header data region size (uint32 LE)
      //   [8..]   header pickle:
      //     [8..11]  header pickle payload size
      //     [12..15] JSON string length
      //     [16..]   JSON header string
      const buf = readFileSync(asarPath)
      const headerDataSize = buf.readUInt32LE(4)
      const headerPickle = buf.subarray(8, 8 + headerDataSize)
      const stringLength = headerPickle.readUInt32LE(4)
      const headerJson = headerPickle.subarray(8, 8 + stringLength).toString('utf8')
      try {
        const header = JSON.parse(headerJson)
        if (!header.files) throw new Error('asar header missing "files" key')
        console.log('  asar header is valid JSON with files index.')
      } catch (e) {
        console.error('FAIL: app.asar header is malformed — asar corruption detected.')
        console.error(`  Parse error: ${e.message}`)
        console.error(`  First 200 chars of header: ${headerJson.slice(0, 200)}`)
        process.exit(2)
      }
    } else if (existsSync(unpackedDir)) {
      // Fallback: asar disabled, validate unpacked files directly
      const pkgJsonPath = join(unpackedDir, 'package.json')
      if (existsSync(pkgJsonPath)) {
        const content = readFileSync(pkgJsonPath, 'utf8')
        try {
          JSON.parse(content)
        } catch {
          console.error('FAIL: package.json in build output is malformed:')
          console.error(`  First 200 chars: ${content.slice(0, 200)}`)
          process.exit(2)
        }
      }
    }

    // Verify native modules are unpacked (not trapped inside asar)
    const unpackedAsarDir = join(resourcesDir, 'app.asar.unpacked')
    if (existsSync(asarPath) && existsSync(unpackedAsarDir)) {
      const sqliteNode = join(
        unpackedAsarDir,
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node'
      )
      if (existsSync(sqliteNode)) {
        console.log('  better-sqlite3 native module correctly unpacked.')
      } else {
        console.error('WARN: better-sqlite3 .node binary not found in app.asar.unpacked/')
        console.error('  Native modules may fail to load at runtime.')
      }
    }
  }
}

validateBuildIntegrity()
console.log('Build integrity check passed.')

console.log(`Launching binary: ${binaryPath}`)

// ── Step 2c: Re-sign on macOS to avoid dyld library-validation errors ──
if (process.platform === 'darwin') {
  // electron-builder --dir may produce an ad-hoc or partially-signed bundle.
  // Re-sign with ad-hoc identity so macOS dyld accepts the binary.
  const appBundle = binaryPath.replace(/\/Contents\/MacOS\/.*$/, '')
  console.log(`Re-signing app bundle: ${appBundle}`)
  try {
    execSync(`codesign --force --deep --sign - "${appBundle}"`, {
      cwd: root,
      stdio: 'inherit',
    })
  } catch (signErr) {
    console.error(
      `FAIL: Code signing failed — this is a signing/packaging issue, not a performance issue.`
    )
    console.error(`  App bundle: ${appBundle}`)
    console.error(`  Error: ${signErr.message}`)
    console.error(`  Fix: check Xcode command-line tools, SIP settings, or run with --no-sign.`)
    process.exit(2)
  }
}

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
    const ms = parseColdStartMs(output)
    if (ms !== null) {
      clearTimeout(timer)
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
