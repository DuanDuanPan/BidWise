import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { App } from 'antd'
import { StructureCanvasNode } from '@modules/structure-design/components/StructureCanvasNode'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import type { StructureNode } from '@modules/structure-design/hooks/useStructureOutline'

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeNode(overrides: Partial<StructureNode> = {}): StructureNode {
  return {
    sectionId: UUID,
    nodeKey: UUID,
    title: '需求理解与响应',
    level: 1,
    parentId: null,
    order: 0,
    children: [],
    ...overrides,
  }
}

function renderNode(
  node: StructureNode,
  props: Partial<Parameters<typeof StructureCanvasNode>[0]> = {}
): void {
  render(
    <App>
      <StructureCanvasNode node={node} onCommitTitle={vi.fn()} {...props} />
    </App>
  )
}

describe('@story-11-2 StructureCanvasNode', () => {
  beforeEach(() => {
    useChapterStructureStore.getState().reset()
    cleanup()
  })

  describe('visual state rendering (AC1-5)', () => {
    it('@p0 renders idle state as transparent row without focus bar', () => {
      const node = makeNode()
      renderNode(node)
      const el = screen.getByTestId(`structure-node-${UUID}`)
      expect(el.getAttribute('data-node-state')).toBe('idle')
      expect(el.getAttribute('aria-selected')).toBe('false')
      expect(screen.queryByTestId(`structure-node-${UUID}-focus-bar`)).toBeNull()
    })

    it('@p0 renders focused state with focus bar + action buttons', () => {
      const node = makeNode()
      renderNode(node)
      fireEvent.click(screen.getByTestId(`structure-node-${UUID}`))
      expect(screen.getByTestId(`structure-node-${UUID}-focus-bar`)).toBeTruthy()
      expect(screen.getByTestId('structure-node-add-child')).toBeTruthy()
      expect(screen.getByTestId('structure-node-more')).toBeTruthy()
    })

    it('@p0 renders editing state with inline input on double-click', () => {
      const node = makeNode()
      renderNode(node)
      fireEvent.doubleClick(screen.getByTestId(`structure-node-${UUID}`))
      expect(screen.getByTestId('structure-node-inline-input')).toBeTruthy()
    })

    it('@p0 renders locked state with badge and aria-disabled', () => {
      useChapterStructureStore.getState().markLocked(UUID)
      const node = makeNode()
      renderNode(node)
      const el = screen.getByTestId(`structure-node-${UUID}`)
      expect(el.getAttribute('aria-disabled')).toBe('true')
      expect(el.getAttribute('tabindex')).toBe('-1')
      expect(screen.getByTestId('structure-node-locked-badge')).toBeTruthy()
    })

    it('@p0 renders pending-delete with countdown + undo button', () => {
      const expiresAt = new Date(Date.now() + 3000).toISOString()
      useChapterStructureStore.getState().markPendingDelete([UUID], expiresAt)
      const node = makeNode()
      renderNode(node)
      const el = screen.getByTestId(`structure-node-${UUID}`)
      expect(el.getAttribute('aria-disabled')).toBe('true')
      expect(screen.getByTestId('structure-node-countdown')).toBeTruthy()
      expect(screen.getByTestId('structure-node-undo')).toBeTruthy()
    })
  })

  describe('interaction guards (AC3, AC4, AC6)', () => {
    it('@p0 click on locked node does NOT change focus', () => {
      useChapterStructureStore.getState().markLocked(UUID)
      const node = makeNode()
      renderNode(node)
      fireEvent.click(screen.getByTestId(`structure-node-${UUID}`))
      expect(useChapterStructureStore.getState().focusedNodeKey).toBe(null)
    })

    it('@p0 F2 on locked node does NOT enter editing', () => {
      useChapterStructureStore.getState().markLocked(UUID)
      const node = makeNode()
      renderNode(node)
      fireEvent.keyDown(screen.getByTestId(`structure-node-${UUID}`), { key: 'F2' })
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(null)
    })

    it('@p0 F2 on idle node enters editing mode', () => {
      const node = makeNode()
      renderNode(node)
      fireEvent.keyDown(screen.getByTestId(`structure-node-${UUID}`), { key: 'F2' })
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(UUID)
    })
  })

  describe('generationPhase decoration (AC5)', () => {
    it('@p0 renders running phase icon on idle nodes', () => {
      const node = makeNode()
      renderNode(node, { generationPhase: 'generating-text' })
      expect(screen.getByTestId('structure-node-phase-running')).toBeTruthy()
    })

    it('@p0 renders completed phase icon on idle nodes', () => {
      const node = makeNode()
      renderNode(node, { generationPhase: 'completed' })
      expect(screen.getByTestId('structure-node-phase-completed')).toBeTruthy()
    })

    it('@p1 omits decorator when phase is undefined', () => {
      const node = makeNode()
      renderNode(node)
      expect(screen.queryByTestId('structure-node-phase-running')).toBeNull()
      expect(screen.queryByTestId('structure-node-phase-completed')).toBeNull()
    })

    it('@p1 omits decorator when state is not idle', () => {
      useChapterStructureStore.getState().markLocked(UUID)
      const node = makeNode()
      renderNode(node, { generationPhase: 'completed' })
      // Locked badge is shown instead; phase decorator restricted to idle rows.
      expect(screen.queryByTestId('structure-node-phase-completed')).toBeNull()
    })
  })

  describe('keyboard accessibility (UX-DR24)', () => {
    it('@p0 idle node is keyboard-focusable (tabindex 0)', () => {
      const node = makeNode()
      renderNode(node)
      expect(screen.getByTestId(`structure-node-${UUID}`).getAttribute('tabindex')).toBe('0')
    })

    it('@p0 pending-delete node is removed from tab order', () => {
      const expiresAt = new Date(Date.now() + 3000).toISOString()
      useChapterStructureStore.getState().markPendingDelete([UUID], expiresAt)
      const node = makeNode()
      renderNode(node)
      expect(screen.getByTestId(`structure-node-${UUID}`).getAttribute('tabindex')).toBe('-1')
    })
  })
})
