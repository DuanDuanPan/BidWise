import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TerminologyEntry } from '@shared/terminology-types'

const mockList = vi.hoisted(() => vi.fn())
const mockFindById = vi.hoisted(() => vi.fn())
const mockFindByNormalizedSourceTerm = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockFindActive = vi.hoisted(() => vi.fn())

vi.mock('@main/db/repositories/terminology-repo', () => ({
  TerminologyRepository: class {
    list = mockList
    findById = mockFindById
    findByNormalizedSourceTerm = mockFindByNormalizedSourceTerm
    create = mockCreate
    update = mockUpdate
    delete = mockDelete
    findActive = mockFindActive
  },
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/mock-app',
    getPath: (name: string) => (name === 'userData' ? '/mock-userdata' : `/mock-${name}`),
  },
  dialog: { showSaveDialog: vi.fn() },
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

const { terminologyService } = await import('@main/services/terminology-service')

function makeEntry(overrides: Partial<TerminologyEntry> = {}): TerminologyEntry {
  return {
    id: 'entry-1',
    sourceTerm: '设备管理',
    targetTerm: '装备全寿命周期管理',
    normalizedSourceTerm: '设备管理',
    category: null,
    description: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('terminologyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create()', () => {
    it('normalizes sourceTerm and creates entry', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(null)
      mockCreate.mockResolvedValue(makeEntry())

      const result = await terminologyService.create({
        sourceTerm: '  设备管理  ',
        targetTerm: '装备全寿命周期管理',
      })

      expect(mockFindByNormalizedSourceTerm).toHaveBeenCalledWith('设备管理')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceTerm: '设备管理',
          targetTerm: '装备全寿命周期管理',
          normalizedSourceTerm: '设备管理',
        })
      )
      expect(result.sourceTerm).toBe('设备管理')
    })

    it('throws DUPLICATE error when normalized source term already exists', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(
        makeEntry({ targetTerm: '已有映射' })
      )

      await expect(
        terminologyService.create({
          sourceTerm: '设备管理',
          targetTerm: '新映射',
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE',
        message: expect.stringContaining('该术语已存在（已有映射：已有映射）'),
      })
    })
  })

  describe('update()', () => {
    it('checks conflict when sourceTerm changes', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(null)
      mockUpdate.mockResolvedValue(makeEntry({ sourceTerm: '新术语' }))

      await terminologyService.update({
        id: 'entry-1',
        sourceTerm: '新术语',
      })

      expect(mockFindByNormalizedSourceTerm).toHaveBeenCalledWith('新术语')
      expect(mockUpdate).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          sourceTerm: '新术语',
          normalizedSourceTerm: '新术语',
        })
      )
    })

    it('throws DUPLICATE when sourceTerm change conflicts with another entry', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(
        makeEntry({ id: 'entry-2', targetTerm: '冲突映射' })
      )

      await expect(
        terminologyService.update({
          id: 'entry-1',
          sourceTerm: '设备管理',
        })
      ).rejects.toMatchObject({ code: 'DUPLICATE' })
    })

    it('allows update when normalized source matches own entry', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(makeEntry({ id: 'entry-1' }))
      mockUpdate.mockResolvedValue(makeEntry())

      await terminologyService.update({
        id: 'entry-1',
        sourceTerm: '设备管理',
      })

      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  describe('batchCreate()', () => {
    it('creates entries and skips duplicates', async () => {
      // First entry: no existing
      mockFindByNormalizedSourceTerm.mockResolvedValueOnce(null)
      mockCreate.mockResolvedValueOnce(makeEntry())

      // Second entry: duplicate in DB
      mockFindByNormalizedSourceTerm.mockResolvedValueOnce(makeEntry({ id: 'existing' }))

      const result = await terminologyService.batchCreate([
        { sourceTerm: '新术语', targetTerm: '目标术语' },
        { sourceTerm: '设备管理', targetTerm: '其他映射' },
      ])

      expect(result.created).toBe(1)
      expect(result.duplicates).toEqual(['设备管理'])
    })

    it('deduplicates within the same batch', async () => {
      mockFindByNormalizedSourceTerm.mockResolvedValue(null)
      mockCreate.mockResolvedValue(makeEntry())

      const result = await terminologyService.batchCreate([
        { sourceTerm: '术语A', targetTerm: '目标A' },
        { sourceTerm: '术语A', targetTerm: '目标B' },
      ])

      expect(result.created).toBe(1)
      expect(result.duplicates).toEqual(['术语A'])
    })
  })

  describe('getActiveEntries()', () => {
    it('returns cached entries on subsequent calls', async () => {
      const entries = [makeEntry()]
      mockFindActive.mockResolvedValue(entries)

      const first = await terminologyService.getActiveEntries()
      const second = await terminologyService.getActiveEntries()

      expect(mockFindActive).toHaveBeenCalledTimes(1)
      expect(first).toBe(second)
    })

    it('cache is invalidated after create()', async () => {
      mockFindActive.mockResolvedValue([makeEntry()])
      mockFindByNormalizedSourceTerm.mockResolvedValue(null)
      mockCreate.mockResolvedValue(makeEntry())
      // Ensure clean cache by triggering invalidation
      mockDelete.mockResolvedValue(undefined)
      await terminologyService.delete('invalidate-cache')
      vi.clearAllMocks()

      mockFindActive.mockResolvedValue([makeEntry()])
      mockFindByNormalizedSourceTerm.mockResolvedValue(null)
      mockCreate.mockResolvedValue(makeEntry())

      await terminologyService.getActiveEntries()
      expect(mockFindActive).toHaveBeenCalledTimes(1)

      await terminologyService.create({ sourceTerm: '新术语', targetTerm: '新目标' })
      await terminologyService.getActiveEntries()

      expect(mockFindActive).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildExportData()', () => {
    it('exports all entries with correct structure', async () => {
      mockList.mockResolvedValue([
        makeEntry({ isActive: true }),
        makeEntry({ id: 'e2', sourceTerm: '系统', targetTerm: '平台', isActive: false }),
      ])

      const data = await terminologyService.buildExportData()

      expect(data.version).toBe('1.0')
      expect(data.exportedAt).toBeTruthy()
      expect(data.entries).toHaveLength(2)
      expect(data.entries[0]).toEqual({
        sourceTerm: '设备管理',
        targetTerm: '装备全寿命周期管理',
        category: null,
        description: null,
        isActive: true,
      })
      expect(data.entries[1].isActive).toBe(false)
    })
  })

  describe('exportToFile()', () => {
    it('returns cancelled when user cancels save dialog', async () => {
      mockList.mockResolvedValue([makeEntry()])
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: true,
        filePath: undefined as unknown as string,
      })

      const result = await terminologyService.exportToFile()

      expect(result.cancelled).toBe(true)
      expect(result.entryCount).toBe(1)
    })
  })
})
