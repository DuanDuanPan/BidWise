export type TemplateStyleKey =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bodyText'
  | 'table'
  | 'listBullet'
  | 'listNumber'
  | 'caption'
  | 'codeBlock'
  | 'toc'

export type TemplateStyleMapping = Partial<Record<TemplateStyleKey, string>>

export interface TemplatePageSetup {
  contentWidthMm?: number
}

export interface TemplateMappingConfig {
  templatePath?: string
  styles?: TemplateStyleMapping
  pageSetup?: TemplatePageSetup
}

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
  warnings?: string[]
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
