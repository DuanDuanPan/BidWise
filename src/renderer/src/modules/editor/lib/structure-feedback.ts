/**
 * Story 11.3 — keyed user-feedback surface for chapter structure mutations.
 *
 * Story 11.5 will own the depth-warning + lock-rejection product copy and may
 * replace this seam with a richer notification system. For now we stay in
 * AntD `message` so locked / boundary / depth notices remain a single instance
 * and never stack when a user spams shortcuts.
 */
import { message } from 'antd'

const KEY_DEPTH = 'chapter-structure:depth-warn'
const KEY_LOCKED = 'chapter-structure:locked'
const KEY_BOUNDARY = 'chapter-structure:boundary'
const KEY_ERROR = 'chapter-structure:error'

export function notifyDepthExceeded(depth: number): void {
  void message.open({
    key: KEY_DEPTH,
    type: 'warning',
    content: `过深结构（${depth} 层）会降低可读性，建议拆分为独立章节`,
    duration: 2,
  })
}

export function notifyLockedRejection(): void {
  void message.open({
    key: KEY_LOCKED,
    type: 'info',
    content: 'AI 生成中，请稍候',
    duration: 2,
  })
}

export function notifyStructureBoundary(reason: string): void {
  // Boundary cases (no previous sibling, already top-level) are intentional
  // no-ops in the spec — surface a quiet hint so power users know the key
  // landed but the structure refused to move.
  void message.open({
    key: KEY_BOUNDARY,
    type: 'info',
    content: reason,
    duration: 1.5,
  })
}

export function notifyStructureError(err: unknown): void {
  const messageText = err instanceof Error ? err.message : '结构操作失败'
  void message.open({
    key: KEY_ERROR,
    type: 'error',
    content: messageText,
    duration: 3,
  })
}
