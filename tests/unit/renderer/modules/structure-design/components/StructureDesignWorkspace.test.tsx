import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { App } from 'antd'
import { StructureDesignWorkspace } from '@modules/structure-design/components/StructureDesignWorkspace'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { useDocumentStore } from '@renderer/stores'
import { ChapterGenerationProvider } from '@modules/editor/context/ChapterGenerationContext'
import type { ChapterGenerationStatus, ChapterHeadingLocator } from '@shared/chapter-types'
import type { UseChapterGenerationReturn } from '@modules/editor/hooks/useChapterGeneration'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function entry(overrides: Partial<ProposalSectionIndexEntry>): ProposalSectionIndexEntry {
  return {
    sectionId: 'x',
    title: 't',
    level: 1,
    order: 0,
    occurrenceIndex: 0,
    headingLocator: { title: 't', level: 1, occurrenceIndex: 0 },
    ...overrides,
  } as ProposalSectionIndexEntry
}

function mockMetadataApi(
  sectionIndex: ProposalSectionIndexEntry[],
  extra: Record<string, unknown> = {}
): void {
  vi.stubGlobal('api', {
    documentGetMetadata: vi.fn().mockResolvedValue({
      success: true,
      data: {
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        sectionIndex,
      },
    }),
    chapterStructureUpdateTitle: vi.fn(),
    ...extra,
  })
}

describe('@story-11-2 StructureDesignWorkspace', () => {
  beforeEach(() => {
    cleanup()
    useChapterStructureStore.getState().reset()
    vi.restoreAllMocks()
  })

  it('@p0 renders structure canvas with nodes from sectionIndex', async () => {
    mockMetadataApi([
      entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 }),
      entry({ sectionId: UUID_B, title: '需求理解', level: 1, order: 1 }),
    ])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => {
      expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy()
      expect(screen.getByTestId(`structure-node-${UUID_B}`)).toBeTruthy()
    })
  })

  it('@p0 clicking node triggers focusNode on the chapterStructureStore', async () => {
    mockMetadataApi([entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())
    fireEvent.click(screen.getByTestId(`structure-node-${UUID_A}`))
    expect(useChapterStructureStore.getState().focusedNodeKey).toBe(UUID_A)
  })

  it('@p0 registers sectionId bridge after load (Story 11.1 contract)', async () => {
    mockMetadataApi([
      entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 }),
      entry({ sectionId: UUID_B, title: '需求理解', level: 1, order: 1 }),
    ])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => {
      expect(useChapterStructureStore.getState().sectionIdByNodeKey).toEqual({
        [UUID_A]: UUID_A,
        [UUID_B]: UUID_B,
      })
    })
  })

  it('@p1 shows empty state when sectionIndex is empty', async () => {
    mockMetadataApi([])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId('structure-canvas-empty')).toBeTruthy())
  })

  it('@p0 confirm CTA stays enabled on empty sectionIndex (legacy projects)', async () => {
    mockMetadataApi([])
    const onConfirm = vi.fn()
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" onConfirmSkeleton={onConfirm} />
      </App>
    )
    await waitFor(() => {
      const btn = screen.getByTestId('structure-confirm-skeleton') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
    fireEvent.click(screen.getByTestId('structure-confirm-skeleton'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('@p0 default confirm label is 继续撰写', async () => {
    mockMetadataApi([])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" onConfirmSkeleton={vi.fn()} />
      </App>
    )
    await waitFor(() => {
      expect(screen.getByTestId('structure-confirm-skeleton').textContent).toContain('继续撰写')
    })
  })

  it('@p0 rename commits through chapterStructureUpdateTitle IPC (AC2)', async () => {
    const updateTitle = vi.fn().mockResolvedValue({
      success: true,
      data: {
        sectionId: UUID_A,
        title: '新标题',
        level: 1,
        order: 0,
        occurrenceIndex: 0,
        headingLocator: { title: '新标题', level: 1, occurrenceIndex: 0 },
      },
    })
    mockMetadataApi([entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })], {
      chapterStructureUpdateTitle: updateTitle,
    })
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())

    fireEvent.doubleClick(screen.getByTestId(`structure-node-${UUID_A}`))
    const input = (await screen.findByTestId('structure-node-inline-input')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(updateTitle).toHaveBeenCalledWith({
        projectId: 'proj-1',
        sectionId: UUID_A,
        title: '新标题',
      })
    })
  })

  it('@p0 late response from previous project is discarded (race guard)', async () => {
    const slowResolver: Array<(v: unknown) => void> = []
    const documentGetMetadata = vi.fn().mockImplementation(
      (input: { projectId: string }) =>
        new Promise((resolve) => {
          slowResolver.push((sectionIndex) => {
            resolve({
              success: true,
              data: {
                annotations: [],
                sourceAttributions: [],
                baselineValidations: [],
                sectionIndex,
              },
            })
          })
          void input
        })
    )
    vi.stubGlobal('api', { documentGetMetadata, chapterStructureUpdateTitle: vi.fn() })

    const { rerender } = render(
      <App>
        <StructureDesignWorkspace projectId="proj-A" />
      </App>
    )
    // Switch to project B before project A resolves.
    rerender(
      <App>
        <StructureDesignWorkspace projectId="proj-B" />
      </App>
    )

    // Resolve project A first (stale), then project B.
    slowResolver[0]([entry({ sectionId: UUID_A, title: 'A 章', level: 1, order: 0 })])
    slowResolver[1]([entry({ sectionId: UUID_B, title: 'B 章', level: 1, order: 0 })])

    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_B}`)).toBeTruthy())
    expect(screen.queryByTestId(`structure-node-${UUID_A}`)).toBeNull()
  })

  it('@p0 rename success rehydrates documentStore (prevents stale autosave overwrite)', async () => {
    const updateTitle = vi.fn().mockResolvedValue({
      success: true,
      data: {
        sectionId: UUID_A,
        title: '新标题',
        level: 1,
        order: 0,
        occurrenceIndex: 0,
        headingLocator: { title: '新标题', level: 1, occurrenceIndex: 0 },
      },
    })
    mockMetadataApi([entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })], {
      chapterStructureUpdateTitle: updateTitle,
    })

    const loadDocumentSpy = vi.fn().mockResolvedValue(undefined)
    const originalLoadDocument = useDocumentStore.getState().loadDocument
    useDocumentStore.setState({ loadDocument: loadDocumentSpy })

    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())

    fireEvent.doubleClick(screen.getByTestId(`structure-node-${UUID_A}`))
    const input = (await screen.findByTestId('structure-node-inline-input')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(updateTitle).toHaveBeenCalled()
      expect(loadDocumentSpy).toHaveBeenCalledWith('proj-1')
    })

    useDocumentStore.setState({ loadDocument: originalLoadDocument })
  })

  it('@p0 does NOT reload documentStore on rename failure (preserves unchanged disk state)', async () => {
    const updateTitle = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION', message: '失败' },
    })
    mockMetadataApi([entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })], {
      chapterStructureUpdateTitle: updateTitle,
    })

    const loadDocumentSpy = vi.fn().mockResolvedValue(undefined)
    const originalLoadDocument = useDocumentStore.getState().loadDocument
    useDocumentStore.setState({ loadDocument: loadDocumentSpy })

    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())

    fireEvent.doubleClick(screen.getByTestId(`structure-node-${UUID_A}`))
    const input = (await screen.findByTestId('structure-node-inline-input')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(updateTitle).toHaveBeenCalled())
    expect(loadDocumentSpy).not.toHaveBeenCalled()

    useDocumentStore.setState({ loadDocument: originalLoadDocument })
  })

  it('@p0 ignores phase statuses from a different project (cross-project guard)', async () => {
    mockMetadataApi([
      entry({
        sectionId: UUID_A,
        title: '项目综述',
        level: 1,
        order: 0,
        headingLocator: { title: '项目综述', level: 1, occurrenceIndex: 0 },
      }),
    ])

    const locator: ChapterHeadingLocator = { title: '项目综述', level: 1, occurrenceIndex: 0 }
    const status: ChapterGenerationStatus = {
      target: locator,
      phase: 'generating-text',
      progress: 40,
      taskId: 'task-A',
    }
    const statuses = new Map<string, ChapterGenerationStatus>([['1:项目综述:0', status]])
    // Context still reports previous project A while workspace mounts for project B.
    const contextValue = {
      currentProjectId: 'proj-A',
      statuses,
    } as unknown as UseChapterGenerationReturn

    render(
      <App>
        <ChapterGenerationProvider value={contextValue}>
          <StructureDesignWorkspace projectId="proj-B" />
        </ChapterGenerationProvider>
      </App>
    )

    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())
    // Idle row for B's "项目综述" must NOT inherit A's phase icon.
    expect(screen.queryByTestId('structure-node-phase-running')).toBeNull()
  })

  it('@p0 derives phaseByNodeKey from ChapterGenerationContext for AC5 idle decorators', async () => {
    mockMetadataApi([
      entry({
        sectionId: UUID_A,
        title: '项目综述',
        level: 1,
        order: 0,
        headingLocator: { title: '项目综述', level: 1, occurrenceIndex: 0 },
      }),
    ])

    const locator: ChapterHeadingLocator = { title: '项目综述', level: 1, occurrenceIndex: 0 }
    const status: ChapterGenerationStatus = {
      target: locator,
      phase: 'generating-text',
      progress: 40,
      taskId: 'task-1',
    }
    const statuses = new Map<string, ChapterGenerationStatus>([['1:项目综述:0', status]])
    const contextValue = {
      currentProjectId: 'proj-1',
      statuses,
    } as unknown as UseChapterGenerationReturn

    render(
      <App>
        <ChapterGenerationProvider value={contextValue}>
          <StructureDesignWorkspace projectId="proj-1" />
        </ChapterGenerationProvider>
      </App>
    )

    await waitFor(() => {
      expect(screen.getByTestId('structure-node-phase-running')).toBeTruthy()
    })
  })
})
