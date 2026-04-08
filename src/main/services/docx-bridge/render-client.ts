import { DocxBridgeError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { ErrorCode } from '@shared/constants'
import type { RenderDocxInput, RenderDocxOutput, DocxHealthData } from '@shared/docx-types'
import { processManager } from './process-manager'

const logger = createLogger('docx-bridge-client')

const RENDER_TIMEOUT_MS = 60_000
const HEALTH_TIMEOUT_MS = 5_000

function getBaseUrl(): string {
  const status = processManager.getStatus()
  if (!status.ready || !status.port) {
    throw new DocxBridgeError(ErrorCode.DOCX_BRIDGE_UNAVAILABLE, '渲染引擎未就绪')
  }
  return `http://127.0.0.1:${status.port}`
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function renderDocx(input: RenderDocxInput): Promise<RenderDocxOutput> {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}/api/render-documents`

  logger.info(`发送渲染请求: outputPath=${input.outputPath}`)

  let response: Response
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      RENDER_TIMEOUT_MS
    )
  } catch (err) {
    throw new DocxBridgeError(
      ErrorCode.DOCX_RENDER_FAILED,
      `渲染请求失败: ${err instanceof Error ? err.message : String(err)}`,
      err
    )
  }

  const json = (await response.json()) as
    | { success: true; data: RenderDocxOutput }
    | { success: false; error: { code: string; message: string } }

  if (!json.success) {
    throw new DocxBridgeError(json.error.code as ErrorCode, json.error.message)
  }

  logger.info(`渲染完成: renderTimeMs=${json.data.renderTimeMs}`)
  return json.data
}

export async function checkHealth(): Promise<DocxHealthData> {
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}/api/health`

  let response: Response
  try {
    response = await fetchWithTimeout(url, { method: 'GET' }, HEALTH_TIMEOUT_MS)
  } catch (err) {
    throw new DocxBridgeError(
      ErrorCode.DOCX_BRIDGE_UNAVAILABLE,
      `健康检查请求失败: ${err instanceof Error ? err.message : String(err)}`,
      err
    )
  }

  const json = (await response.json()) as
    | { success: true; data: DocxHealthData }
    | { success: false; error: { code: string; message: string } }

  if (!json.success) {
    throw new DocxBridgeError(ErrorCode.DOCX_BRIDGE_UNAVAILABLE, json.error.message)
  }

  return json.data
}
