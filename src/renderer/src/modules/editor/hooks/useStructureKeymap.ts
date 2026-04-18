/**
 * Story 11.3 — Xmind 风格结构快捷键 hook.
 *
 * Mounts a single `keydown` listener on the focusable outline tree root and
 * dispatches structural mutations through `chapterStructureStore`:
 *
 *   Enter         → insert sibling after current subtree (auto enters Editing)
 *   Tab           → indent current subtree under previous sibling
 *   Shift+Tab     → outdent current subtree to grandparent
 *   Delete/Bksp   → collect cascade target sectionIds and request soft delete
 *   F2            → enter Editing on the focused node
 *   Esc           → exit Editing
 *   ↑ / ↓ / ← / → → navigate to prev / next visible node, parent, first child
 *
 * Scope: only fires while focus is inside the panel root and NOT inside an
 * inline `<input>` / `<textarea>` / `[contenteditable]` — those native widgets
 * keep their own keyboard semantics (AC2 / AC3).
 */
import { useEffect, useMemo } from 'react'
import type { RefObject } from 'react'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

export interface StructureKeymapOptions {
  panelRef: RefObject<HTMLElement | null>
  projectId: string | null
  outline: OutlineNode[]
  onNavigateToNode: (node: OutlineNode) => void
  /** Story 11.2 bridge: nodeKey → canonical sectionId. */
  sectionIdByNodeKey: Record<string, string>
  /** Disable structural mutations (e.g. proposal stage not active). */
  disabled?: boolean
}

export function useStructureKeymap(opts: StructureKeymapOptions): void {
  const { panelRef, projectId, outline, onNavigateToNode, sectionIdByNodeKey, disabled } = opts

  const flatVisible = useMemo(() => flattenOutline(outline), [outline])
  const nodeIndex = useMemo(() => buildIndex(flatVisible), [flatVisible])

  useEffect(() => {
    const root = panelRef.current
    if (!root || disabled || !projectId) return undefined

    const handler = (event: KeyboardEvent): void => {
      if (!isWithinPanel(event.target, root)) return
      if (isNativeEditableTarget(event.target)) return

      const store = useChapterStructureStore.getState()
      const focusedKey = store.focusedNodeKey
      const focusedNode = focusedKey ? nodeIndex.byKey.get(focusedKey) : undefined

      const key = event.key
      const shift = event.shiftKey

      // Editing-state shortcuts: only F2/Esc are meaningful at root scope; the
      // inline Input owns Enter/Tab semantics via stopPropagation in 11.2.
      if (store.editingNodeKey) {
        if (key === 'Escape') {
          event.preventDefault()
          store.exitEditing()
        }
        return
      }

      switch (key) {
        case 'Enter': {
          if (!focusedNode) return
          event.preventDefault()
          void store.insertSibling(projectId, focusedNode.key)
          return
        }
        case 'Tab': {
          if (!focusedNode) return
          event.preventDefault()
          void (shift
            ? store.outdentNode(projectId, focusedNode.key)
            : store.indentNode(projectId, focusedNode.key))
          return
        }
        case 'Delete':
        case 'Backspace': {
          if (!focusedNode) return
          event.preventDefault()
          const targets = collectSubtreeTargets(focusedNode, sectionIdByNodeKey)
          void store.requestSoftDelete(projectId, targets.sectionIds, targets.nodeKeys)
          return
        }
        case 'F2': {
          if (!focusedNode) return
          event.preventDefault()
          store.enterEditing(focusedNode.key)
          return
        }
        case 'Escape': {
          event.preventDefault()
          store.exitEditing()
          return
        }
        case 'ArrowUp': {
          if (!focusedNode) return
          const prev = nodeIndex.previousVisible(focusedNode.key)
          if (prev) {
            event.preventDefault()
            store.focusNode(prev.key)
            onNavigateToNode(prev)
          }
          return
        }
        case 'ArrowDown': {
          if (!focusedNode) return
          const next = nodeIndex.nextVisible(focusedNode.key)
          if (next) {
            event.preventDefault()
            store.focusNode(next.key)
            onNavigateToNode(next)
          }
          return
        }
        case 'ArrowLeft': {
          if (!focusedNode) return
          const parent = nodeIndex.parentOf(focusedNode.key)
          if (parent) {
            event.preventDefault()
            store.focusNode(parent.key)
            onNavigateToNode(parent)
          }
          return
        }
        case 'ArrowRight': {
          if (!focusedNode) return
          const child = focusedNode.children[0]
          if (child) {
            event.preventDefault()
            store.focusNode(child.key)
            onNavigateToNode(child)
          }
          return
        }
        default:
          return
      }
    }

    root.addEventListener('keydown', handler)
    return () => root.removeEventListener('keydown', handler)
  }, [panelRef, projectId, nodeIndex, onNavigateToNode, sectionIdByNodeKey, disabled])
}

interface OutlineFlatEntry {
  node: OutlineNode
  parent: OutlineNode | null
}

function flattenOutline(outline: OutlineNode[]): OutlineFlatEntry[] {
  const out: OutlineFlatEntry[] = []
  const walk = (nodes: OutlineNode[], parent: OutlineNode | null): void => {
    for (const n of nodes) {
      out.push({ node: n, parent })
      walk(n.children, n)
    }
  }
  walk(outline, null)
  return out
}

interface OutlineIndex {
  byKey: Map<string, OutlineNode>
  previousVisible: (key: string) => OutlineNode | null
  nextVisible: (key: string) => OutlineNode | null
  parentOf: (key: string) => OutlineNode | null
}

function buildIndex(flat: OutlineFlatEntry[]): OutlineIndex {
  const byKey = new Map<string, OutlineNode>()
  const parentByKey = new Map<string, OutlineNode | null>()
  flat.forEach((entry) => {
    byKey.set(entry.node.key, entry.node)
    parentByKey.set(entry.node.key, entry.parent)
  })
  const orderedKeys = flat.map((e) => e.node.key)
  return {
    byKey,
    previousVisible(key) {
      const idx = orderedKeys.indexOf(key)
      if (idx <= 0) return null
      return byKey.get(orderedKeys[idx - 1]) ?? null
    },
    nextVisible(key) {
      const idx = orderedKeys.indexOf(key)
      if (idx < 0 || idx >= orderedKeys.length - 1) return null
      return byKey.get(orderedKeys[idx + 1]) ?? null
    },
    parentOf(key) {
      return parentByKey.get(key) ?? null
    },
  }
}

function collectSubtreeTargets(
  node: OutlineNode,
  sectionIdByNodeKey: Record<string, string>
): { sectionIds: string[]; nodeKeys: string[] } {
  const sectionIds: string[] = []
  const nodeKeys: string[] = []
  const walk = (n: OutlineNode): void => {
    nodeKeys.push(n.key)
    const sid = sectionIdByNodeKey[n.key]
    if (sid) sectionIds.push(sid)
    for (const child of n.children) walk(child)
  }
  walk(node)
  return { sectionIds, nodeKeys }
}

function isWithinPanel(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Node)) return false
  return root === target || root.contains(target)
}

function isNativeEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  // AntD message Toast Undo button has data-testid; treat real <button>s as
  // their own keyboard surface so Space / Enter still activate them.
  if (target.tagName === 'BUTTON') return true
  return false
}
