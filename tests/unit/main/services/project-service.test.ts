import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'
import { ProjectService } from '@main/services/project-service'
import { ValidationError, NotFoundError } from '@main/utils/errors'

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
}

let testDb: Kysely<DB>

vi.mock('@main/db/client', () => ({
  getDb: () => testDb,
}))

describe('ProjectService', () => {
  let service: ProjectService

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
    service = new ProjectService()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  describe('create', () => {
    it('should create a project with valid input', async () => {
      const project = await service.create({ name: '有效项目' })
      expect(project.name).toBe('有效项目')
    })

    it('should trim project name', async () => {
      const project = await service.create({ name: '  前后空格  ' })
      expect(project.name).toBe('前后空格')
    })

    it('should throw ValidationError for empty name', async () => {
      await expect(service.create({ name: '' })).rejects.toThrow(ValidationError)
    })

    it('should throw ValidationError for whitespace-only name', async () => {
      await expect(service.create({ name: '   ' })).rejects.toThrow(ValidationError)
    })

    it('should accept optional fields', async () => {
      const project = await service.create({
        name: '完整项目',
        customerName: '客户B',
        deadline: '2026-06-01T00:00:00.000Z',
        proposalType: 'presale-commercial',
        rootPath: '/tmp/proj',
      })
      expect(project.customerName).toBe('客户B')
      expect(project.deadline).toBe('2026-06-01T00:00:00.000Z')
      expect(project.proposalType).toBe('presale-commercial')
      expect(project.rootPath).toBe('/tmp/proj')
    })
  })

  describe('findById', () => {
    it('should throw ValidationError for empty id', async () => {
      await expect(service.findById('')).rejects.toThrow(ValidationError)
    })

    it('should throw NotFoundError for non-existent id', async () => {
      await expect(service.findById('no-such-id')).rejects.toThrow(NotFoundError)
    })

    it('should return project by id', async () => {
      const created = await service.create({ name: '查找测试' })
      const found = await service.findById(created.id)
      expect(found.name).toBe('查找测试')
    })
  })

  describe('findAll', () => {
    it('should return all projects', async () => {
      await service.create({ name: 'A' })
      await service.create({ name: 'B' })
      const all = await service.findAll()
      expect(all).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('should throw ValidationError for empty id', async () => {
      await expect(service.update('', { name: 'x' })).rejects.toThrow(ValidationError)
    })

    it('should throw ValidationError for empty name in update', async () => {
      const created = await service.create({ name: 'original' })
      await expect(service.update(created.id, { name: '  ' })).rejects.toThrow(ValidationError)
    })

    it('should update successfully', async () => {
      const created = await service.create({ name: 'before' })
      const updated = await service.update(created.id, { name: 'after' })
      expect(updated.name).toBe('after')
    })
  })

  describe('delete', () => {
    it('should throw ValidationError for empty id', async () => {
      await expect(service.delete('')).rejects.toThrow(ValidationError)
    })

    it('should delete project', async () => {
      const created = await service.create({ name: 'to-delete' })
      await service.delete(created.id)
      await expect(service.findById(created.id)).rejects.toThrow(NotFoundError)
    })
  })

  describe('archive', () => {
    it('should throw ValidationError for empty id', async () => {
      await expect(service.archive('')).rejects.toThrow(ValidationError)
    })

    it('should archive project', async () => {
      const created = await service.create({ name: 'to-archive' })
      const archived = await service.archive(created.id)
      expect(archived.status).toBe('archived')
    })
  })
})
