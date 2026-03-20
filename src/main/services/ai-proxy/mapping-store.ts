/**
 * Desensitization mapping persistence — runtime memory + disk JSON.
 * Directory created by ensureDataDirectories() at startup.
 */
import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

type MappingTable = Map<string, string>

/** In-memory cache keyed by mappingId */
const memoryStore = new Map<string, MappingTable>()

function getFilePath(mappingId: string): string {
  return join(app.getPath('userData'), 'data', 'desensitize-mappings', `${mappingId}.json`)
}

export async function save(mappingId: string, mapping: MappingTable): Promise<void> {
  memoryStore.set(mappingId, mapping)
  const obj = Object.fromEntries(mapping)
  await fs.writeFile(getFilePath(mappingId), JSON.stringify(obj), 'utf8')
}

export async function load(mappingId: string): Promise<MappingTable> {
  const cached = memoryStore.get(mappingId)
  if (cached) return cached

  const raw = await fs.readFile(getFilePath(mappingId), 'utf8')
  const obj = JSON.parse(raw) as Record<string, string>
  const mapping = new Map(Object.entries(obj))
  memoryStore.set(mappingId, mapping)
  return mapping
}

export async function remove(mappingId: string): Promise<void> {
  memoryStore.delete(mappingId)
  try {
    await fs.unlink(getFilePath(mappingId))
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code !== 'ENOENT') throw err
  }
}
