/** AI Diagram 类型定义 — Story 3.9 */

/** 视觉风格 token（传给 skill 的稳定 kebab-case 值） */
export type AiDiagramStyleToken =
  | 'flat-icon'
  | 'dark-terminal'
  | 'blueprint'
  | 'notion-clean'
  | 'glassmorphism'
  | 'claude-official'
  | 'openai-official'

/** 图表类型 token */
export type AiDiagramTypeToken =
  | 'architecture'
  | 'data-flow'
  | 'flowchart'
  | 'sequence'
  | 'agent-architecture'
  | 'class'
  | 'er'
  | 'network'
  | 'concept-map'
  | 'timeline'
  | 'comparison'
  | 'mind-map'

/** AiDiagram Plate void element 节点数据 */
export interface AiDiagramElementData {
  diagramId: string
  assetFileName: string
  caption: string
  prompt: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
  svgContent?: string
  svgPersisted?: boolean
  lastModified?: string
}

/** IPC 输入：保存 AI Diagram SVG 资产 */
export interface SaveAiDiagramAssetInput {
  projectId: string
  diagramId: string
  svgContent: string
  assetFileName: string
}

/** IPC 输出：保存 AI Diagram SVG 资产 */
export interface SaveAiDiagramAssetOutput {
  assetPath: string
}

/** IPC 输入：加载 AI Diagram SVG 资产 */
export interface LoadAiDiagramAssetInput {
  projectId: string
  assetFileName: string
}

/** IPC 输出：加载 AI Diagram SVG 资产 */
export interface LoadAiDiagramAssetOutput {
  svgContent: string
}

/** IPC 输入：删除 AI Diagram SVG 资产 */
export interface DeleteAiDiagramAssetInput {
  projectId: string
  assetFileName: string
}

/** Agent 输入：通过增强版 skill 链路生成 AI 图表 */
export interface ExecuteAiDiagramAgentInput {
  projectId: string
  diagramId: string
  assetFileName: string
  prompt: string
  title: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
  chapterTitle?: string
  chapterMarkdown?: string
}

/** Agent 输出：增强版 skill 图表生成结果 */
export interface ExecuteAiDiagramAgentOutput {
  diagramId: string
  assetFileName: string
  prompt: string
  title: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
  svgContent: string
  repairAttempts: number
}
