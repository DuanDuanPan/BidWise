import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { UndoDeleteToast } from '@modules/structure-design/components/UndoDeleteToast'
import type { PendingStructureDeletionSummary } from '@shared/chapter-types'

const sidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function summary(
  overrides: Partial<PendingStructureDeletionSummary> = {}
): PendingStructureDeletionSummary {
  return {
    deletionId: 'del-1',
    deletedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5000).toISOString(),
    rootSectionId: sidA,
    sectionIds: [sidA],
    firstTitle: '公司简介',
    totalWordCount: 42,
    subtreeSize: 1,
    ...overrides,
  }
}

function renderHost(): void {
  render(
    <AntApp>
      <UndoDeleteToast />
    </AntApp>
  )
}

describe('@story-11-4 UndoDeleteToast', () => {
  beforeEach(() => {
    useChapterStructureStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the leaf-node copy for a single section', async () => {
    renderHost()
    act(() => {
      useChapterStructureStore.getState().bindProject('p')
      useChapterStructureStore.getState().hydratePendingDeletion(summary())
    })
    await waitFor(() => {
      expect(screen.getByText(/已删除「公司简介」/)).toBeTruthy()
    })
  })

  it('renders the parent+descendants copy with word count', async () => {
    renderHost()
    act(() => {
      useChapterStructureStore.getState().bindProject('p')
      useChapterStructureStore
        .getState()
        .hydratePendingDeletion(summary({ subtreeSize: 4, totalWordCount: 218 }))
    })
    await waitFor(() => {
      expect(screen.getByText(/3 个子节点（含正文 218 字）/)).toBeTruthy()
    })
  })

  it('clicking Undo dispatches undoPendingDelete with the active deletionId', async () => {
    const spy = vi
      .spyOn(useChapterStructureStore.getState(), 'undoPendingDelete')
      .mockResolvedValue({ ok: true })
    renderHost()
    act(() => {
      useChapterStructureStore.getState().bindProject('p')
      useChapterStructureStore.getState().hydratePendingDeletion(summary())
    })
    const btn = await screen.findByTestId('undo-delete-button')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('p', 'del-1')
    })
  })

  it('replacing the active deletion reuses the fixed notification key', async () => {
    renderHost()
    act(() => {
      useChapterStructureStore.getState().bindProject('p')
      useChapterStructureStore.getState().hydratePendingDeletion(summary({ deletionId: 'a' }))
    })
    await waitFor(() => {
      expect(screen.getByTestId('undo-delete-button')).toBeTruthy()
    })
    act(() => {
      useChapterStructureStore
        .getState()
        .hydratePendingDeletion(summary({ deletionId: 'b', firstTitle: '第二节' }))
    })
    await waitFor(() => {
      // fixed key ⇒ only one toast on screen
      expect(screen.getAllByTestId('undo-delete-button')).toHaveLength(1)
      expect(screen.getByText(/已删除「第二节」/)).toBeTruthy()
    })
  })

  it('unmounting the toast does not cancel the store-owned finalize countdown', async () => {
    vi.useFakeTimers()
    const expiresAt = new Date(Date.now() + 60).toISOString()
    const finalizeSpy = vi.fn().mockResolvedValue({ success: true, data: undefined })
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi.fn().mockResolvedValue({
        success: true,
        data: {
          deletionId: 'del-1',
          deletedAt: '2026-04-18T00:00:00.000Z',
          expiresAt,
          lastSavedAt: '2026-04-18T00:00:01.000Z',
          markdown: '',
          sectionIndex: [],
          summary: summary({ expiresAt }),
        },
      }),
      chapterStructureFinalizeDelete: finalizeSpy,
      chapterStructureUndoDelete: vi.fn(),
    })

    useChapterStructureStore.getState().bindProject('p')
    const view = render(
      <AntApp>
        <UndoDeleteToast />
      </AntApp>
    )

    await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    view.unmount()

    await vi.advanceTimersByTimeAsync(100)

    expect(finalizeSpy).toHaveBeenCalledWith({ projectId: 'p', deletionId: 'del-1' })
  })
})
