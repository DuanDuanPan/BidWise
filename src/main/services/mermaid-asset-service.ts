import { basename, join } from 'path'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { createLogger } from '@main/utils/logger'
import { ValidationError } from '@main/utils/errors'
import type {
  SaveMermaidAssetInput,
  SaveMermaidAssetOutput,
  LoadMermaidAssetInput,
  LoadMermaidAssetOutput,
  DeleteMermaidAssetInput,
} from '@shared/mermaid-types'

const logger = createLogger('mermaid-asset-service')

function validateAssetFileName(assetFileName: string): void {
  if (!assetFileName.endsWith('.svg')) {
    throw new ValidationError('assetFileName must end with .svg')
  }
  if (assetFileName !== basename(assetFileName)) {
    throw new ValidationError('assetFileName must be a basename without path separators')
  }
  if (assetFileName.includes('\\')) {
    throw new ValidationError('assetFileName must not contain backslashes')
  }
  if (assetFileName.includes('..')) {
    throw new ValidationError('assetFileName must not contain ".."')
  }
}

function getAssetsDir(projectId: string): string {
  const projectPath = resolveProjectDataPath(projectId)
  return join(projectPath, 'assets')
}

async function ensureAssetsDir(projectId: string): Promise<string> {
  const assetsDir = getAssetsDir(projectId)
  await mkdir(assetsDir, { recursive: true })
  return assetsDir
}

async function saveMermaidAsset(input: SaveMermaidAssetInput): Promise<SaveMermaidAssetOutput> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = await ensureAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  await writeFile(assetPath, input.svgContent, 'utf-8')
  logger.info(`Saved mermaid asset: ${assetPath}`)
  return { assetPath }
}

async function loadMermaidAsset(
  input: LoadMermaidAssetInput
): Promise<LoadMermaidAssetOutput | null> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  try {
    const svgContent = await readFile(assetPath, 'utf-8')
    return { svgContent }
  } catch {
    logger.debug(`Mermaid asset not found: ${assetPath}`)
    return null
  }
}

async function deleteMermaidAsset(input: DeleteMermaidAssetInput): Promise<void> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  await rm(assetPath, { force: true })
  logger.info(`Deleted mermaid asset: ${assetPath}`)
}

export const mermaidAssetService = {
  saveMermaidAsset,
  loadMermaidAsset,
  deleteMermaidAsset,
}
