import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { ComplianceCoverageMatrix } from '@modules/analysis/components/ComplianceCoverageMatrix'
import type { TraceabilityMatrix } from '@shared/analysis-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const headingLocator: ChapterHeadingLocator = {
  title: '技术方案',
  level: 2,
  occurrenceIndex: 0,
}

function renderMatrix(matrix: TraceabilityMatrix, onNavigateToChapter = vi.fn()): void {
  render(
    <ConfigProvider>
      <ComplianceCoverageMatrix
        matrix={matrix}
        onCreateLink={vi.fn()}
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onNavigateToChapter={onNavigateToChapter}
      />
    </ConfigProvider>
  )
}

function makeMatrix(overrides: Partial<TraceabilityMatrix> = {}): TraceabilityMatrix {
  return {
    projectId: 'proj-1',
    rows: [
      {
        requirementId: 'req-1',
        sequenceNumber: 1,
        description: '提供技术方案',
        category: 'technical',
        cells: [
          {
            requirementId: 'req-1',
            requirementDescription: '提供技术方案',
            requirementSequence: 1,
            sectionId: 'sec-1',
            sectionTitle: '技术方案',
            cellState: 'covered',
            coverageStatus: 'covered',
            confidence: 0.9,
            source: 'manual',
            matchReason: '已人工确认',
            linkId: 'link-1',
            isImpacted: false,
          },
        ],
      },
    ],
    columns: [
      {
        sectionId: 'sec-1',
        title: '技术方案',
        level: 2,
        order: 1,
        occurrenceIndex: 0,
        headingLocator,
      },
    ],
    stats: {
      totalRequirements: 1,
      coveredCount: 1,
      partialCount: 0,
      uncoveredCount: 0,
      coverageRate: 1,
    },
    generatedAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    recentlyImpactedSectionIds: [],
    recentlyAddedRequirementIds: [],
    ...overrides,
  }
}

describe('ComplianceCoverageMatrix', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('shows the jump action in the context menu when a locator exists', async () => {
    const onNavigateToChapter = vi.fn()
    renderMatrix(makeMatrix(), onNavigateToChapter)

    fireEvent.contextMenu(screen.getByTestId('cell-req-1-sec-1'))

    const jumpAction = await screen.findByText('跳转到方案章节')
    fireEvent.click(jumpAction)

    await waitFor(() => {
      expect(onNavigateToChapter).toHaveBeenCalledWith(headingLocator)
    })
  })

  it('celebrates all-covered state only once until coverage changes again', async () => {
    vi.useFakeTimers()
    renderMatrix(makeMatrix())

    const cell = screen.getByTestId('cell-req-1-sec-1')

    expect(cell.className).toContain('animate-pulse')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(cell.className).not.toContain('animate-pulse')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })

    expect(cell.className).not.toContain('animate-pulse')
  })
})
