import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'

const mockProjectService = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  archive: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('@main/services/project-service', () => ({
  projectService: mockProjectService,
}))

import { registerProjectHandlers } from '@main/ipc/project-handlers'

describe('registerProjectHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 6 project IPC channels', () => {
    registerProjectHandlers()

    const registeredChannels = (ipcMain.handle as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toEqual([
      'project:create',
      'project:list',
      'project:get',
      'project:update',
      'project:delete',
      'project:archive',
    ])
  })

  it('dispatches project:create to projectService.create', async () => {
    const mockResult = { id: '1', name: 'Test', createdAt: '', updatedAt: '' }
    mockProjectService.create.mockResolvedValue(mockResult)

    registerProjectHandlers()

    const createCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:create'
    )?.[1]

    const input = { name: 'Test', rootPath: '/tmp' }
    const result = await createCallback({}, input)

    expect(mockProjectService.create).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches project:list to projectService.list', async () => {
    const mockResult = [{ id: '1', name: 'Test', updatedAt: '' }]
    mockProjectService.list.mockResolvedValue(mockResult)

    registerProjectHandlers()

    const listCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:list'
    )?.[1]

    const result = await listCallback({})

    expect(mockProjectService.list).toHaveBeenCalled()
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches project:get to projectService.get', async () => {
    const mockResult = { id: '1', name: 'Test', createdAt: '', updatedAt: '' }
    mockProjectService.get.mockResolvedValue(mockResult)

    registerProjectHandlers()

    const getCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:get'
    )?.[1]

    const result = await getCallback({}, '1')

    expect(mockProjectService.get).toHaveBeenCalledWith('1')
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches project:update to projectService.update with destructured args', async () => {
    const mockResult = { id: '1', name: 'Updated', createdAt: '', updatedAt: '' }
    mockProjectService.update.mockResolvedValue(mockResult)

    registerProjectHandlers()

    const updateCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:update'
    )?.[1]

    const input = { projectId: '1', input: { name: 'Updated' } }
    const result = await updateCallback({}, input)

    expect(mockProjectService.update).toHaveBeenCalledWith('1', { name: 'Updated' })
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches project:delete to projectService.delete', async () => {
    mockProjectService.delete.mockResolvedValue(undefined)

    registerProjectHandlers()

    const deleteCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:delete'
    )?.[1]

    const result = await deleteCallback({}, '1')

    expect(mockProjectService.delete).toHaveBeenCalledWith('1')
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('dispatches project:archive to projectService.archive', async () => {
    mockProjectService.archive.mockResolvedValue(undefined)

    registerProjectHandlers()

    const archiveCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:archive'
    )?.[1]

    const result = await archiveCallback({}, '1')

    expect(mockProjectService.archive).toHaveBeenCalledWith('1')
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('wraps service errors in error response format', async () => {
    const { NotFoundError } = await import('@main/utils/errors')
    mockProjectService.get.mockRejectedValue(new NotFoundError('Not found'))

    registerProjectHandlers()

    const getCallback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'project:get'
    )?.[1]

    const result = await getCallback({}, 'non-existent')

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    })
  })
})
