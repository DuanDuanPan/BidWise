import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'
import * as migration002 from '@main/db/migrations/002_add_industry'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { NotFoundError } from '@main/utils/errors'

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
  '002_add_industry': migration002,
}

// Mock getDb to use test DB
let testDb: Kysely<DB>

vi.mock('@main/db/client', () => ({
  getDb: () => testDb,
}))

describe('ProjectRepository', () => {
  let repo: ProjectRepository

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
    repo = new ProjectRepository()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  describe('create', () => {
    it('should create a project with default values', async () => {
      const project = await repo.create({ name: '测试项目' })

      expect(project.id).toBeDefined()
      expect(project.id.length).toBeGreaterThan(0)
      expect(project.name).toBe('测试项目')
      expect(project.customerName).toBeNull()
      expect(project.deadline).toBeNull()
      expect(project.proposalType).toBe('presale-technical')
      expect(project.sopStage).toBe('not-started')
      expect(project.status).toBe('active')
      expect(project.rootPath).toBeNull()
      expect(project.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(project.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should create a project with all fields', async () => {
      const project = await repo.create({
        name: '完整项目',
        customerName: '客户A',
        deadline: '2026-04-01T00:00:00.000Z',
        proposalType: 'presale-commercial',
        rootPath: '/tmp/project-1',
      })

      expect(project.name).toBe('完整项目')
      expect(project.customerName).toBe('客户A')
      expect(project.deadline).toBe('2026-04-01T00:00:00.000Z')
      expect(project.proposalType).toBe('presale-commercial')
      expect(project.rootPath).toBe('/tmp/project-1')
    })

    it('should persist to database', async () => {
      const created = await repo.create({ name: '持久化测试' })
      const fetched = await repo.findById(created.id)

      expect(fetched.name).toBe('持久化测试')
      expect(fetched.id).toBe(created.id)
    })
  })

  describe('findById', () => {
    it('should find existing project', async () => {
      const created = await repo.create({ name: '查找测试' })
      const found = await repo.findById(created.id)

      expect(found.name).toBe('查找测试')
    })

    it('should throw NotFoundError for non-existent ID', async () => {
      await expect(repo.findById('non-existent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('findAll', () => {
    it('should return empty array when no projects', async () => {
      const all = await repo.findAll()
      expect(all).toEqual([])
    })

    it('should return all projects', async () => {
      await repo.create({ name: '项目A' })
      await repo.create({ name: '项目B' })
      await repo.create({ name: '项目C' })

      const all = await repo.findAll()
      expect(all).toHaveLength(3)
      const names = all.map((p) => p.name)
      expect(names).toContain('项目A')
      expect(names).toContain('项目B')
      expect(names).toContain('项目C')
    })
  })

  describe('update', () => {
    it('should update project fields', async () => {
      const created = await repo.create({ name: '更新前' })
      const updated = await repo.update(created.id, { name: '更新后' })

      expect(updated.name).toBe('更新后')
      expect(updated.id).toBe(created.id)
      // updatedAt is refreshed (may be same ms in fast test, so just check it exists)
      expect(updated.updatedAt).toBeDefined()
    })

    it('should update partial fields', async () => {
      const created = await repo.create({ name: '项目', customerName: '客户' })
      const updated = await repo.update(created.id, { customerName: '新客户' })

      expect(updated.name).toBe('项目') // unchanged
      expect(updated.customerName).toBe('新客户')
    })

    it('should throw NotFoundError for non-existent project', async () => {
      await expect(repo.update('non-existent', { name: 'test' })).rejects.toThrow(NotFoundError)
    })
  })

  describe('delete', () => {
    it('should delete existing project', async () => {
      const created = await repo.create({ name: '删除测试' })
      await repo.delete(created.id)

      await expect(repo.findById(created.id)).rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError for non-existent project', async () => {
      await expect(repo.delete('non-existent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('archive', () => {
    it('should set status to archived', async () => {
      const created = await repo.create({ name: '归档测试' })
      const archived = await repo.archive(created.id)

      expect(archived.status).toBe('archived')
      expect(archived.id).toBe(created.id)
    })

    it('should throw NotFoundError for non-existent project', async () => {
      await expect(repo.archive('non-existent')).rejects.toThrow(NotFoundError)
    })
  })
})
