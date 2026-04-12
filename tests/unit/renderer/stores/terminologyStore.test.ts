import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TerminologyEntry } from '@shared/terminology-types'

const mockTerminologyList = vi.fn()
const mockTerminologyCreate = vi.fn()
const mockTerminologyUpdate = vi.fn()
const mockTerminologyDelete = vi.fn()
const mockTerminologyBatchCreate = vi.fn()
const mockTerminologyExport = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    terminologyList: mockTerminologyList,
    terminologyCreate: mockTerminologyCreate,
    terminologyUpdate: mockTerminologyUpdate,
    terminologyDelete: mockTerminologyDelete,
    terminologyBatchCreate: mockTerminologyBatchCreate,
    terminologyExport: mockTerminologyExport,
  },
  writable: true,
})

function makeEntry(overrides: Partial<TerminologyEntry> = {}): TerminologyEntry {
  return {
    id: 'e1',
    sourceTerm: '设备管理',
    targetTerm: '装备全寿命周期管理',
    normalizedSourceTerm: '设备管理',
    category: '军工装备',
    description: '行业标准术语',
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

let useTerminologyStore: typeof import('@renderer/stores/terminologyStore').useTerminologyStore

describe('terminologyStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('@renderer/stores/terminologyStore')
    useTerminologyStore = mod.useTerminologyStore
  })

  describe('loadEntries', () => {
    it('calls terminologyList with current filter state and sets entries on success', async () => {
      const entries = [makeEntry()]
      mockTerminologyList.mockResolvedValue({ success: true, data: entries })

      await useTerminologyStore.getState().loadEntries()

      expect(mockTerminologyList).toHaveBeenCalledWith({ isActive: true })
      expect(useTerminologyStore.getState().entries).toEqual(entries)
      expect(useTerminologyStore.getState().loading).toBe(false)
      expect(useTerminologyStore.getState().error).toBeNull()
    })

    it('calls terminologyList with searchQuery and categoryFilter when set', async () => {
      mockTerminologyList.mockResolvedValue({ success: true, data: [] })

      useTerminologyStore.getState().setSearchQuery('设备')
      useTerminologyStore.getState().setCategoryFilter('军工装备')
      await useTerminologyStore.getState().loadEntries()

      expect(mockTerminologyList).toHaveBeenCalledWith({
        searchQuery: '设备',
        category: '军工装备',
        isActive: true,
      })
    })

    it('sets error on failure response', async () => {
      mockTerminologyList.mockResolvedValue({
        success: false,
        error: { code: 'LOAD_FAILED', message: '加载术语失败' },
      })

      await useTerminologyStore.getState().loadEntries()

      expect(useTerminologyStore.getState().error).toBe('加载术语失败')
      expect(useTerminologyStore.getState().loading).toBe(false)
      expect(useTerminologyStore.getState().entries).toEqual([])
    })
  })

  describe('createEntry', () => {
    it('calls terminologyCreate and reloads entries on success', async () => {
      const input = { sourceTerm: '系统', targetTerm: '信息化平台' }
      mockTerminologyCreate.mockResolvedValue({
        success: true,
        data: makeEntry({ id: 'e2', ...input }),
      })
      mockTerminologyList.mockResolvedValue({ success: true, data: [makeEntry()] })

      await useTerminologyStore.getState().createEntry(input)

      expect(mockTerminologyCreate).toHaveBeenCalledWith(input)
      expect(mockTerminologyList).toHaveBeenCalled()
    })

    it('sets error and throws on duplicate error', async () => {
      mockTerminologyCreate.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE', message: '该术语已存在' },
      })

      await expect(
        useTerminologyStore.getState().createEntry({ sourceTerm: '设备管理', targetTerm: '目标' })
      ).rejects.toThrow('该术语已存在')

      expect(useTerminologyStore.getState().error).toBe('该术语已存在')
    })
  })

  describe('updateEntry', () => {
    it('calls terminologyUpdate and reloads entries on success', async () => {
      const input = { id: 'e1', targetTerm: '新目标术语' }
      mockTerminologyUpdate.mockResolvedValue({
        success: true,
        data: makeEntry({ targetTerm: '新目标术语' }),
      })
      mockTerminologyList.mockResolvedValue({
        success: true,
        data: [makeEntry({ targetTerm: '新目标术语' })],
      })

      await useTerminologyStore.getState().updateEntry(input)

      expect(mockTerminologyUpdate).toHaveBeenCalledWith(input)
      expect(mockTerminologyList).toHaveBeenCalled()
    })
  })

  describe('deleteEntry', () => {
    it('calls terminologyDelete and reloads entries on success', async () => {
      mockTerminologyDelete.mockResolvedValue({ success: true, data: null })
      mockTerminologyList.mockResolvedValue({ success: true, data: [] })

      await useTerminologyStore.getState().deleteEntry('e1')

      expect(mockTerminologyDelete).toHaveBeenCalledWith({ id: 'e1' })
      expect(mockTerminologyList).toHaveBeenCalled()
    })
  })

  describe('batchCreate', () => {
    it('calls terminologyBatchCreate, reloads entries, and returns result', async () => {
      const batchResult = { created: 3, duplicates: ['设备管理'] }
      mockTerminologyBatchCreate.mockResolvedValue({ success: true, data: batchResult })
      mockTerminologyList.mockResolvedValue({ success: true, data: [] })

      const input = {
        entries: [
          { sourceTerm: 'A', targetTerm: 'B' },
          { sourceTerm: 'C', targetTerm: 'D' },
        ],
      }
      const result = await useTerminologyStore.getState().batchCreate(input)

      expect(mockTerminologyBatchCreate).toHaveBeenCalledWith(input)
      expect(mockTerminologyList).toHaveBeenCalled()
      expect(result).toEqual(batchResult)
    })
  })

  describe('exportJson', () => {
    it('calls terminologyExport and returns result on success', async () => {
      const exportOutput = { cancelled: false, outputPath: '/tmp/terms.json', entryCount: 5 }
      mockTerminologyExport.mockResolvedValue({ success: true, data: exportOutput })

      const result = await useTerminologyStore.getState().exportJson()

      expect(mockTerminologyExport).toHaveBeenCalled()
      expect(result).toEqual(exportOutput)
    })

    it('returns null and sets error on failure', async () => {
      mockTerminologyExport.mockResolvedValue({
        success: false,
        error: { code: 'EXPORT_FAILED', message: '导出失败' },
      })

      const result = await useTerminologyStore.getState().exportJson()

      expect(result).toBeNull()
      expect(useTerminologyStore.getState().error).toBe('导出失败')
    })
  })

  describe('setSearchQuery / setCategoryFilter / setActiveOnly', () => {
    it('setSearchQuery updates searchQuery state', () => {
      useTerminologyStore.getState().setSearchQuery('测试查询')
      expect(useTerminologyStore.getState().searchQuery).toBe('测试查询')
    })

    it('setCategoryFilter updates categoryFilter state', () => {
      useTerminologyStore.getState().setCategoryFilter('信息化')
      expect(useTerminologyStore.getState().categoryFilter).toBe('信息化')
    })

    it('setCategoryFilter can be set to null', () => {
      useTerminologyStore.getState().setCategoryFilter('信息化')
      useTerminologyStore.getState().setCategoryFilter(null)
      expect(useTerminologyStore.getState().categoryFilter).toBeNull()
    })

    it('setActiveOnly updates activeOnly state', () => {
      expect(useTerminologyStore.getState().activeOnly).toBe(true)
      useTerminologyStore.getState().setActiveOnly(false)
      expect(useTerminologyStore.getState().activeOnly).toBe(false)
    })
  })

  describe('clearError', () => {
    it('resets error to null', async () => {
      mockTerminologyList.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: '错误' },
      })
      await useTerminologyStore.getState().loadEntries()
      expect(useTerminologyStore.getState().error).toBe('错误')

      useTerminologyStore.getState().clearError()
      expect(useTerminologyStore.getState().error).toBeNull()
    })
  })

  describe('loading state management', () => {
    it('loading is true during loadEntries and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockTerminologyList.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const promise = useTerminologyStore.getState().loadEntries()
      expect(useTerminologyStore.getState().loading).toBe(true)

      resolvePromise!({ success: true, data: [] })
      await promise

      expect(useTerminologyStore.getState().loading).toBe(false)
    })

    it('loading is true during batchCreate and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockTerminologyBatchCreate.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )
      mockTerminologyList.mockResolvedValue({ success: true, data: [] })

      const promise = useTerminologyStore.getState().batchCreate({ entries: [] })
      expect(useTerminologyStore.getState().loading).toBe(true)

      resolvePromise!({ success: true, data: { created: 0, duplicates: [] } })
      await promise

      expect(useTerminologyStore.getState().loading).toBe(false)
    })
  })
})
