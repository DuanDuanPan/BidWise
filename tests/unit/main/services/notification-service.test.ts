import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AnnotationRecord } from '@shared/annotation-types'
import type { NotificationRecord } from '@shared/notification-types'

const mocks = vi.hoisted(() => ({
  repoCreate: vi.fn(),
  repoListByUser: vi.fn(),
  repoMarkRead: vi.fn(),
  repoMarkAllRead: vi.fn(),
  repoCountUnread: vi.fn(),
  getAllWindows: vi.fn(),
}))

vi.mock('@main/db/repositories/notification-repo', () => ({
  NotificationRepository: class {
    create = mocks.repoCreate
    listByUser = mocks.repoListByUser
    markRead = mocks.repoMarkRead
    markAllRead = mocks.repoMarkAllRead
    countUnread = mocks.repoCountUnread
  },
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mocks.getAllWindows(),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

import { notificationService } from '@main/services/notification-service'

const makeAnnotation = (overrides: Partial<AnnotationRecord> = {}): AnnotationRecord => ({
  id: 'ann-1',
  projectId: 'proj-1',
  sectionId: 'section-1',
  type: 'human',
  content: 'Test annotation',
  author: 'user:default',
  status: 'needs-decision',
  parentId: null,
  assignee: 'user:zhang-zong',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

const makeNotification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'notif-1',
  projectId: 'proj-1',
  projectName: 'Test Project',
  sectionId: 'section-1',
  annotationId: 'ann-1',
  targetUser: 'user:zhang-zong',
  type: 'decision-requested',
  title: '请求指导',
  summary: 'Test summary',
  read: false,
  createdAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('notificationService', () => {
  const mockWebContentsSend = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAllWindows.mockReturnValue([{ webContents: { send: mockWebContentsSend } }])
  })

  describe('notifyDecisionRequested', () => {
    it('creates notification and broadcasts when assignee differs from author', async () => {
      const notification = makeNotification()
      mocks.repoCreate.mockResolvedValue(notification)

      const result = await notificationService.notifyDecisionRequested({
        annotation: makeAnnotation(),
        projectName: 'Test Project',
      })

      expect(result).toEqual(notification)
      expect(mocks.repoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'decision-requested',
          targetUser: 'user:zhang-zong',
        })
      )
      expect(mockWebContentsSend).toHaveBeenCalledWith('notification:new', notification)
    })

    it('suppresses self-notification when assignee === author', async () => {
      const result = await notificationService.notifyDecisionRequested({
        annotation: makeAnnotation({ author: 'user:zhang-zong', assignee: 'user:zhang-zong' }),
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
      expect(mocks.repoCreate).not.toHaveBeenCalled()
    })

    it('returns null when assignee is missing', async () => {
      const result = await notificationService.notifyDecisionRequested({
        annotation: makeAnnotation({ assignee: null }),
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
      expect(mocks.repoCreate).not.toHaveBeenCalled()
    })
  })

  describe('notifyCrossRole', () => {
    it('creates cross-role notification', async () => {
      const notification = makeNotification({ type: 'cross-role-mention' })
      mocks.repoCreate.mockResolvedValue(notification)

      const result = await notificationService.notifyCrossRole({
        annotation: makeAnnotation({ type: 'cross-role' }),
        projectName: 'Test Project',
      })

      expect(result).toEqual(notification)
      expect(mocks.repoCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cross-role-mention' })
      )
    })

    it('suppresses self-notification', async () => {
      const result = await notificationService.notifyCrossRole({
        annotation: makeAnnotation({
          type: 'cross-role',
          author: 'user:zhang-zong',
          assignee: 'user:zhang-zong',
        }),
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
    })
  })

  describe('notifyReplyReceived', () => {
    it('creates reply notification when reply author differs from parent author', async () => {
      const notification = makeNotification({ type: 'reply-received' })
      mocks.repoCreate.mockResolvedValue(notification)

      const parent = makeAnnotation({ id: 'parent-1', author: 'user:default' })
      const reply = makeAnnotation({
        id: 'reply-1',
        author: 'user:zhang-zong',
        parentId: 'parent-1',
      })

      const result = await notificationService.notifyReplyReceived({
        parentAnnotation: parent,
        reply,
        projectName: 'Test Project',
      })

      expect(result).toEqual(notification)
      expect(mocks.repoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reply-received',
          targetUser: 'user:default',
          annotationId: 'parent-1',
        })
      )
    })

    it('suppresses notification when reply author === parent author', async () => {
      const parent = makeAnnotation({ author: 'user:default' })
      const reply = makeAnnotation({ author: 'user:default', parentId: 'ann-1' })

      const result = await notificationService.notifyReplyReceived({
        parentAnnotation: parent,
        reply,
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
      expect(mocks.repoCreate).not.toHaveBeenCalled()
    })

    it('suppresses notification when parent author is agent', async () => {
      const parent = makeAnnotation({ author: 'agent:generate' })
      const reply = makeAnnotation({ author: 'user:default', parentId: 'ann-1' })

      const result = await notificationService.notifyReplyReceived({
        parentAnnotation: parent,
        reply,
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
    })

    it('suppresses notification when parent author is system', async () => {
      const parent = makeAnnotation({ author: 'system:scoring' })
      const reply = makeAnnotation({ author: 'user:default', parentId: 'ann-1' })

      const result = await notificationService.notifyReplyReceived({
        parentAnnotation: parent,
        reply,
        projectName: 'Test Project',
      })

      expect(result).toBeNull()
    })

    it('uses root annotation id when parent has a parentId', async () => {
      const notification = makeNotification({ type: 'reply-received' })
      mocks.repoCreate.mockResolvedValue(notification)

      const parent = makeAnnotation({ id: 'child-1', parentId: 'root-1', author: 'user:default' })
      const reply = makeAnnotation({ author: 'user:zhang-zong', parentId: 'child-1' })

      await notificationService.notifyReplyReceived({
        parentAnnotation: parent,
        reply,
        projectName: 'Test Project',
      })

      expect(mocks.repoCreate).toHaveBeenCalledWith(
        expect.objectContaining({ annotationId: 'root-1' })
      )
    })
  })

  describe('list', () => {
    it('delegates to repo.listByUser', async () => {
      const notifications = [makeNotification()]
      mocks.repoListByUser.mockResolvedValue(notifications)

      const result = await notificationService.list('user:zhang-zong')

      expect(result).toEqual(notifications)
      expect(mocks.repoListByUser).toHaveBeenCalledWith('user:zhang-zong', undefined)
    })
  })

  describe('markRead', () => {
    it('delegates to repo.markRead', async () => {
      const notification = makeNotification({ read: true })
      mocks.repoMarkRead.mockResolvedValue(notification)

      const result = await notificationService.markRead('notif-1')

      expect(result.read).toBe(true)
    })
  })

  describe('markAllRead', () => {
    it('delegates to repo.markAllRead', async () => {
      mocks.repoMarkAllRead.mockResolvedValue(undefined)

      await notificationService.markAllRead('user:zhang-zong')

      expect(mocks.repoMarkAllRead).toHaveBeenCalledWith('user:zhang-zong')
    })
  })

  describe('countUnread', () => {
    it('delegates to repo.countUnread', async () => {
      mocks.repoCountUnread.mockResolvedValue(3)

      const result = await notificationService.countUnread('user:zhang-zong')

      expect(result).toBe(3)
    })
  })
})
