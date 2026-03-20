import { app } from 'electron'
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
}

const ALGORITHM = 'aes-256-cbc'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SCRYPT_COST = 16384

function printUsage() {
  console.log(`Usage:
  pnpm setup:ai-config -- --provider <claude|openai> [--default-model <model>]

Preferred secrets via environment:
  ANTHROPIC_API_KEY=... pnpm setup:ai-config -- --provider claude
  OPENAI_API_KEY=... pnpm setup:ai-config -- --provider openai --default-model gpt-4o-mini

Optional flags:
  --anthropic-api-key <key>
  --openai-api-key <key>
  --desensitize-enabled <true|false>
  --disable-desensitization
  --help

Environment fallbacks:
  AI_PROVIDER
  AI_DEFAULT_MODEL
  AI_DESENSITIZE_ENABLED`)
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

function parseBoolean(value, flagName) {
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  throw new Error(`Invalid boolean for ${flagName}: ${value}`)
}

function parseArgs(argv) {
  const options = {
    provider: process.env.AI_PROVIDER,
    defaultModel: process.env.AI_DEFAULT_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    desensitizeEnabled: process.env.AI_DESENSITIZE_ENABLED
      ? parseBoolean(process.env.AI_DESENSITIZE_ENABLED, 'AI_DESENSITIZE_ENABLED')
      : true,
    help: false,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case '--':
        break
      case '--provider':
        options.provider = takeValue(argv, index, arg)
        index++
        break
      case '--default-model':
        options.defaultModel = takeValue(argv, index, arg)
        index++
        break
      case '--anthropic-api-key':
        options.anthropicApiKey = takeValue(argv, index, arg)
        index++
        break
      case '--openai-api-key':
        options.openaiApiKey = takeValue(argv, index, arg)
        index++
        break
      case '--desensitize-enabled':
        options.desensitizeEnabled = parseBoolean(takeValue(argv, index, arg), arg)
        index++
        break
      case '--disable-desensitization':
        options.desensitizeEnabled = false
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function getMachineIdentity() {
  return `${hostname()}-${userInfo().username}`
}

function deriveKey(salt) {
  return scryptSync(getMachineIdentity(), salt, KEY_LENGTH, { N: SCRYPT_COST })
}

function encryptConfig(plaintext) {
  const salt = randomBytes(16).toString('hex')
  const key = deriveKey(salt)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from(salt, 'utf8'), iv, encrypted])
}

function buildConfig(options) {
  if (!options.provider || !Object.hasOwn(DEFAULT_MODELS, options.provider)) {
    throw new Error('provider is required and must be either "claude" or "openai"')
  }

  const defaultModel = options.defaultModel ?? DEFAULT_MODELS[options.provider]
  const config = {
    provider: options.provider,
    defaultModel,
    desensitizeEnabled: options.desensitizeEnabled,
    ...(options.anthropicApiKey ? { anthropicApiKey: options.anthropicApiKey } : {}),
    ...(options.openaiApiKey ? { openaiApiKey: options.openaiApiKey } : {}),
  }

  if (options.provider === 'claude' && !config.anthropicApiKey) {
    throw new Error('Missing Anthropic API key. Use ANTHROPIC_API_KEY or --anthropic-api-key.')
  }
  if (options.provider === 'openai' && !config.openaiApiKey) {
    throw new Error('Missing OpenAI API key. Use OPENAI_API_KEY or --openai-api-key.')
  }

  return config
}

function getConfigPath() {
  return join(app.getPath('userData'), 'data', 'config', 'ai-provider.enc')
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return 0
  }

  await app.whenReady()

  const config = buildConfig(options)
  const configPath = getConfigPath()
  await fs.mkdir(dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, encryptConfig(JSON.stringify(config, null, 2)))

  console.log(`AI config written to ${configPath}`)
  console.log(
    `provider=${config.provider} model=${config.defaultModel} desensitizeEnabled=${config.desensitizeEnabled}`
  )
  return 0
}

void run()
  .then((code) => {
    app.exit(code)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    printUsage()
    app.exit(1)
  })
