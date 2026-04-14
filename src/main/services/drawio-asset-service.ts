import { join } from 'path'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { createLogger } from '@main/utils/logger'
import type {
  SaveDrawioAssetInput,
  SaveDrawioAssetOutput,
  LoadDrawioAssetInput,
  LoadDrawioAssetOutput,
  DeleteDrawioAssetInput,
} from '@shared/drawio-types'

const logger = createLogger('drawio-asset-service')

function getAssetsDir(projectId: string): string {
  const projectPath = resolveProjectDataPath(projectId)
  return join(projectPath, 'assets')
}

async function ensureAssetsDir(projectId: string): Promise<string> {
  const assetsDir = getAssetsDir(projectId)
  await mkdir(assetsDir, { recursive: true })
  return assetsDir
}

async function saveDrawioAsset(input: SaveDrawioAssetInput): Promise<SaveDrawioAssetOutput> {
  const assetsDir = await ensureAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.fileName)
  const pngFileName = input.fileName.replace(/\.drawio$/, '.png')
  const pngPath = join(assetsDir, pngFileName)

  await writeFile(assetPath, input.xml, 'utf-8')
  if (input.pngBase64) {
    const pngBuffer = Buffer.from(input.pngBase64, 'base64')
    await writeFile(pngPath, pngBuffer)
  }

  logger.info(`Saved drawio asset: ${assetPath}`)
  return { assetPath, pngPath }
}

async function loadDrawioAsset(input: LoadDrawioAssetInput): Promise<LoadDrawioAssetOutput | null> {
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.fileName)
  const pngFileName = input.fileName.replace(/\.drawio$/, '.png')
  const pngPath = join(assetsDir, pngFileName)

  try {
    const xml = await readFile(assetPath, 'utf-8')
    try {
      const pngBuffer = await readFile(pngPath)
      const pngDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`
      return { xml, pngDataUrl }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { xml }
      }
      throw error
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function deleteDrawioAsset(input: DeleteDrawioAssetInput): Promise<void> {
  const assetsDir = getAssetsDir(input.projectId)
  const assetPath = join(assetsDir, input.fileName)
  const pngFileName = input.fileName.replace(/\.drawio$/, '.png')
  const pngPath = join(assetsDir, pngFileName)

  await rm(assetPath, { force: true })
  await rm(pngPath, { force: true })
  logger.info(`Deleted drawio asset: ${assetPath}`)
}

export const drawioAssetService = {
  saveDrawioAsset,
  loadDrawioAsset,
  deleteDrawioAsset,
}
