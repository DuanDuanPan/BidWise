/** Mermaid 架构图类型定义 — Story 3.8 */

/** Default template inserted for new Mermaid diagrams */
export const MERMAID_DEFAULT_TEMPLATE = `graph TD
  A[开始] --> B[结束]`

/** Built-in icons available in mermaid architecture-beta diagrams. */
const ARCHITECTURE_BUILTIN_ICONS = new Set([
  'cloud',
  'database',
  'disk',
  'server',
  'internet',
  'blank',
])

/** Best-effort mapping from LLM-hallucinated icon names to built-in icons. */
const ICON_FALLBACK_MAP: Record<string, string> = {
  gateway: 'internet',
  api: 'internet',
  web: 'internet',
  network: 'internet',
  firewall: 'internet',
  lb: 'internet',
  loadbalancer: 'internet',
  proxy: 'internet',
  cdn: 'internet',
  dns: 'internet',
  storage: 'database',
  db: 'database',
  datastore: 'database',
  cache: 'database',
  redis: 'database',
  queue: 'disk',
  mq: 'disk',
  kafka: 'disk',
  file: 'disk',
  bucket: 'disk',
  s3: 'disk',
  container: 'server',
  microservice: 'server',
  node: 'server',
  compute: 'server',
  vm: 'server',
  app: 'server',
  aws: 'cloud',
  azure: 'cloud',
  gcp: 'cloud',
  saas: 'cloud',
}

/**
 * Replace unsupported icon names in architecture-beta sources with the closest
 * built-in icon.  Safe to call on any mermaid source — non-architecture-beta
 * sources are returned unchanged.
 */
export function fixArchitectureIcons(source: string): string {
  if (!/^architecture-beta\b/m.test(source)) return source

  return source.replace(
    /(\bservice\s+[\w-]+\()(\w+)(\))/g,
    (_full, prefix: string, iconName: string, suffix: string) => {
      if (ARCHITECTURE_BUILTIN_ICONS.has(iconName)) return _full
      const replacement = ICON_FALLBACK_MAP[iconName.toLowerCase()] ?? 'server'
      return `${prefix}${replacement}${suffix}`
    }
  )
}

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

/** IPC 输入：加载 Mermaid SVG 资产 */
export interface LoadMermaidAssetInput {
  projectId: string
  assetFileName: string
}

/** IPC 输出：加载 Mermaid SVG 资产 */
export interface LoadMermaidAssetOutput {
  svgContent: string
}

/** IPC 输入：删除 Mermaid SVG 资产 */
export interface DeleteMermaidAssetInput {
  projectId: string
  assetFileName: string
}
