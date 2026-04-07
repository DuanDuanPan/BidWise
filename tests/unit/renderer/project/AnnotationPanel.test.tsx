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

  // ── 壳层几何合同 (Story 1.7) ──

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

  // ── 紧凑 flyout ──

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

  // ── Header ──

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

  // ── 内容状态 ──

  describe('content states (Story 4.1)', () => {
    it('shows empty state without projectId', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-empty')).toBeInTheDocument()
      expect(screen.getByText('本项目暂无批注')).toBeInTheDocument()
    })

    it('shows loading state before first fetch starts', () => {
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
    })

    it('shows error state with retry when first load fails', async () => {
      const annotationList = vi.fn().mockResolvedValue({
        success: true,
        data: [makeAnnotation({ id: 'a1', content: 'Recovered annotation' })],
      })
      vi.stubGlobal('api', { ...window.api, annotationList })

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

      fireEvent.click(screen.getByTestId('annotation-retry'))

      await waitFor(() => {
        expect(annotationList).toHaveBeenCalledWith({ projectId: 'proj-1' })
      })
      await waitFor(() => {
        expect(screen.getByTestId('annotation-list')).toBeInTheDocument()
      })
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

    it('shows list with AnnotationCard items (Story 4.2 upgrade)', () => {
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
      const cards = screen.getAllByTestId('annotation-card')
      expect(cards).toHaveLength(2)
      expect(screen.getByText('Suggestion text')).toBeInTheDocument()
      expect(screen.getByText('Human note')).toBeInTheDocument()
    })
  })

  // ── Story 4.2: 键盘导航 (AC #4) ──

  describe('keyboard navigation (AC #4)', () => {
    function setupWithAnnotations(): void {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({
                id: 'a1',
                type: 'ai-suggestion',
                content: 'First',
                status: 'pending',
              }),
              makeAnnotation({
                id: 'a2',
                type: 'score-warning',
                content: 'Second',
                status: 'pending',
              }),
              makeAnnotation({
                id: 'a3',
                type: 'adversarial',
                content: 'Third',
                status: 'pending',
              }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })
    }

    it('first card is focused by default', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )
      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('Alt+ArrowDown moves focus to next card', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      // Second card should now be focused
      expect(cards[1].style.outline).toContain('2px solid')
      expect(cards[0].style.outline).toBe('none')
    })

    it('Alt+ArrowUp moves focus to previous card', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      // Move down first, then up
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })
      fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('Alt+ArrowDown wraps from last to first', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      // Navigate to end and wrap
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('Alt+ArrowUp wraps from first to last', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[2].style.outline).toContain('2px solid')
    })

    it('Alt+Enter executes primary action on focused pending card', async () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      fireEvent.keyDown(window, { key: 'Enter', altKey: true })

      await waitFor(() => {
        expect(window.api.annotationUpdate).toHaveBeenCalledWith({
          id: 'a1',
          status: 'accepted',
        })
      })
    })

    it('Alt+Backspace executes reject on ai-suggestion card', async () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      fireEvent.keyDown(window, { key: 'Backspace', altKey: true })

      await waitFor(() => {
        expect(window.api.annotationUpdate).toHaveBeenCalledWith({
          id: 'a1',
          status: 'rejected',
        })
      })
    })

    it('Alt+Backspace on score-warning is no-op (no reject action)', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      // Navigate to score-warning card (index 1)
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true })
      fireEvent.keyDown(window, { key: 'Backspace', altKey: true })

      // Should NOT have been called (score-warning has no reject)
      expect(window.api.annotationUpdate).not.toHaveBeenCalled()
    })

    it('Alt+D marks focused card as needs-decision', async () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          projectId="proj-1"
        />
      )

      fireEvent.keyDown(window, { key: 'd', altKey: true })

      await waitFor(() => {
        expect(window.api.annotationUpdate).toHaveBeenCalledWith({
          id: 'a1',
          status: 'needs-decision',
        })
      })
    })

    it('shortcuts are no-op on already processed cards', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'a1', type: 'ai-suggestion', status: 'accepted' })],
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

      fireEvent.keyDown(window, { key: 'Enter', altKey: true })
      fireEvent.keyDown(window, { key: 'Backspace', altKey: true })
      fireEvent.keyDown(window, { key: 'd', altKey: true })

      expect(window.api.annotationUpdate).not.toHaveBeenCalled()
    })

    it('does not intercept keyboard when target is an input element', () => {
      setupWithAnnotations()
      render(
        <div>
          <input data-testid="test-input" />
          <AnnotationPanel
            collapsed={false}
            isCompact={false}
            onToggle={vi.fn()}
            projectId="proj-1"
          />
        </div>
      )

      const input = screen.getByTestId('test-input')
      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })

      // Focus should remain on first card (event was in input, should be ignored)
      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('does not intercept keyboard when target is a textarea', () => {
      setupWithAnnotations()
      render(
        <div>
          <textarea data-testid="test-textarea" />
          <AnnotationPanel
            collapsed={false}
            isCompact={false}
            onToggle={vi.fn()}
            projectId="proj-1"
          />
        </div>
      )

      const textarea = screen.getByTestId('test-textarea')
      fireEvent.keyDown(textarea, { key: 'ArrowDown', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('does not intercept keyboard when target is contenteditable', () => {
      setupWithAnnotations()
      render(
        <div>
          <div data-testid="editable" contentEditable="true" />
          <AnnotationPanel
            collapsed={false}
            isCompact={false}
            onToggle={vi.fn()}
            projectId="proj-1"
          />
        </div>
      )

      const editable = screen.getByTestId('editable')
      fireEvent.keyDown(editable, { key: 'ArrowDown', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('does not intercept when target is inside plate-editor-content', () => {
      setupWithAnnotations()
      render(
        <div>
          <div data-testid="plate-editor-content">
            <div data-testid="editor-child" />
          </div>
          <AnnotationPanel
            collapsed={false}
            isCompact={false}
            onToggle={vi.fn()}
            projectId="proj-1"
          />
        </div>
      )

      const child = screen.getByTestId('editor-child')
      fireEvent.keyDown(child, { key: 'ArrowDown', altKey: true })

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards[0].style.outline).toContain('2px solid')
    })

    it('keyboard navigation is inactive when panel is collapsed', () => {
      setupWithAnnotations()
      render(
        <AnnotationPanel collapsed={true} isCompact={false} onToggle={vi.fn()} projectId="proj-1" />
      )

      // Collapsed panel doesn't render cards, so no navigation possible
      expect(screen.queryByTestId('annotation-card')).not.toBeInTheDocument()
    })
  })

  // ── Story 4.3: 智能批注面板与上下文优先级排序 ──

  describe('Story 4.3: smart annotation panel', () => {
    it('renders filter controls when projectId is provided', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'a1' })],
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

      expect(screen.getByTestId('annotation-filters')).toBeInTheDocument()
    })

    it('renders section label when currentSection is provided', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'a1', sectionId: '2:公司简介:0' })],
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
          sopPhase="proposal-writing"
          currentSection={{
            locator: { title: '公司简介', level: 2, occurrenceIndex: 0 },
            sectionKey: '2:公司简介:0',
            label: '公司简介',
          }}
        />
      )

      expect(screen.getByTestId('section-label')).toBeInTheDocument()
      expect(screen.getByText('当前章节: 公司简介')).toBeInTheDocument()
    })

    it('shows chapter-level empty state when currentSection has no matching annotations', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'a1', sectionId: '2:其他章节:0' })],
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
          sopPhase="proposal-writing"
          currentSection={{
            locator: { title: '公司简介', level: 2, occurrenceIndex: 0 },
            sectionKey: '2:公司简介:0',
            label: '公司简介',
          }}
        />
      )

      expect(screen.getByTestId('annotation-empty-section')).toBeInTheDocument()
      expect(screen.getByText('本章节 AI 审查完毕，未发现需要您关注的问题')).toBeInTheDocument()
    })

    it('scopes annotations to current section', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ id: 'a1', sectionId: '2:公司简介:0', content: 'In section' }),
              makeAnnotation({ id: 'a2', sectionId: '2:技术方案:0', content: 'Not in section' }),
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
          sopPhase="proposal-writing"
          currentSection={{
            locator: { title: '公司简介', level: 2, occurrenceIndex: 0 },
            sectionKey: '2:公司简介:0',
            label: '公司简介',
          }}
        />
      )

      const cards = screen.getAllByTestId('annotation-card')
      expect(cards).toHaveLength(1)
      expect(screen.getByText('In section')).toBeInTheDocument()
      expect(screen.queryByText('Not in section')).not.toBeInTheDocument()
    })

    it('renders ask-system trigger button', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [],
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
          sopPhase="proposal-writing"
          currentSection={{
            locator: { title: '公司简介', level: 2, occurrenceIndex: 0 },
            sectionKey: '2:公司简介:0',
            label: '公司简介',
          }}
        />
      )

      expect(screen.getByTestId('ask-system-trigger')).toBeInTheDocument()
    })

    it('preserves shell contract: expanded width 320px', () => {
      render(
        <AnnotationPanel
          collapsed={false}
          isCompact={false}
          onToggle={vi.fn()}
          sopPhase="proposal-writing"
        />
      )
      expect(screen.getByTestId('annotation-panel').style.width).toBe('320px')
    })

    it('preserves shell contract: collapsed width 40px', () => {
      render(
        <AnnotationPanel
          collapsed={true}
          isCompact={false}
          onToggle={vi.fn()}
          sopPhase="proposal-writing"
        />
      )
      expect(screen.getByTestId('annotation-panel').style.width).toBe('40px')
    })

    it('preserves shell contract: compact icon bar 48px', () => {
      render(
        <AnnotationPanel
          collapsed={true}
          isCompact={true}
          onToggle={vi.fn()}
          sopPhase="proposal-writing"
        />
      )
      expect(screen.getByTestId('annotation-icon-bar')).toBeInTheDocument()
    })
  })
})
