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
import type { StructureMutationSnapshotDto } from '@shared/ipc-types'

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

function renameSnapshot(
  sectionIndex: ProposalSectionIndexEntry[],
  sectionId: string,
  title: string
): StructureMutationSnapshotDto {
  const target = sectionIndex.find((item) => item.sectionId === sectionId)
  return {
    markdown: sectionIndex
      .map((item) => {
        const nextTitle = item.sectionId === sectionId ? title : item.title
        return `${'#'.repeat(item.level)} ${nextTitle}\n`
      })
      .join('\n'),
    sectionIndex: sectionIndex.map((item) =>
      item.sectionId === sectionId
        ? {
            ...item,
            title,
            headingLocator: { ...item.headingLocator, title },
          }
        : item
    ),
    affectedSectionId: sectionId,
    focusLocator: target
      ? { ...target.headingLocator, title }
      : {
          title,
          level: 1,
          occurrenceIndex: 0,
        },
  }
}

function seedDocStore(projectId: string, sectionIndex: ProposalSectionIndexEntry[]): void {
  useDocumentStore.setState({
    loadedProjectId: projectId,
    sectionIndex,
    loading: false,
    error: null,
  })
}

function mockMetadataApi(
  sectionIndex: ProposalSectionIndexEntry[],
  extra: Record<string, unknown> = {},
  projectId = 'proj-1'
): void {
  // Hook now reads from documentStore directly; we still keep the IPC stubs
  // around for mutation calls (chapterStructureUpdateTitle, etc.) that
  // individual tests override via `extra`.
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
  seedDocStore(projectId, sectionIndex)
}

describe('@story-11-2 StructureDesignWorkspace', () => {
  beforeEach(() => {
    cleanup()
    useChapterStructureStore.getState().reset()
    useDocumentStore.setState({
      loadedProjectId: null,
      sectionIndex: [],
      loading: false,
      error: null,
    })
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

  it('@p0 clicking node triggers focusSection on the chapterStructureStore', async () => {
    mockMetadataApi([entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })])
    render(
      <App>
        <StructureDesignWorkspace projectId="proj-1" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())
    fireEvent.click(screen.getByTestId(`structure-node-${UUID_A}`))
    expect(useChapterStructureStore.getState().focusedSectionId).toBe(UUID_A)
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
    const initialIndex = [entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })]
    const updateTitle = vi.fn().mockResolvedValue({
      success: true,
      data: renameSnapshot(initialIndex, UUID_A, '新标题'),
    })
    mockMetadataApi(initialIndex, {
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
      expect(screen.getByText('新标题')).toBeTruthy()
    })
  })

  it('@p0 only renders nodes when docStore loadedProjectId matches (project switch guard)', async () => {
    // The hook now reads sectionIndex from documentStore. When the store still
    // holds the previous project's data during a switch, the workspace must
    // render an empty tree rather than leaking stale nodes into the new
    // project's canvas.
    vi.stubGlobal('api', { chapterStructureUpdateTitle: vi.fn() })

    seedDocStore('proj-A', [entry({ sectionId: UUID_A, title: 'A 章', level: 1, order: 0 })])

    const { rerender } = render(
      <App>
        <StructureDesignWorkspace projectId="proj-A" />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_A}`)).toBeTruthy())

    // Switch project prop before docStore has been re-hydrated for proj-B.
    rerender(
      <App>
        <StructureDesignWorkspace projectId="proj-B" />
      </App>
    )
    expect(screen.queryByTestId(`structure-node-${UUID_A}`)).toBeNull()

    // Once docStore catches up to proj-B, its nodes render.
    seedDocStore('proj-B', [entry({ sectionId: UUID_B, title: 'B 章', level: 1, order: 0 })])
    await waitFor(() => expect(screen.getByTestId(`structure-node-${UUID_B}`)).toBeTruthy())
    expect(screen.queryByTestId(`structure-node-${UUID_A}`)).toBeNull()
  })

  it('@p0 rename success updates documentStore in place without reload', async () => {
    const initialIndex = [entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 })]
    const updateTitle = vi.fn().mockResolvedValue({
      success: true,
      data: renameSnapshot(initialIndex, UUID_A, '新标题'),
    })
    mockMetadataApi(initialIndex, {
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
      expect(screen.getByText('新标题')).toBeTruthy()
    })
    expect(loadDocumentSpy).not.toHaveBeenCalled()
    expect(useDocumentStore.getState().sectionIndex[0]?.title).toBe('新标题')

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
    mockMetadataApi(
      [
        entry({
          sectionId: UUID_A,
          title: '项目综述',
          level: 1,
          order: 0,
          headingLocator: { title: '项目综述', level: 1, occurrenceIndex: 0 },
        }),
      ],
      {},
      'proj-B'
    )

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
