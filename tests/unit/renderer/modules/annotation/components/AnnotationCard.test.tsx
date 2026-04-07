import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { AnnotationRecord, AnnotationType } from '@shared/annotation-types'

// Hoist mocks
const { mockUpdateAnnotation, mockMessageInfo } = vi.hoisted(() => ({
  mockUpdateAnnotation: vi.fn().mockResolvedValue(undefined),
  mockMessageInfo: vi.fn(),
}))

vi.mock('@renderer/stores/annotationStore', () => ({
  useAnnotationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ updateAnnotation: mockUpdateAnnotation })
  ),
}))

vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    type: btnType,
    size,
    style,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    onClick?: () => void
    type?: string
    size?: string
    style?: React.CSSProperties
    'data-testid'?: string
  }) => (
    <button
      data-testid={testId}
      data-btn-type={btnType}
      data-size={size}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Tag: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <span data-testid="type-tag" style={style}>
      {children}
    </span>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  message: { info: mockMessageInfo },
}))

import { AnnotationCard } from '@renderer/modules/annotation/components/AnnotationCard'

/** Convert hex #RRGGBB to rgb(r, g, b) for jsdom comparison */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

function makeAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'ann-1',
    projectId: 'proj-1',
    sectionId: 'sec-1',
    type: 'ai-suggestion',
    content: '建议增加高可用描述以提升方案竞争力',
    author: '系统助手',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('@story-4-2 AnnotationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  // ── AC #1: 五色渲染 ──

  describe('五色渲染 (AC #1)', () => {
    const typeCases: { type: AnnotationType; expectedColor: string }[] = [
      { type: 'ai-suggestion', expectedColor: '#1677FF' },
      { type: 'asset-recommendation', expectedColor: '#52C41A' },
      { type: 'score-warning', expectedColor: '#FAAD14' },
      { type: 'adversarial', expectedColor: '#FF4D4F' },
      { type: 'human', expectedColor: '#722ED1' },
      { type: 'cross-role', expectedColor: '#722ED1' },
    ]

    for (const { type, expectedColor } of typeCases) {
      it(`renders ${type} with correct left border color ${expectedColor}`, () => {
        render(<AnnotationCard annotation={makeAnnotation({ type })} />)
        const card = screen.getByTestId('annotation-card')
        expect(card.style.borderLeft).toBe(`3px solid ${hexToRgb(expectedColor)}`)
      })
    }
  })

  // ── AC #5: 三重编码 ──

  describe('三重编码 (AC #5)', () => {
    it('displays icon + color + text label for each type', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)

      // Icon: svg element present
      const svgs = screen.getByTestId('annotation-card').querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThan(0)

      // Tag with type label
      const tag = screen.getByTestId('type-tag')
      expect(tag).toHaveTextContent('AI 建议')

      // Tag uses correct color (jsdom converts hex → rgb)
      expect(tag.style.color).toBe(hexToRgb('#1677FF'))
    })
  })

  // ── AC #2: 操作按钮按类型渲染 ──

  describe('操作按钮 (AC #2)', () => {
    it('renders ai-suggestion buttons: 采纳/驳回/修改', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)
      expect(screen.getByTestId('annotation-action-accept')).toHaveTextContent('采纳')
      expect(screen.getByTestId('annotation-action-reject')).toHaveTextContent('驳回')
      expect(screen.getByTestId('annotation-action-edit')).toHaveTextContent('修改')
    })

    it('renders asset-recommendation buttons: 插入/忽略/查看', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'asset-recommendation' })} />)
      expect(screen.getByTestId('annotation-action-insert')).toHaveTextContent('插入')
      expect(screen.getByTestId('annotation-action-ignore')).toHaveTextContent('忽略')
      expect(screen.getByTestId('annotation-action-view')).toHaveTextContent('查看')
    })

    it('renders score-warning buttons: 处理/标记待决策', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'score-warning' })} />)
      expect(screen.getByTestId('annotation-action-handle')).toHaveTextContent('处理')
      expect(screen.getByTestId('annotation-action-defer')).toHaveTextContent('标记待决策')
    })

    it('renders adversarial buttons: 接受并修改/反驳/请求指导', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'adversarial' })} />)
      expect(screen.getByTestId('annotation-action-accept-edit')).toHaveTextContent('接受并修改')
      expect(screen.getByTestId('annotation-action-refute')).toHaveTextContent('反驳')
      expect(screen.getByTestId('annotation-action-request-guidance')).toHaveTextContent('请求指导')
    })

    it('renders human buttons: 标记已处理/回复', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'human' })} />)
      expect(screen.getByTestId('annotation-action-mark-handled')).toHaveTextContent('标记已处理')
      expect(screen.getByTestId('annotation-action-reply')).toHaveTextContent('回复')
    })

    it('renders cross-role buttons: 标记已处理/回复', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'cross-role' })} />)
      expect(screen.getByTestId('annotation-action-mark-handled')).toHaveTextContent('标记已处理')
      expect(screen.getByTestId('annotation-action-reply')).toHaveTextContent('回复')
    })

    it('primary button has type="primary"', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)
      const acceptBtn = screen.getByTestId('annotation-action-accept')
      expect(acceptBtn.dataset.btnType).toBe('primary')
    })
  })

  // ── AC #3: 点击状态变更 ──

  describe('状态变更 (AC #3)', () => {
    it('clicking "采纳" updates status to accepted', async () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)
      fireEvent.click(screen.getByTestId('annotation-action-accept'))
      await waitFor(() => {
        expect(mockUpdateAnnotation).toHaveBeenCalledWith({ id: 'ann-1', status: 'accepted' })
      })
    })

    it('clicking "驳回" updates status to rejected', async () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)
      fireEvent.click(screen.getByTestId('annotation-action-reject'))
      await waitFor(() => {
        expect(mockUpdateAnnotation).toHaveBeenCalledWith({ id: 'ann-1', status: 'rejected' })
      })
    })

    it('clicking "标记待决策" updates status to needs-decision', async () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'score-warning' })} />)
      fireEvent.click(screen.getByTestId('annotation-action-defer'))
      await waitFor(() => {
        expect(mockUpdateAnnotation).toHaveBeenCalledWith({ id: 'ann-1', status: 'needs-decision' })
      })
    })

    it('clicking placeholder "修改" shows message.info', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'ai-suggestion' })} />)
      fireEvent.click(screen.getByTestId('annotation-action-edit'))
      expect(mockMessageInfo).toHaveBeenCalledWith('功能将在后续版本实现')
      expect(mockUpdateAnnotation).not.toHaveBeenCalled()
    })

    it('clicking placeholder "回复" shows message.info', () => {
      render(<AnnotationCard annotation={makeAnnotation({ type: 'human' })} />)
      fireEvent.click(screen.getByTestId('annotation-action-reply'))
      expect(mockMessageInfo).toHaveBeenCalledWith('功能将在后续版本实现')
    })
  })

  // ── AC #6: 已处理态 ──

  describe('已处理态 (AC #6)', () => {
    it('accepted card has opacity 0.6', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'accepted' })} />)
      const card = screen.getByTestId('annotation-card')
      expect(card.style.opacity).toBe('0.6')
    })

    it('rejected card has opacity 0.6', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'rejected' })} />)
      expect(screen.getByTestId('annotation-card').style.opacity).toBe('0.6')
    })

    it('needs-decision card has opacity 0.6', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'needs-decision' })} />)
      expect(screen.getByTestId('annotation-card').style.opacity).toBe('0.6')
    })

    it('hides action buttons when processed', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'accepted' })} />)
      expect(screen.queryByTestId('annotation-action-accept')).toBeNull()
    })

    it('shows status label "已采纳 ✓" for accepted', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'accepted' })} />)
      expect(screen.getByTestId('annotation-status-label')).toHaveTextContent('已采纳 ✓')
    })

    it('shows status label "已驳回 ✗" for rejected', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'rejected' })} />)
      expect(screen.getByTestId('annotation-status-label')).toHaveTextContent('已驳回 ✗')
    })

    it('shows status label "待决策 ⏳" for needs-decision', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'needs-decision' })} />)
      expect(screen.getByTestId('annotation-status-label')).toHaveTextContent('待决策 ⏳')
    })

    it('pending card has opacity 1', () => {
      render(<AnnotationCard annotation={makeAnnotation({ status: 'pending' })} />)
      expect(screen.getByTestId('annotation-card').style.opacity).toBe('1')
    })
  })

  // ── 焦点态 ──

  describe('焦点态', () => {
    it('focused card has blue 2px outline', () => {
      render(<AnnotationCard annotation={makeAnnotation()} focused={true} />)
      const card = screen.getByTestId('annotation-card')
      expect(card.style.outline).toBe('2px solid #1677FF')
    })

    it('unfocused card has no outline', () => {
      render(<AnnotationCard annotation={makeAnnotation()} focused={false} />)
      const card = screen.getByTestId('annotation-card')
      expect(card.style.outline).toBe('none')
    })
  })

  // ── data-annotation-id ──

  it('sets data-annotation-id attribute', () => {
    render(<AnnotationCard annotation={makeAnnotation({ id: 'test-id-123' })} />)
    expect(screen.getByTestId('annotation-card').dataset.annotationId).toBe('test-id-123')
  })

  // ── aria-label ──

  it('sets aria-label with type, author, and content summary', () => {
    render(
      <AnnotationCard
        annotation={makeAnnotation({
          type: 'score-warning',
          author: '评分引擎',
          content: '安全章节缺失',
        })}
      />
    )
    const card = screen.getByTestId('annotation-card')
    expect(card.getAttribute('aria-label')).toContain('评分预警')
    expect(card.getAttribute('aria-label')).toContain('评分引擎')
    expect(card.getAttribute('aria-label')).toContain('安全章节缺失')
  })

  // ── cross-role uses human icon but distinct label ──

  it('cross-role shows "跨角色" label, not "人工批注"', () => {
    render(<AnnotationCard annotation={makeAnnotation({ type: 'cross-role' })} />)
    expect(screen.getByTestId('type-tag')).toHaveTextContent('跨角色')
  })
})
