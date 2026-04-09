import { join, resolve, relative, isAbsolute } from 'path'
import { mkdir } from 'fs/promises'
import { DocxBridgeError } from '@main/utils/errors'
import { ValidationError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { ErrorCode } from '@shared/constants'
import type {
  RenderDocxInput,
  RenderDocxOutput,
  DocxHealthData,
  DocxBridgeStatus,
} from '@shared/docx-types'
import { processManager } from './process-manager'
import { renderDocx as renderDocxHttp, checkHealth as checkHealthHttp } from './render-client'

const logger = createLogger('docx-bridge')

type RenderDocxOptions = {
  signal?: AbortSignal
}

async function start(): Promise<void> {
  try {
    await processManager.startProcess()
    processManager.startHealthCheck()
    logger.info('docx-bridge 启动完成')
  } catch (err) {
    logger.warn(`docx-bridge 启动失败，降级为不可用状态: ${err}`)
  }
}

async function stop(): Promise<void> {
  try {
    await processManager.stopProcess()
    logger.info('docx-bridge 已停止')
  } catch (err) {
    logger.error(`docx-bridge 停止异常: ${err}`)
  }
}

function validateOutputPath(projectId: string, outputPath: string): string {
  const projectRoot = resolveProjectDataPath(projectId)
  const exportsDir = join(projectRoot, 'exports')
  const resolvedOutput = resolve(exportsDir, outputPath)
  const rel = relative(exportsDir, resolvedOutput)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ValidationError(`输出路径必须位于项目 exports/ 目录下: ${outputPath}`)
  }

  return resolvedOutput
}

async function renderDocx(
  input: RenderDocxInput,
  options?: RenderDocxOptions
): Promise<RenderDocxOutput> {
  const status = processManager.getStatus()
  if (!status.ready) {
    throw new DocxBridgeError(ErrorCode.DOCX_BRIDGE_UNAVAILABLE, '渲染引擎未就绪')
  }

  const resolvedOutput = validateOutputPath(input.projectId, input.outputPath)
  await mkdir(join(resolveProjectDataPath(input.projectId), 'exports'), { recursive: true })

  return renderDocxHttp(
    {
      ...input,
      outputPath: resolvedOutput,
    },
    options
  )
}

async function getHealth(): Promise<DocxHealthData> {
  return checkHealthHttp()
}

function getStatus(): DocxBridgeStatus {
  return processManager.getStatus()
}

export const docxBridgeService = {
  start,
  stop,
  renderDocx,
  getHealth,
  getStatus,
}
