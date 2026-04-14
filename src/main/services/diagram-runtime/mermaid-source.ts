export const SUPPORTED_MERMAID_TYPE_LABELS = [
  'flowchart/graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram-v2',
  'gantt',
  'C4Context',
  'block-beta',
] as const

export const SUPPORTED_MERMAID_TYPE_HINT = SUPPORTED_MERMAID_TYPE_LABELS.join('、')

export const MERMAID_DECLARATION_ORDER_RULE = `%%{init:...}%% 之后的第一条非空语句必须是图表类型声明，且声明只能从 ${SUPPORTED_MERMAID_TYPE_HINT} 中选择。`

export const MERMAID_DECLARATION_FOLLOWUP_RULE =
  'classDef、class、linkStyle、style、subgraph 和节点定义都放在图表类型声明之后。'

type MermaidLineKind = 'blank' | 'comment' | 'init' | 'declaration' | 'reorderable' | 'other'

const MERMAID_DECLARATION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'flowchart/graph', pattern: /^(?:flowchart|graph)\b/i },
  { label: 'sequenceDiagram', pattern: /^sequenceDiagram\b/ },
  { label: 'classDiagram', pattern: /^classDiagram\b/ },
  { label: 'stateDiagram-v2', pattern: /^stateDiagram(?:-v2)?\b/ },
  { label: 'gantt', pattern: /^gantt\b/ },
  { label: 'C4Context', pattern: /^C4Context\b/ },
  { label: 'block-beta', pattern: /^block-beta\b/ },
]

const MERMAID_INIT_RE = /^%%\{init:[\s\S]*\}%%\s*$/
const MERMAID_COMMENT_RE = /^%%(?!\{init:).*$/
const MERMAID_REORDERABLE_RE =
  /^(?:classDef\b|class\b|linkStyle\b|style\b|accTitle\s*:|accDescr\s*:)/i

function classifyMermaidLine(line: string): MermaidLineKind {
  const trimmed = line.trim()
  if (!trimmed) return 'blank'
  if (MERMAID_INIT_RE.test(trimmed)) return 'init'
  if (MERMAID_COMMENT_RE.test(trimmed)) return 'comment'
  if (MERMAID_DECLARATION_PATTERNS.some(({ pattern }) => pattern.test(trimmed)))
    return 'declaration'
  if (MERMAID_REORDERABLE_RE.test(trimmed)) return 'reorderable'
  return 'other'
}

function findDiagramDeclaration(lines: string[]): { index: number; line: string } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    const matched = MERMAID_DECLARATION_PATTERNS.find(({ pattern }) => pattern.test(trimmed))
    if (matched) {
      return {
        index,
        line: lines[index],
      }
    }
  }

  return null
}

export function normalizeMermaidSource(source: string): string {
  const normalized = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (!normalized) return ''

  const lines = normalized.split('\n')
  const declaration = findDiagramDeclaration(lines)
  if (!declaration) return normalized

  let insertionIndex = 0
  while (insertionIndex < lines.length) {
    const kind = classifyMermaidLine(lines[insertionIndex])
    if (kind === 'blank' || kind === 'comment' || kind === 'init') {
      insertionIndex += 1
      continue
    }
    break
  }

  if (declaration.index <= insertionIndex) {
    return normalized
  }

  const reorderablePrefix = lines.slice(insertionIndex, declaration.index).every((line) => {
    const kind = classifyMermaidLine(line)
    return kind === 'blank' || kind === 'comment' || kind === 'reorderable'
  })

  if (!reorderablePrefix) {
    return normalized
  }

  const reordered = [...lines]
  const [declarationLine] = reordered.splice(declaration.index, 1)
  reordered.splice(insertionIndex, 0, declarationLine)

  return reordered.join('\n').trim()
}

export function preflightMermaidSource(source: string): {
  normalizedSource: string
  error?: string
} {
  const normalizedSource = normalizeMermaidSource(source)
  if (!normalizedSource) {
    return {
      normalizedSource,
      error: 'Mermaid 源码为空',
    }
  }

  const lines = normalizedSource.split('\n')
  let firstMeaningfulIndex = 0

  while (firstMeaningfulIndex < lines.length) {
    const kind = classifyMermaidLine(lines[firstMeaningfulIndex])
    if (kind === 'blank' || kind === 'comment' || kind === 'init') {
      firstMeaningfulIndex += 1
      continue
    }
    break
  }

  if (firstMeaningfulIndex >= lines.length) {
    return {
      normalizedSource,
      error: 'Mermaid 源码为空',
    }
  }

  if (classifyMermaidLine(lines[firstMeaningfulIndex]) === 'declaration') {
    return { normalizedSource }
  }

  const declaration = findDiagramDeclaration(lines)
  if (!declaration) {
    return {
      normalizedSource,
      error: `Mermaid 缺少图表类型声明；请在 init 之后以 ${SUPPORTED_MERMAID_TYPE_HINT} 开头。`,
    }
  }

  return {
    normalizedSource,
    error: `Mermaid 首个有效语句必须是图表类型声明；请把 "${declaration.line.trim()}" 放到 init/comment 之后，并置于 classDef、class、linkStyle、style、subgraph 和节点定义之前。`,
  }
}
