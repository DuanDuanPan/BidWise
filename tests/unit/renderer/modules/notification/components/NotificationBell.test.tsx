import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const { mockRefreshUnreadCount, mockAddNotification, mockState } = vi.hoisted(() => ({
  mockRefreshUnreadCount: vi.fn().mockResolvedValue(undefined),
  mockAddNotification: vi.fn(),
  mockState: {
    unreadCount: 0,
    notifications: [] as unknown[],
    loading: false,
    loaded: true,
    error: null,
  },
}))

vi.mock('@renderer/stores/notificationStore', () => ({
  useNotificationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      ...mockState,
      refreshUnreadCount: mockRefreshUnreadCount,
      addNotification: mockAddNotification,
      loadNotifications: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
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
  formatRelativeTime: () => '刚刚',
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

let notificationListener: ((notification: Record<string, unknown>) => void) | null = null

vi.mock('antd', () => ({
  Badge: ({ children, count }: { children: React.ReactNode; count: number; size?: string }) => (
    <span data-testid="badge" data-count={count}>
      {count > 0 && <span data-testid="badge-count">{count}</span>}
      {children}
    </span>
  ),
  Popover: ({
    children,
    content,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode
    content: React.ReactNode
    open: boolean
    onOpenChange: (v: boolean) => void
  }) => (
    <div>
      <div onClick={() => onOpenChange(!open)}>{children}</div>
      {open && <div data-testid="popover-content">{content}</div>}
    </div>
  ),
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Empty: Object.assign(({ description }: { description: string }) => <div>{description}</div>, {
    PRESENTED_IMAGE_SIMPLE: 'simple',
  }),
}))

vi.mock('@ant-design/icons', () => ({
  BellOutlined: () => <span data-testid="bell-icon">🔔</span>,
  WarningOutlined: () => <span>⚠</span>,
  MessageOutlined: () => <span>💬</span>,
  TeamOutlined: () => <span>👥</span>,
}))

// Mock window.api
vi.stubGlobal('api', {
  onNotificationNew: vi.fn((callback: (notification: Record<string, unknown>) => void) => {
    notificationListener = callback
    return () => {
      notificationListener = null
    }
  }),
})

import { NotificationBell } from '@renderer/modules/notification/components/NotificationBell'

describe('@story-4-4 NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.unreadCount = 0
    mockState.notifications = []
    mockState.loading = false
    mockState.loaded = true
    notificationListener = null
  })

  afterEach(() => {
    cleanup()
  })

  it('renders bell icon', () => {
    render(<NotificationBell />)
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument()
    expect(screen.getByTestId('bell-icon')).toBeInTheDocument()
  })

  it('refreshes unread count on mount', () => {
    render(<NotificationBell />)
    expect(mockRefreshUnreadCount).toHaveBeenCalledWith('user:default')
  })

  it('shows badge count when unread > 0', () => {
    mockState.unreadCount = 5
    render(<NotificationBell />)
    expect(screen.getByTestId('badge-count')).toHaveTextContent('5')
  })

  it('hides badge count when unread is 0', () => {
    mockState.unreadCount = 0
    render(<NotificationBell />)
    expect(screen.queryByTestId('badge-count')).not.toBeInTheDocument()
  })

  it('registers onNotificationNew listener', () => {
    render(<NotificationBell />)
    expect(window.api.onNotificationNew).toHaveBeenCalled()
    expect(notificationListener).not.toBeNull()
  })

  it('adds notification when targetUser matches current user', () => {
    render(<NotificationBell />)

    notificationListener?.({
      id: 'n-1',
      targetUser: 'user:default',
      type: 'decision-requested',
    })

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n-1', targetUser: 'user:default' })
    )
  })

  it('ignores notification when targetUser does not match current user', () => {
    render(<NotificationBell />)

    notificationListener?.({
      id: 'n-1',
      targetUser: 'user:zhang-zong',
      type: 'decision-requested',
    })

    expect(mockAddNotification).not.toHaveBeenCalled()
  })

  it('has aria-label with unread count', () => {
    mockState.unreadCount = 3
    render(<NotificationBell />)
    expect(screen.getByTestId('notification-bell')).toHaveAttribute('aria-label', '通知 (3 条未读)')
  })

  it('has clean aria-label when no unread', () => {
    mockState.unreadCount = 0
    render(<NotificationBell />)
    expect(screen.getByTestId('notification-bell')).toHaveAttribute('aria-label', '通知')
  })

  it('opens popover on bell click', () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByTestId('notification-bell'))
    expect(screen.getByTestId('popover-content')).toBeInTheDocument()
  })
})
