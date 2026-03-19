import { existsSync } from 'fs'
import { join } from 'path'

const requiredDirs = [
  'src/main/ipc',
  'src/main/services',
  'src/main/db',
  'src/main/db/migrations',
  'src/main/db/repositories',
  'src/main/prompts',
  'src/main/utils',
  'src/main/config',
  'src/shared/models',
  'src/renderer/src/stores',
  'src/renderer/src/modules',
  'src/renderer/src/modules/project',
  'src/renderer/src/modules/analysis',
  'src/renderer/src/modules/editor',
  'src/renderer/src/modules/export',
  'src/renderer/src/shared/components',
  'src/renderer/src/shared/hooks',
  'src/renderer/src/shared/lib',
  'tests/unit/main',
  'tests/unit/renderer',
  'tests/integration/ipc',
  'tests/integration/docx-bridge',
  'tests/e2e/flows',
  'tests/fixtures',
  'resources',
]

const requiredFiles = [
  'src/shared/constants.ts',
  'src/shared/ipc-types.ts',
  'src/main/utils/errors.ts',
  'src/main/utils/logger.ts',
  'src/preload/index.ts',
  'src/preload/index.d.ts',
]

let hasError = false

for (const dir of requiredDirs) {
  if (!existsSync(join(process.cwd(), dir))) {
    console.error(`Missing required directory: ${dir}`)
    hasError = true
  }
}

for (const file of requiredFiles) {
  if (!existsSync(join(process.cwd(), file))) {
    console.error(`Missing required file: ${file}`)
    hasError = true
  }
}

if (hasError) {
  console.error('\nStructure verification failed. See errors above.')
  process.exit(1)
} else {
  console.log('Structure verification passed.')
}
