import type { TemplateStyleMapping, TemplatePageSetup } from './export-types'

export type RenderDocxInput = {
  markdownContent: string
  outputPath: string
  templatePath?: string
  projectId: string
  styleMapping?: TemplateStyleMapping
  pageSetup?: TemplatePageSetup
  projectPath?: string
}

export type RenderDocxOutput = {
  outputPath: string
  pageCount?: number
  renderTimeMs: number
  warnings?: string[]
}

export type DocxHealthData = {
  status: string
  version: string
  uptimeSeconds: number
}

export type DocxBridgeStatus = {
  ready: boolean
  port?: number
  pid?: number
}
