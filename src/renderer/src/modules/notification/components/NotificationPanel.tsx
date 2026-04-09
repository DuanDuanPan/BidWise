import { useEffect } from 'react'
import { Button, Empty } from 'antd'
import { WarningOutlined, MessageOutlined, TeamOutlined } from '@ant-design/icons'
import { formatRelativeTime } from '@renderer/shared/lib/format-time'
import { useNotificationStore } from '@renderer/stores/notificationStore'
import { useUserStore } from '@renderer/stores/userStore'
import {
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABELS,
} from '@renderer/modules/notification/constants/notification-icons'
import type { NotificationRecord, NotificationType } from '@shared/notification-types'

interface NotificationPanelProps {
  onNotificationClick?: (notification: {
    projectId: string
    annotationId: string
    sectionId: string
    type: string
  }) => void
}

function TypeIcon({ type }: { type: NotificationType }): React.JSX.Element {
  const config = NOTIFICATION_TYPE_ICONS[type]
  const iconStyle = { color: config.color, fontSize: 16 }

  switch (type) {
    case 'decision-requested':
      return <WarningOutlined style={iconStyle} />
    case 'reply-received':
      return <MessageOutlined style={iconStyle} />
    case 'cross-role-mention':
      return <TeamOutlined style={iconStyle} />
  }
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: NotificationRecord
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        backgroundColor: notification.read ? 'transparent' : '#F0F5FF',
        border: 'none',
        borderBottom: '1px solid #F0F0F0',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
      }}
      aria-label={`${NOTIFICATION_TYPE_LABELS[notification.type]} — ${notification.projectName}: ${notification.summary}${notification.read ? '' : ' (未读)'}`}
      data-testid="notification-item"
    >
      <div style={{ paddingTop: 2 }}>
        <TypeIcon type={notification.type} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: notification.read ? 400 : 600,
              color: '#1F1F1F',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notification.projectName}
          </span>
          <span style={{ fontSize: 11, color: '#8C8C8C', whiteSpace: 'nowrap', marginLeft: 8 }}>
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#595959',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {notification.summary}
        </div>
        {!notification.read && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#1677FF',
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        )}
      </div>
    </button>
  )
}

export function NotificationPanel({
  onNotificationClick,
}: NotificationPanelProps): React.JSX.Element {
  const notifications = useNotificationStore((s) => s.notifications)
  const loading = useNotificationStore((s) => s.loading)
  const loaded = useNotificationStore((s) => s.loaded)
  const loadNotifications = useNotificationStore((s) => s.loadNotifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const currentUser = useUserStore((s) => s.currentUser)

  useEffect(() => {
    if (!loaded) {
      void loadNotifications({ targetUser: currentUser.id })
    }
  }, [loaded, loadNotifications, currentUser.id])

  const handleClick = async (notification: NotificationRecord): Promise<void> => {
    if (!notification.read) {
      await markRead(notification.id)
    }
    onNotificationClick?.({
      projectId: notification.projectId,
      annotationId: notification.annotationId,
      sectionId: notification.sectionId,
      type: notification.type,
    })
  }

  return (
    <div style={{ maxHeight: 400 }} data-testid="notification-panel">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #F0F0F0',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>通知</span>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            onClick={() => void markAllRead(currentUser.id)}
            data-testid="mark-all-read-btn"
          >
            全部已读
          </Button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {loading && !loaded ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8C8C8C' }}>加载中...</div>
        ) : notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无通知"
            style={{ padding: '24px 0' }}
            data-testid="notification-empty"
          />
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClick={() => void handleClick(n)} />
          ))
        )}
      </div>
    </div>
  )
}
