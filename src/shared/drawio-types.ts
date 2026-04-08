/** draw.io 架构图类型定义 — Story 3.7 */

/** draw.io 元素节点数据（Plate void element） */
export interface DrawioElementData {
  diagramId: string
  assetFileName: string
  caption: string
  xml?: string
  pngDataUrl?: string
  lastModified?: string
}

/** draw.io postMessage 协议类型 */
export type DrawioAction = 'load' | 'export'
export type DrawioEvent = 'init' | 'save' | 'export' | 'exit'

export interface DrawioMessageOut {
  action: DrawioAction
  xml?: string
  format?: 'png'
  spin?: boolean
}

export interface DrawioMessageIn {
  event: DrawioEvent
  xml?: string
  data?: string
  modified?: boolean
}

/** IPC 输入：保存 draw.io 资产 */
export interface SaveDrawioAssetInput {
  projectId: string
  diagramId: string
  xml: string
  pngBase64: string
  fileName: string
}

/** IPC 输出：保存 draw.io 资产 */
export interface SaveDrawioAssetOutput {
  assetPath: string
  pngPath: string
}

/** IPC 输入：加载 draw.io 资产 */
export interface LoadDrawioAssetInput {
  projectId: string
  fileName: string
}

/** IPC 输出：加载 draw.io 资产 */
export interface LoadDrawioAssetOutput {
  xml: string
  pngDataUrl: string
}

/** IPC 输入：删除 draw.io 资产 */
export interface DeleteDrawioAssetInput {
  projectId: string
  fileName: string
}
