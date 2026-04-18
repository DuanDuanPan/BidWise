import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { SolutionDesignView } from '@modules/editor/components/SolutionDesignView'
import { useDocumentStore } from '@renderer/stores/documentStore'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const PROJECT_ID = 'proj-rename'
const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function entry(overrides: Partial<ProposalSectionIndexEntry> = {}): ProposalSectionIndexEntry {
  return {
    sectionId: SECTION_ID,
    title: '项目概述',
    level: 1,
    order: 0,
    occurrenceIndex: 0,
    headingLocator: { title: '项目概述', level: 1, occurrenceIndex: 0 },
    ...overrides,
  }
}

describe('SolutionDesignView rename regression', () => {
  let currentContent = '# 项目概述\n\n正文\n'
  let currentSectionIndex = [entry()]
  let documentLoad: ReturnType<typeof vi.fn>
  let documentGetMetadata: ReturnType<typeof vi.fn>
  let chapterStructureUpdateTitle: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cleanup()
    useDocumentStore.getState().resetDocument()
    useChapterStructureStore.getState().reset()

    currentContent = '# 项目概述\n\n正文\n'
    currentSectionIndex = [entry()]

    documentLoad = vi.fn(async () => ({
      success: true as const,
      data: {
        projectId: PROJECT_ID,
        content: currentContent,
        lastSavedAt: '2026-04-18T10:00:00.000Z',
        version: 1,
      },
    }))
    documentGetMetadata = vi.fn(async () => ({
      success: true as const,
      data: {
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        sectionIndex: currentSectionIndex,
      },
    }))
    chapterStructureUpdateTitle = vi.fn(async (input: { title: string }) => {
      currentContent = '# 新标题\n\n正文\n'
      currentSectionIndex = [
        entry({
          title: input.title,
          headingLocator: { title: input.title, level: 1, occurrenceIndex: 0 },
        }),
      ]
      return {
        success: true as const,
        data: {
          markdown: currentContent,
          sectionIndex: currentSectionIndex,
          affectedSectionId: SECTION_ID,
          focusLocator: { title: input.title, level: 1, occurrenceIndex: 0 },
        },
      }
    })

    vi.stubGlobal('api', {
      documentLoad,
      documentGetMetadata,
      chapterStructureUpdateTitle,
      templateList: vi.fn(),
      templateGet: vi.fn(),
      templateGenerateSkeleton: vi.fn(),
      templatePersistSkeleton: vi.fn(),
      documentSave: vi.fn(),
      documentSaveSync: vi.fn(),
    })

    useDocumentStore.setState({
      content: currentContent,
      loadedProjectId: PROJECT_ID,
      loading: false,
      error: null,
      sectionIndex: currentSectionIndex,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
    })
  })

  afterEach(() => {
    cleanup()
    useDocumentStore.getState().resetDocument()
    useChapterStructureStore.getState().reset()
    vi.unstubAllGlobals()
  })

  it('keeps structure workspace mounted and avoids document reload after rename', async () => {
    render(
      <App>
        <SolutionDesignView projectId={PROJECT_ID} onEnterProposalWriting={vi.fn()} />
      </App>
    )

    await waitFor(() => expect(screen.getByTestId('structure-design-workspace')).toBeTruthy())
    await waitFor(() => expect(screen.getByTestId(`structure-node-${SECTION_ID}`)).toBeTruthy())
    expect(documentLoad).toHaveBeenCalledTimes(1)

    fireEvent.doubleClick(screen.getByTestId(`structure-node-${SECTION_ID}`))
    const input = (await screen.findByTestId('structure-node-inline-input')) as HTMLInputElement
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(screen.getByText('新标题')).toBeTruthy())
    expect(screen.queryByTestId('solution-design-loading')).toBeNull()
    expect(documentLoad).toHaveBeenCalledTimes(1)
  })
})
