import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'fs'

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
      unlink: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  }
})

describe('mapping-store', () => {
  let mappingStore: typeof import('@main/services/ai-proxy/mapping-store')

  beforeEach(async () => {
    vi.resetModules()
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(fs.readFile).mockResolvedValue('{}')
    vi.mocked(fs.unlink).mockResolvedValue(undefined)
    mappingStore = await import('@main/services/ai-proxy/mapping-store')
  })

  it('save writes mapping to disk as JSON', async () => {
    const mapping = new Map([['{{COMPANY_1}}', '华为公司']])
    await mappingStore.save('test-id', mapping)

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test-id.json'),
      JSON.stringify({ '{{COMPANY_1}}': '华为公司' }),
      'utf8'
    )
  })

  it('load returns from memory if cached', async () => {
    const mapping = new Map([['{{PHONE_1}}', '13800138000']])
    await mappingStore.save('cached-id', mapping)
    vi.mocked(fs.readFile).mockClear()

    const loaded = await mappingStore.load('cached-id')
    expect(loaded.get('{{PHONE_1}}')).toBe('13800138000')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('load reads from disk when not in memory', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{"{{EMAIL_1}}":"test@example.com"}')
    const loaded = await mappingStore.load('disk-id')
    expect(loaded.get('{{EMAIL_1}}')).toBe('test@example.com')
  })

  it('remove deletes from memory and disk', async () => {
    const mapping = new Map([['{{AMOUNT_1}}', '¥100万']])
    await mappingStore.save('remove-id', mapping)

    await mappingStore.remove('remove-id')
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('remove-id.json'))
  })

  it('remove ignores ENOENT on disk', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' })
    vi.mocked(fs.unlink).mockRejectedValue(enoent)

    await expect(mappingStore.remove('nonexistent')).resolves.toBeUndefined()
  })

  it('remove rethrows non-ENOENT errors', async () => {
    const permErr = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    vi.mocked(fs.unlink).mockRejectedValue(permErr)

    await expect(mappingStore.remove('perm-fail')).rejects.toThrow('permission denied')
  })

  it('concurrent saves do not corrupt each other', async () => {
    vi.mocked(fs.writeFile).mockClear()
    const m1 = new Map([['{{A_1}}', 'val1']])
    const m2 = new Map([['{{B_1}}', 'val2']])

    await Promise.all([mappingStore.save('c1', m1), mappingStore.save('c2', m2)])

    expect(fs.writeFile).toHaveBeenCalledTimes(2)
  })
})
