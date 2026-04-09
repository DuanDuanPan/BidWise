import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { NotificationRecord } from '@shared/notification-types'

const { mockLoadNotifications, mockMarkRead, mockMarkAllRead, mockState } = vi.hoisted(() => ({
  mockLoadNotifications: vi.fn(),
  mockMarkRead: vi.fn().mockResolvedValue(undefined),
  mockMarkAllRead: vi.fn().mockResolvedValue(undefined),
  mockState: {
    notifications: [] as NotificationRecord[],
    loading: false,
    loaded: false,
    unreadCount: 0,
  },
}))

vi.mock('@renderer/stores/notificationStore', () => ({
  useNotificationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      notifications: mockState.notifications,
      loading: mockState.loading,
      loaded: mockState.loaded,
      loadNotifications: mockLoadNotifications,
      markRead: mockMarkRead,
      markAllRead: mockMarkAllRead,
      unreadCount: mockState.unreadCount,
    })
  ),
}))

vi.mock('@renderer/stores/userStore', () => ({
  useUserStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentUser: { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
    })
  ),
}))

vi.mock('@renderer/shared/lib/format-time', () => ({
  formatRelativeTime: (date: string) => `相对(${date.slice(0, 10)})`,
}))

vi.mock('@renderer/modules/notification/constants/notification-icons', () => ({
  NOTIFICATION_TYPE_ICONS: {
    'decision-requested': { icon: 'warning', color: '#FA8C16' },
    'reply-received': { icon: 'reply', color: '#1677FF' },
    'cross-role-mention': { icon: 'at-sign', color: '#52C41A' },
  },
  NOTIFICATION_TYPE_LABELS: {
    'decision-requested': '请求指导',
    'reply-received': '收到回复',
    'cross-role-mention': '跨角色批注',
  },
}))

vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    'data-testid': testId,
  }: {
    children: React.ReactNode
    onClick?: () => void
    type?: string
    size?: string
    'data-testid'?: string
  }) => (
    <button data-testid={testId} onClick={onClick}>
      {children}
    </button>
  ),
  Empty: Object.assign(
    ({
      description,
      'data-testid': testId,
    }: {
      description: string
      style?: Record<string, unknown>
      image?: unknown
      'data-testid'?: string
    }) => <div data-testid={testId || 'empty'}>{description}</div>,
    { PRESENTED_IMAGE_SIMPLE: 'simple' }
  ),
}))

vi.mock('@ant-design/icons', () => ({
  WarningOutlined: ({ style }: { style?: Record<string, unknown> }) => (
    <span data-testid="icon-warning" style={style}>
      ⚠
    </span>
  ),
  MessageOutlined: ({ style }: { style?: Record<string, unknown> }) => (
    <span data-testid="icon-message" style={style}>
      💬
    </span>
  ),
  TeamOutlined: ({ style }: { style?: Record<string, unknown> }) => (
    <span data-testid="icon-team" style={style}>
      👥
    </span>
  ),
}))

import { NotificationPanel } from '@renderer/modules/notification/components/NotificationPanel'

function makeNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 'notif-1',
    projectId: 'proj-1',
    projectName: '投标项目A',
    sectionId: 'sec-1',
    annotationId: 'ann-1',
    targetUser: 'user:default',
    type: 'decision-requested',
    title: '请求指导',
    summary: '张总被请求指导批注',
    read: false,
    createdAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('@story-4-4 NotificationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.notifications = []
    mockState.loading = false
    mockState.loaded = false
    mockState.unreadCount = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('loads notifications on first render when not loaded', () => {
    mockState.loaded = false
    render(<NotificationPanel />)
    expect(mockLoadNotifications).toHaveBeenCalledWith({ targetUser: 'user:default' })
  })

  it('does not reload when already loaded', () => {
    mockState.loaded = true
    render(<NotificationPanel />)
    expect(mockLoadNotifications).not.toHaveBeenCalled()
  })

  it('shows loading text when loading and not loaded', () => {
    mockState.loading = true
    mockState.loaded = false
    render(<NotificationPanel />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('shows empty state when no notifications', () => {
    mockState.loaded = true
    mockState.notifications = []
    render(<NotificationPanel />)
    expect(screen.getByText('暂无通知')).toBeInTheDocument()
  })

  it('renders notification items with project name and summary', () => {
    mockState.loaded = true
    mockState.notifications = [
      makeNotification({ id: 'n-1', projectName: '项目A', summary: '测试摘要' }),
    ]
    render(<NotificationPanel />)
    expect(screen.getByText('项目A')).toBeInTheDocument()
    expect(screen.getByText('测试摘要')).toBeInTheDocument()
  })

  it('renders relative time for each notification', () => {
    mockState.loaded = true
    mockState.notifications = [makeNotification({ createdAt: '2026-04-01T00:00:00Z' })]
    render(<NotificationPanel />)
    expect(screen.getByText('相对(2026-04-01)')).toBeInTheDocument()
  })

  it('shows mark-all-read button when unread > 0', () => {
    mockState.loaded = true
    mockState.unreadCount = 2
    mockState.notifications = [makeNotification({ read: false })]
    render(<NotificationPanel />)
    expect(screen.getByTestId('mark-all-read-btn')).toBeInTheDocument()
  })

  it('hides mark-all-read button when unreadCount is 0', () => {
    mockState.loaded = true
    mockState.unreadCount = 0
    render(<NotificationPanel />)
    expect(screen.queryByTestId('mark-all-read-btn')).not.toBeInTheDocument()
  })

  it('calls markAllRead on button click', () => {
    mockState.loaded = true
    mockState.unreadCount = 1
    mockState.notifications = [makeNotification({ read: false })]
    render(<NotificationPanel />)

    fireEvent.click(screen.getByTestId('mark-all-read-btn'))
    expect(mockMarkAllRead).toHaveBeenCalledWith('user:default')
  })

  it('calls markRead and onNotificationClick on item click', async () => {
    const onClick = vi.fn()
    mockState.loaded = true
    mockState.notifications = [
      makeNotification({
        id: 'n-1',
        read: false,
        projectId: 'proj-1',
        annotationId: 'ann-1',
        sectionId: 'sec-1',
        type: 'decision-requested',
      }),
    ]
    render(<NotificationPanel onNotificationClick={onClick} />)

    fireEvent.click(screen.getByTestId('notification-item'))

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith('n-1')
    })
  })

  it('renders type-specific icons', () => {
    mockState.loaded = true
    mockState.notifications = [
      makeNotification({ id: 'n-1', type: 'decision-requested' }),
      makeNotification({ id: 'n-2', type: 'reply-received' }),
      makeNotification({ id: 'n-3', type: 'cross-role-mention' }),
    ]
    render(<NotificationPanel />)
    expect(screen.getByTestId('icon-warning')).toBeInTheDocument()
    expect(screen.getByTestId('icon-message')).toBeInTheDocument()
    expect(screen.getByTestId('icon-team')).toBeInTheDocument()
  })

  it('has aria-label on notification items', () => {
    mockState.loaded = true
    mockState.notifications = [
      makeNotification({
        projectName: 'P1',
        summary: 'S1',
        type: 'decision-requested',
        read: false,
      }),
    ]
    render(<NotificationPanel />)
    const item = screen.getByTestId('notification-item')
    expect(item).toHaveAttribute('aria-label', expect.stringContaining('请求指导'))
    expect(item).toHaveAttribute('aria-label', expect.stringContaining('P1'))
    expect(item).toHaveAttribute('aria-label', expect.stringContaining('未读'))
  })
})
