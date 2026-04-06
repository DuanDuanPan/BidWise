import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { AnnotationRecord } from '@shared/annotation-types'

function mockApi(): void {
  vi.stubGlobal('api', {
    annotationList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    annotationCreate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationUpdate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  })
}

const makeAnnotation = (overrides: Partial<AnnotationRecord> = {}): AnnotationRecord => ({
  id: 'ann-1',
  projectId: 'proj-1',
  sectionId: 'section-1',
  type: 'human',
  content: 'Test annotation content',
  author: 'user-1',
  status: 'pending',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('AnnotationPanel', () => {
  let AnnotationPanel: typeof import('@modules/project/components/AnnotationPanel').AnnotationPanel
  let useAnnotationStore: typeof import('@renderer/stores/annotationStore').useAnnotationStore

  beforeEach(async () => {
    vi.resetModules()
    mockApi()
    const storeModule = await import('@renderer/stores/annotationStore')
    useAnnotationStore = storeModule.useAnnotationStore
    useAnnotationStore.setState({ projects: {} })
    const panelModule = await import('@modules/project/components/AnnotationPanel')
    AnnotationPanel = panelModule.AnnotationPanel
  })

  afterEach(cleanup)

  describe('shell geometry (Story 1.7 contract)', () => {
    it('expanded state sets width to 320px', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-panel').style.width).toBe('320px')
    })

    it('collapsed state sets width to 40px', () => {
      render(<AnnotationPanel collapsed={true} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-panel').style.width).toBe('40px')
    })

    it('compact + collapsed renders icon bar at 48px', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-icon-bar')).toBeInTheDocument()
    })

    it('has role="complementary" and aria-label', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      const panel = screen.getByTestId('annotation-panel')
      expect(panel).toHaveAttribute('role', 'complementary')
      expect(panel).toHaveAttribute('aria-label', '智能批注')
    })

    it('has aria-live="polite" when expanded', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-panel')).toHaveAttribute('aria-live', 'polite')
    })

    it('toggle button triggers onToggle', () => {
      const onToggle = vi.fn()
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={onToggle} />)
      fireEvent.click(screen.getByTestId('annotation-toggle'))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('toggle button has correct aria-expanded', () => {
      const { rerender } = render(
        <AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />
      )
      expect(screen.getByTestId('annotation-toggle')).toHaveAttribute('aria-expanded', 'true')
      rerender(<AnnotationPanel collapsed={true} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-toggle')).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('compact flyout (Story 1.7 contract)', () => {
    it('clicking icon button opens flyout', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      expect(screen.getByTestId('annotation-flyout')).toBeInTheDocument()
    })

    it('flyout has role="dialog" and aria-label', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      const flyout = screen.getByTestId('annotation-flyout')
      expect(flyout).toHaveAttribute('role', 'dialog')
      expect(flyout).toHaveAttribute('aria-label', '智能批注面板')
    })

    it('Escape closes flyout', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()
    })

    it('clicking outside closes flyout', () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />
        </div>
      )
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      fireEvent.mouseDown(screen.getByTestId('outside'))
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()
    })
  })

  describe('header (Story 4.1)', () => {
    it('displays title as "批注"', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByText('批注')).toBeInTheDocument()
    })

    it('does not show pending pill when no projectId', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.queryByTestId('annotation-pending-pill')).not.toBeInTheDocument()
    })

    it('shows pending pill with count when pending > 0', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ id: 'a1', status: 'pending' }),
              makeAnnotation({ id: 'a2', status: 'accepted' }),
              makeAnnotation({ id: 'a3', status: 'pending' }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      const pill = screen.getByTestId('annotation-pending-pill')
      expect(pill).toBeInTheDocument()
      expect(pill.textContent).toContain('2')
      expect(pill.textContent).toContain('待处理')
    })

    it('hides pending pill when pending === 0', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'a1', status: 'accepted' })],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.queryByTestId('annotation-pending-pill')).not.toBeInTheDocument()
    })
  })

  describe('content states (Story 4.1)', () => {
    it('shows empty state without projectId', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-empty')).toBeInTheDocument()
      expect(screen.getByText('本项目暂无批注')).toBeInTheDocument()
    })

    it('shows loading state before first fetch starts (no flash of empty)', () => {
      // Before useEffect fires: loading=false, loaded=false — must show skeleton, not empty
      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [], loading: false, error: null, loaded: false },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByTestId('annotation-loading')).toBeInTheDocument()
      expect(screen.getByTestId('annotation-header-spinner')).toBeInTheDocument()
      expect(screen.queryByTestId('annotation-empty')).not.toBeInTheDocument()
    })

    it('shows loading state when loading and not yet loaded', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [], loading: true, error: null, loaded: false },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByTestId('annotation-loading')).toBeInTheDocument()
      expect(screen.getByTestId('annotation-header-spinner')).toBeInTheDocument()
      expect(screen.getByText('正在加载批注数据...')).toBeInTheDocument()
    })

    it('shows error state with retry when first load fails', async () => {
      const annotationList = vi.fn().mockResolvedValue({
        success: true,
        data: [makeAnnotation({ id: 'a1', content: 'Recovered annotation' })],
      })
      vi.stubGlobal('api', {
        ...window.api,
        annotationList,
      })

      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [], loading: false, error: 'db error', loaded: false },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByTestId('annotation-error')).toBeInTheDocument()
      expect(screen.getByText('批注加载失败')).toBeInTheDocument()
      expect(screen.getByText('db error')).toBeInTheDocument()
      expect(screen.queryByTestId('annotation-loading')).not.toBeInTheDocument()
      expect(screen.queryByTestId('annotation-header-spinner')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTestId('annotation-retry'))

      await waitFor(() => {
        expect(annotationList).toHaveBeenCalledWith({ projectId: 'proj-1' })
      })
      await waitFor(() => {
        expect(screen.getByTestId('annotation-list')).toBeInTheDocument()
      })
      expect(screen.getByText('Recovered annotation')).toBeInTheDocument()
    })

    it('shows empty state when loaded with no items', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [], loading: false, error: null, loaded: true },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByTestId('annotation-empty')).toBeInTheDocument()
    })

    it('shows list state with annotation items', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ id: 'a1', type: 'ai-suggestion', content: 'Suggestion text' }),
              makeAnnotation({ id: 'a2', type: 'human', content: 'Human note' }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByTestId('annotation-list')).toBeInTheDocument()
      const items = screen.getAllByTestId('annotation-item')
      expect(items).toHaveLength(2)
      expect(screen.getByText('Suggestion text')).toBeInTheDocument()
      expect(screen.getByText('Human note')).toBeInTheDocument()
    })

    it('annotation item shows type chip, status chip, author and time', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ type: 'adversarial', status: 'needs-decision', author: 'ai-agent' }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      expect(screen.getByText('对抗攻击')).toBeInTheDocument()
      expect(screen.getByText('待决策')).toBeInTheDocument()
      expect(screen.getByText(/ai-agent/)).toBeInTheDocument()
    })
  })
})
