import { basename, join } from 'path'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { createLogger } from '@main/utils/logger'
import { ValidationError } from '@main/utils/errors'
import type {
  SaveAiDiagramAssetInput,
  SaveAiDiagramAssetOutput,
  LoadAiDiagramAssetInput,
  LoadAiDiagramAssetOutput,
  DeleteAiDiagramAssetInput,
} from '@shared/ai-diagram-types'

const logger = createLogger('ai-diagram-asset-service')

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

async function saveAiDiagramAsset(
  input: SaveAiDiagramAssetInput
): Promise<SaveAiDiagramAssetOutput> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = await ensureAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  await writeFile(assetPath, input.svgContent, 'utf-8')
  logger.info(`Saved ai-diagram asset: ${assetPath}`)
  return { assetPath }
}

async function loadAiDiagramAsset(
  input: LoadAiDiagramAssetInput
): Promise<LoadAiDiagramAssetOutput | null> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  try {
    const svgContent = await readFile(assetPath, 'utf-8')
    return { svgContent }
  } catch {
    logger.debug(`AI diagram asset not found: ${assetPath}`)
    return null
  }
}

async function deleteAiDiagramAsset(input: DeleteAiDiagramAssetInput): Promise<void> {
  validateAssetFileName(input.assetFileName)
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.assetFileName)

  await rm(assetPath, { force: true })
  logger.info(`Deleted ai-diagram asset: ${assetPath}`)
}

export const aiDiagramAssetService = {
  saveAiDiagramAsset,
  loadAiDiagramAsset,
  deleteAiDiagramAsset,
}
