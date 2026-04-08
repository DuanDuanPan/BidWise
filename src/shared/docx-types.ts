export type RenderDocxInput = {
  markdownContent: string
  outputPath: string
  templatePath?: string
  projectId: string
}

export type RenderDocxOutput = {
  outputPath: string
  pageCount?: number
  renderTimeMs: number
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
