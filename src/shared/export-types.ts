export type StartExportPreviewInput = {
  projectId: string
  templatePath?: string
}

export type StartExportPreviewOutput = {
  taskId: string
}

export type PreviewTaskResult = {
  tempPath: string
  fileName: string
  pageCount?: number
  renderTimeMs: number
}

export type LoadPreviewContentInput = {
  projectId: string
  tempPath: string
}

export type LoadPreviewContentOutput = {
  docxBase64: string
}

export type ConfirmExportInput = {
  projectId: string
  tempPath: string
}

export type ConfirmExportOutput = {
  cancelled?: boolean
  outputPath?: string
  fileSize?: number
}

export type CleanupPreviewInput = {
  projectId: string
  tempPath?: string
}
