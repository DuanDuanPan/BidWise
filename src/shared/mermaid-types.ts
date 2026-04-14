/** Mermaid 架构图类型定义 — Story 3.8 */

/** Default template inserted for new Mermaid diagrams */
export const MERMAID_DEFAULT_TEMPLATE = `graph TD
  A[开始] --> B[结束]`

/** Mermaid 元素节点数据（Plate void element） */
export interface MermaidElementData {
  diagramId: string
  source: string
  assetFileName: string
  caption: string
  lastModified?: string
  svgPersisted?: boolean
}

/** IPC 输入：保存 Mermaid SVG 资产 */
export interface SaveMermaidAssetInput {
  projectId: string
  diagramId: string
  svgContent: string
  assetFileName: string
}

/** IPC 输出：保存 Mermaid SVG 资产 */
export interface SaveMermaidAssetOutput {
  assetPath: string
}

/** IPC 输入：删除 Mermaid SVG 资产 */
export interface DeleteMermaidAssetInput {
  projectId: string
  assetFileName: string
}
