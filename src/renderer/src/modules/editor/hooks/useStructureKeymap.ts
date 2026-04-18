/**
 * Story 11.3 — Xmind 风格结构快捷键 hook.
 *
 * Mounts a single `keydown` listener on the focusable outline tree root and
 * dispatches structural mutations through `chapterStructureStore` using
 * canonical `sectionId` (Story 11.1). Outline's transient `heading-${lineIndex}`
 * keys are used ONLY for arrow-key navigation order — persistent state never
 * sees them.
 *
 *   Enter         → insert sibling after current subtree (auto enters Editing)
 *   Tab           → indent current subtree under previous sibling
 *   Shift+Tab     → outdent current subtree to grandparent
 *   Delete/Bksp   → collect cascade target sectionIds and request soft delete
 *   F2            → enter Editing on the focused section
 *   Esc           → exit Editing
 *   ↑ / ↓ / ← / → → navigate to prev / next visible node, parent, first child
 *
 * Scope: only fires while focus is inside the panel root and NOT inside an
 * inline `<input>` / `<textarea>` / `[contenteditable]` (AC2 / AC3).
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
  /** nodeKey → canonical sectionId for the current outline snapshot. */
  sectionIdByNodeKey: Record<string, string>
  /** Disable structural mutations (e.g. proposal stage not active). */
  disabled?: boolean
}

export function useStructureKeymap(opts: StructureKeymapOptions): void {
  const { panelRef, projectId, outline, onNavigateToNode, sectionIdByNodeKey, disabled } = opts

  const navIndex = useMemo(
    () => buildNavIndex(outline, sectionIdByNodeKey),
    [outline, sectionIdByNodeKey]
  )

  useEffect(() => {
    const root = panelRef.current
    if (!root || disabled || !projectId) return undefined

    const handler = (event: KeyboardEvent): void => {
      if (!isWithinPanel(event.target, root)) return
      if (isNativeEditableTarget(event.target)) return

      const store = useChapterStructureStore.getState()
      const focusedSectionId = store.focusedSectionId
      const focusedEntry = focusedSectionId ? navIndex.bySectionId.get(focusedSectionId) : undefined

      const key = event.key
      const shift = event.shiftKey

      if (store.editingSectionId) {
        if (key === 'Escape') {
          event.preventDefault()
          store.exitEditing()
        }
        return
      }

      switch (key) {
        case 'Enter': {
          if (!focusedSectionId) return
          event.preventDefault()
          void store.insertSibling(projectId, focusedSectionId)
          return
        }
        case 'Tab': {
          if (!focusedSectionId) return
          event.preventDefault()
          void (shift
            ? store.outdentSection(projectId, focusedSectionId)
            : store.indentSection(projectId, focusedSectionId))
          return
        }
        case 'Delete':
        case 'Backspace': {
          if (!focusedEntry) return
          event.preventDefault()
          const sectionIds = collectSubtreeSectionIds(focusedEntry.node, sectionIdByNodeKey)
          void store.requestSoftDelete(projectId, sectionIds)
          return
        }
        case 'F2': {
          if (!focusedSectionId) return
          event.preventDefault()
          store.enterEditing(focusedSectionId)
          return
        }
        case 'Escape': {
          event.preventDefault()
          store.exitEditing()
          return
        }
        case 'ArrowUp': {
          if (!focusedEntry) return
          const prev = navIndex.previousVisible(focusedEntry.node.key)
          if (prev) {
            event.preventDefault()
            const sid = sectionIdByNodeKey[prev.key]
            if (sid) store.focusSection(sid)
            onNavigateToNode(prev)
          }
          return
        }
        case 'ArrowDown': {
          if (!focusedEntry) return
          const next = navIndex.nextVisible(focusedEntry.node.key)
          if (next) {
            event.preventDefault()
            const sid = sectionIdByNodeKey[next.key]
            if (sid) store.focusSection(sid)
            onNavigateToNode(next)
          }
          return
        }
        case 'ArrowLeft': {
          if (!focusedEntry) return
          const parent = navIndex.parentOf(focusedEntry.node.key)
          if (parent) {
            event.preventDefault()
            const sid = sectionIdByNodeKey[parent.key]
            if (sid) store.focusSection(sid)
            onNavigateToNode(parent)
          }
          return
        }
        case 'ArrowRight': {
          if (!focusedEntry) return
          const child = focusedEntry.node.children[0]
          if (child) {
            event.preventDefault()
            const sid = sectionIdByNodeKey[child.key]
            if (sid) store.focusSection(sid)
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
  }, [panelRef, projectId, navIndex, onNavigateToNode, sectionIdByNodeKey, disabled])
}

interface NavEntry {
  node: OutlineNode
  parent: OutlineNode | null
}

interface NavIndex {
  bySectionId: Map<string, NavEntry>
  previousVisible: (nodeKey: string) => OutlineNode | null
  nextVisible: (nodeKey: string) => OutlineNode | null
  parentOf: (nodeKey: string) => OutlineNode | null
}

function buildNavIndex(
  outline: OutlineNode[],
  sectionIdByNodeKey: Record<string, string>
): NavIndex {
  const flat: NavEntry[] = []
  const walk = (nodes: OutlineNode[], parent: OutlineNode | null): void => {
    for (const n of nodes) {
      flat.push({ node: n, parent })
      walk(n.children, n)
    }
  }
  walk(outline, null)

  const bySectionId = new Map<string, NavEntry>()
  const byNodeKey = new Map<string, OutlineNode>()
  const parentByNodeKey = new Map<string, OutlineNode | null>()
  const orderedNodeKeys: string[] = []

  for (const entry of flat) {
    byNodeKey.set(entry.node.key, entry.node)
    parentByNodeKey.set(entry.node.key, entry.parent)
    orderedNodeKeys.push(entry.node.key)
    const sid = sectionIdByNodeKey[entry.node.key]
    if (sid) bySectionId.set(sid, entry)
  }

  return {
    bySectionId,
    previousVisible(nodeKey) {
      const idx = orderedNodeKeys.indexOf(nodeKey)
      if (idx <= 0) return null
      return byNodeKey.get(orderedNodeKeys[idx - 1]) ?? null
    },
    nextVisible(nodeKey) {
      const idx = orderedNodeKeys.indexOf(nodeKey)
      if (idx < 0 || idx >= orderedNodeKeys.length - 1) return null
      return byNodeKey.get(orderedNodeKeys[idx + 1]) ?? null
    },
    parentOf(nodeKey) {
      return parentByNodeKey.get(nodeKey) ?? null
    },
  }
}

function collectSubtreeSectionIds(
  node: OutlineNode,
  sectionIdByNodeKey: Record<string, string>
): string[] {
  const sectionIds: string[] = []
  const walk = (n: OutlineNode): void => {
    const sid = sectionIdByNodeKey[n.key]
    if (sid) sectionIds.push(sid)
    for (const child of n.children) walk(child)
  }
  walk(node)
  return sectionIds
}

function isWithinPanel(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Node)) return false
  return root === target || root.contains(target)
}

function isNativeEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  if (target.tagName === 'BUTTON') return true
  return false
}
