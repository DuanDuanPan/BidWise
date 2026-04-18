import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { SkeletonSection } from '@shared/template-types'

const mockModalConfirm = vi.fn()

// Mock antd App.useApp to provide modal
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd')
  return {
    ...actual,
    App: {
      ...(actual as Record<string, unknown>).App,
      useApp: () => ({
        message: {},
        modal: { confirm: mockModalConfirm },
      }),
    },
  }
})

import { SkeletonEditor } from '@modules/editor/components/SkeletonEditor'

const mockSkeleton: SkeletonSection[] = [
  {
    id: 's1',
    title: '项目概述',
    level: 1,
    guidanceText: '概述内容',
    weightPercent: 10,
    isKeyFocus: false,
    children: [
      {
        id: 's1.1',
        title: '项目背景',
        level: 2,
        isKeyFocus: false,
        children: [],
      },
    ],
  },
  {
    id: 's2',
    title: '系统架构设计',
    level: 1,
    guidanceText: '架构设计',
    weightPercent: 30,
    isKeyFocus: true,
    scoringCriterionId: 'c1',
    scoringCriterionName: '系统架构设计',
    children: [],
  },
]

describe('@story-3-3 SkeletonEditor', () => {
  const defaultProps = {
    skeleton: mockSkeleton,
    onUpdate: vi.fn(),
    onConfirm: vi.fn(),
    onRegenerate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders skeleton tree structure', () => {
    render(<SkeletonEditor {...defaultProps} />)
    expect(screen.getByTestId('skeleton-editor')).toBeDefined()
    expect(screen.getByText('项目概述')).toBeDefined()
    expect(screen.getByText('项目背景')).toBeDefined()
    expect(screen.getByText('系统架构设计')).toBeDefined()
  })

  it('displays weight tags', () => {
    render(<SkeletonEditor {...defaultProps} />)
    expect(screen.getByText('10%')).toBeDefined()
    expect(screen.getByText('30%')).toBeDefined()
  })

  it('displays key focus tag when isKeyFocus is true', () => {
    render(<SkeletonEditor {...defaultProps} />)
    expect(screen.getByTestId('key-focus-s2')).toBeDefined()
    expect(screen.getByText('重点投入')).toBeDefined()
  })

  it('does not display key focus tag when isKeyFocus is false', () => {
    render(<SkeletonEditor {...defaultProps} />)
    expect(screen.queryByTestId('key-focus-s1')).toBeNull()
  })

  it('shows section statistics', () => {
    render(<SkeletonEditor {...defaultProps} />)
    expect(screen.getByText('3 个章节，1 个重点章节')).toBeDefined()
  })

  it('triggers onConfirm when confirm button clicked', () => {
    render(<SkeletonEditor {...defaultProps} />)
    fireEvent.click(screen.getByTestId('confirm-skeleton-btn'))
    expect(defaultProps.onConfirm).toHaveBeenCalled()
  })

  it('triggers onRegenerate when regenerate button clicked', () => {
    render(<SkeletonEditor {...defaultProps} />)
    fireEvent.click(screen.getByTestId('regenerate-btn'))
    expect(defaultProps.onRegenerate).toHaveBeenCalled()
  })

  it('enters edit mode on double click', () => {
    render(<SkeletonEditor {...defaultProps} />)
    const titleElement = screen.getByText('项目概述')
    fireEvent.doubleClick(titleElement)
    expect(screen.getByTestId('edit-input-s1')).toBeDefined()
  })

  it('clicking a draft node shows focused highlight', () => {
    render(<SkeletonEditor {...defaultProps} />)
    fireEvent.click(screen.getByTestId('tree-node-s1'))
    expect(screen.getByTestId('tree-node-s1-focus-bar')).toBeDefined()
    expect(screen.getByTestId('tree-node-s1').getAttribute('data-node-state')).toBe('focused')
  })

  it('opens dropdown and clicking delete calls modal.confirm', async () => {
    render(<SkeletonEditor {...defaultProps} />)

    // Click the "..." action button for the first node
    const actionBtn = screen.getByTestId('node-actions-s1')
    fireEvent.click(actionBtn)

    // Wait for dropdown menu to appear and click "删除"
    await waitFor(() => {
      expect(screen.getByText('删除')).toBeDefined()
    })
    fireEvent.click(screen.getByText('删除'))

    // Verify modal.confirm was called with correct config
    expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    expect(mockModalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认删除',
        content: '确定删除「项目概述」及其所有子章节？',
      })
    )
  })

  it('deletes node when modal.confirm onOk is invoked', async () => {
    render(<SkeletonEditor {...defaultProps} />)

    // Open dropdown and click delete
    const actionBtn = screen.getByTestId('node-actions-s1')
    fireEvent.click(actionBtn)

    await waitFor(() => {
      expect(screen.getByText('删除')).toBeDefined()
    })
    fireEvent.click(screen.getByText('删除'))

    // Extract and invoke the onOk callback
    expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    const confirmConfig = mockModalConfirm.mock.calls[0][0]
    confirmConfig.onOk()

    // Verify onUpdate was called with s1 removed
    expect(defaultProps.onUpdate).toHaveBeenCalledTimes(1)
    const updatedSkeleton = defaultProps.onUpdate.mock.calls[0][0]
    // Should only have s2, s1 and its children should be removed
    expect(updatedSkeleton).toHaveLength(1)
    expect(updatedSkeleton[0].id).toBe('s2')
  })
})
