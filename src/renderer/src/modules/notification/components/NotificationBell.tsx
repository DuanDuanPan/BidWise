import { useState, useEffect, useCallback } from 'react'
import { Badge, Popover } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useNotificationStore } from '@renderer/stores/notificationStore'
import { useUserStore } from '@renderer/stores/userStore'
import { NotificationPanel } from './NotificationPanel'

interface NotificationBellProps {
  onNotificationClick?: (notification: {
    projectId: string
    annotationId: string
    sectionId: string
    type: string
  }) => void
}

export function NotificationBell({
  onNotificationClick,
}: NotificationBellProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount)
  const addNotification = useNotificationStore((s) => s.addNotification)
  const currentUser = useUserStore((s) => s.currentUser)

  // Refresh unread count on mount
  useEffect(() => {
    void refreshUnreadCount(currentUser.id)
  }, [currentUser.id, refreshUnreadCount])

  // Listen for new notifications
  useEffect(() => {
    const unsubscribe = window.api.onNotificationNew((notification) => {
      if (notification.targetUser === currentUser.id) {
        addNotification(notification)
      }
    })
    return unsubscribe
  }, [currentUser.id, addNotification])

  const handleNotificationClick = useCallback(
    (notification: {
      projectId: string
      annotationId: string
      sectionId: string
      type: string
    }) => {
      setOpen(false)
      onNotificationClick?.(notification)
    },
    [onNotificationClick]
  )

  return (
    <Popover
      content={<NotificationPanel onNotificationClick={handleNotificationClick} />}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
      overlayStyle={{ width: 360 }}
      data-testid="notification-popover"
    >
      <button
        type="button"
        className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-2 transition-colors outline-none hover:bg-[var(--color-bg-global)]"
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 条未读)` : ''}`}
        data-testid="notification-bell"
      >
        <Badge count={unreadCount} size="small" offset={[4, -4]}>
          <BellOutlined style={{ fontSize: 16, color: 'var(--color-text-secondary)' }} />
        </Badge>
      </button>
    </Popover>
  )
}
