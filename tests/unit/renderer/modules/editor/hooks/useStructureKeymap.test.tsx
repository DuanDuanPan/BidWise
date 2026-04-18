import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'
import { useStructureKeymap } from '@modules/editor/hooks/useStructureKeymap'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'

vi.mock('antd', () => ({
  message: { open: vi.fn() },
}))

const insertSiblingSpy = vi.fn(async () => ({ ok: true, snapshot: {} }))
const indentSpy = vi.fn(async () => ({ ok: true, snapshot: {} }))
const outdentSpy = vi.fn(async () => ({ ok: true, snapshot: {} }))
const requestSoftDeleteSpy = vi.fn(async () => ({ ok: true }))

function TestHarness({
  outline,
  sectionIdByNodeKey,
  disabled,
}: {
  outline: OutlineNode[]
  sectionIdByNodeKey: Record<string, string>
  disabled?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useStructureKeymap({
    panelRef: ref,
    projectId: 'p',
    outline,
    onNavigateToNode: () => {},
    sectionIdByNodeKey,
    disabled,
  })
  return <div ref={ref} data-testid="panel" tabIndex={0} />
}

function node(overrides: Partial<OutlineNode>): OutlineNode {
  return {
    key: 'heading-0',
    title: 't',
    level: 1,
    lineIndex: 0,
    occurrenceIndex: 0,
    children: [],
    ...overrides,
  }
}

describe('@story-11-3 useStructureKeymap', () => {
  beforeEach(() => {
    insertSiblingSpy.mockClear()
    indentSpy.mockClear()
    outdentSpy.mockClear()
    requestSoftDeleteSpy.mockClear()
    useChapterStructureStore.setState({
      focusedNodeKey: null,
      editingNodeKey: null,
      lockedNodeKeys: {},
      pendingDeleteByNodeKey: {},
      sectionIdByNodeKey: {},
    })
    // Override store actions with spies so we observe dispatches without full IPC wiring.
    const real = useChapterStructureStore.getState()
    useChapterStructureStore.setState({
      ...real,
      insertSibling: insertSiblingSpy as unknown as typeof real.insertSibling,
      indentNode: indentSpy as unknown as typeof real.indentNode,
      outdentNode: outdentSpy as unknown as typeof real.outdentNode,
      requestSoftDelete: requestSoftDeleteSpy as unknown as typeof real.requestSoftDelete,
    })
  })

  afterEach(() => cleanup())

  function firePanelKey(key: string, shiftKey = false): void {
    const panel = document.querySelector<HTMLElement>('[data-testid="panel"]')!
    panel.focus()
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
    )
  }

  it('@p0 Enter dispatches insertSibling on focused node', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
      />
    )
    firePanelKey('Enter')
    expect(insertSiblingSpy).toHaveBeenCalledWith('p', 'heading-0')
  })

  it('@p0 Tab dispatches indentNode, Shift+Tab dispatches outdentNode', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
      />
    )
    firePanelKey('Tab')
    expect(indentSpy).toHaveBeenCalledWith('p', 'heading-0')
    firePanelKey('Tab', true)
    expect(outdentSpy).toHaveBeenCalledWith('p', 'heading-0')
  })

  it('@p0 Delete collects subtree sectionIds and requests soft delete', () => {
    const child = node({ key: 'heading-1', title: 'c' })
    const parent = node({ key: 'heading-0', title: 'p', children: [child] })
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[parent]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0', 'heading-1': 'sid-1' }}
      />
    )
    firePanelKey('Delete')
    expect(requestSoftDeleteSpy).toHaveBeenCalledWith(
      'p',
      ['sid-0', 'sid-1'],
      ['heading-0', 'heading-1']
    )
  })

  it('@p0 F2 enters editing on focused node', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
      />
    )
    firePanelKey('F2')
    expect(useChapterStructureStore.getState().editingNodeKey).toBe('heading-0')
  })

  it('@p0 Esc exits editing', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0', editingNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
      />
    )
    firePanelKey('Escape')
    expect(useChapterStructureStore.getState().editingNodeKey).toBeNull()
  })

  it('@p0 ArrowDown advances focus to next visible node', () => {
    const a = node({ key: 'heading-0', title: 'A' })
    const b = node({ key: 'heading-1', title: 'B', level: 2 })
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[a, b]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0', 'heading-1': 'sid-1' }}
      />
    )
    firePanelKey('ArrowDown')
    expect(useChapterStructureStore.getState().focusedNodeKey).toBe('heading-1')
  })

  it('@p1 structural keys are ignored while editing (inline input keeps semantics)', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0', editingNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
      />
    )
    firePanelKey('Enter')
    firePanelKey('Tab')
    firePanelKey('Delete')
    expect(insertSiblingSpy).not.toHaveBeenCalled()
    expect(indentSpy).not.toHaveBeenCalled()
    expect(requestSoftDeleteSpy).not.toHaveBeenCalled()
  })

  it('@p1 disabled=true unmounts keydown handler', () => {
    useChapterStructureStore.setState({ focusedNodeKey: 'heading-0' })
    render(
      <TestHarness
        outline={[node({ key: 'heading-0' })]}
        sectionIdByNodeKey={{ 'heading-0': 'sid-0' }}
        disabled
      />
    )
    firePanelKey('Enter')
    expect(insertSiblingSpy).not.toHaveBeenCalled()
  })
})
