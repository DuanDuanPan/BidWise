import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'
import * as migration002 from '@main/db/migrations/002_add_industry'
import { ErrorCode } from '@shared/constants'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ApiResponse,
  ProjectRecord,
} from '@shared/ipc-types'

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
  '002_add_industry': migration002,
}

let testDb: Kysely<DB>

vi.mock('@main/db/client', () => ({
  getDb: () => testDb,
}))

// Mock ipcMain.handle to capture registered handlers
type HandlerFn = (event: unknown, ...args: unknown[]) => Promise<unknown>
const registeredHandlers = new Map<string, HandlerFn>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: HandlerFn) => {
      registeredHandlers.set(channel, handler)
    },
  },
  app: {
    getPath: () => '/tmp/bidwise-test',
  },
}))

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  existsSync: vi.fn(() => false),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

// Import AFTER mocks are set up
const { registerProjectHandlers } = await import('@main/ipc/project-handlers')
const { ProjectRepository } = await import('@main/db/repositories/project-repo')
const { DatabaseError } = await import('@main/utils/errors')

describe('IPC project handlers (integration)', () => {
  beforeEach(async () => {
    testDb = new Kysely<DB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    const migrator = new Migrator({
      db: testDb,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()

    registeredHandlers.clear()
    registerProjectHandlers()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  // Helper: invoke a registered handler by channel name
  async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const handler = registeredHandlers.get(channel)
    if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
    return (await handler({}, ...args)) as T
  }

  describe('handler registration', () => {
    it('should register all project IPC channels', () => {
      const expectedChannels = [
        IPC_CHANNELS.PROJECT_CREATE,
        IPC_CHANNELS.PROJECT_LIST,
        IPC_CHANNELS.PROJECT_GET,
        IPC_CHANNELS.PROJECT_UPDATE,
        IPC_CHANNELS.PROJECT_DELETE,
        IPC_CHANNELS.PROJECT_ARCHIVE,
      ]
      for (const channel of expectedChannels) {
        expect(registeredHandlers.has(channel), `missing handler for ${channel}`).toBe(true)
      }
    })

    it('should register handlers with correct channel name format (domain:action)', () => {
      for (const channel of registeredHandlers.keys()) {
        expect(channel).toMatch(/^project:\w+$/)
      }
    })
  })

  describe('full lifecycle through real handlers', () => {
    it('should create → get → list → update → archive → delete', async () => {
      // Create
      const createRes = await invoke<ApiResponse<ProjectRecord>>(IPC_CHANNELS.PROJECT_CREATE, {
        name: '集成测试项目',
        customerName: '客户X',
      } satisfies CreateProjectInput)
      expect(createRes.success).toBe(true)
      expect(createRes.success && createRes.data.name).toBe('集成测试项目')
      const projectId = createRes.success ? createRes.data.id : ''

      // Get
      const getRes = await invoke<ApiResponse<ProjectRecord>>(IPC_CHANNELS.PROJECT_GET, projectId)
      expect(getRes.success).toBe(true)
      expect(getRes.success && getRes.data.customerName).toBe('客户X')

      // List
      const listRes = await invoke<ApiResponse<ProjectRecord[]>>(IPC_CHANNELS.PROJECT_LIST)
      expect(listRes.success).toBe(true)
      expect(listRes.success && listRes.data.length).toBe(1)

      // Update
      const updateRes = await invoke<ApiResponse<ProjectRecord>>(IPC_CHANNELS.PROJECT_UPDATE, {
        projectId,
        input: { name: '更新后的项目' } satisfies UpdateProjectInput,
      })
      expect(updateRes.success).toBe(true)
      expect(updateRes.success && updateRes.data.name).toBe('更新后的项目')

      // Archive
      const archiveRes = await invoke<ApiResponse<ProjectRecord>>(
        IPC_CHANNELS.PROJECT_ARCHIVE,
        projectId
      )
      expect(archiveRes.success).toBe(true)
      expect(archiveRes.success && archiveRes.data.status).toBe('archived')

      // Delete
      const deleteRes = await invoke<ApiResponse<null>>(IPC_CHANNELS.PROJECT_DELETE, projectId)
      expect(deleteRes.success).toBe(true)
    })
  })

  describe('error responses through real handlers', () => {
    it('should return validation error for empty name', async () => {
      const res = await invoke<ApiResponse<ProjectRecord>>(IPC_CHANNELS.PROJECT_CREATE, {
        name: '',
      } satisfies CreateProjectInput)
      expect(res.success).toBe(false)
      expect(!res.success && res.error.code).toBe(ErrorCode.VALIDATION)
    })

    it('should return not-found error for non-existent project', async () => {
      const res = await invoke<ApiResponse<ProjectRecord>>(
        IPC_CHANNELS.PROJECT_GET,
        'non-existent-id'
      )
      expect(res.success).toBe(false)
      expect(!res.success && res.error.code).toBe(ErrorCode.NOT_FOUND)
    })

    it('should return unified error format with code and message', async () => {
      const res = await invoke<ApiResponse<null>>(IPC_CHANNELS.PROJECT_DELETE, 'non-existent-id')
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error).toHaveProperty('code')
        expect(res.error).toHaveProperty('message')
        expect(typeof res.error.code).toBe('string')
        expect(typeof res.error.message).toBe('string')
      }
    })

    it('should return DATABASE error when repository throws DatabaseError', async () => {
      // Destroy the DB connection so the next query triggers a real DatabaseError
      await testDb.destroy()
      const res = await invoke<ApiResponse<ProjectRecord[]>>(IPC_CHANNELS.PROJECT_LIST)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.DATABASE)
        expect(typeof res.error.message).toBe('string')
      }
    })

    it('should propagate DatabaseError via mock (regression)', async () => {
      const spy = vi
        .spyOn(ProjectRepository.prototype, 'findAll')
        .mockRejectedValueOnce(new DatabaseError('mock db error'))

      const res = await invoke<ApiResponse<ProjectRecord[]>>(IPC_CHANNELS.PROJECT_LIST)
      expect(res).toEqual({
        success: false,
        error: { code: ErrorCode.DATABASE, message: 'mock db error' },
      })

      spy.mockRestore()
    })

    it('should wrap all BidWiseError subclasses correctly', async () => {
      // Update non-existent → NOT_FOUND
      const updateRes = await invoke<ApiResponse<ProjectRecord>>(IPC_CHANNELS.PROJECT_UPDATE, {
        projectId: 'no-such-id',
        input: { name: 'x' },
      })
      expect(updateRes.success).toBe(false)
      expect(!updateRes.success && updateRes.error.code).toBe(ErrorCode.NOT_FOUND)

      // Archive non-existent → NOT_FOUND
      const archiveRes = await invoke<ApiResponse<ProjectRecord>>(
        IPC_CHANNELS.PROJECT_ARCHIVE,
        'no-such-id'
      )
      expect(archiveRes.success).toBe(false)
      expect(!archiveRes.success && archiveRes.error.code).toBe(ErrorCode.NOT_FOUND)
    })
  })
})
