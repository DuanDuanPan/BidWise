import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommandSearch } from '@renderer/shared/command-palette/use-command-search'
import type { Command } from '@renderer/shared/command-palette/types'

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test',
    label: '测试',
    category: 'action',
    keywords: ['test'],
    action: () => {},
    ...overrides,
  }
}

const testCommands: Command[] = [
  makeCommand({
    id: 'nav-1',
    label: '需求分析',
    category: 'navigation',
    keywords: ['需求', 'analysis'],
  }),
  makeCommand({
    id: 'nav-2',
    label: '方案设计',
    category: 'navigation',
    keywords: ['方案', 'design'],
  }),
  makeCommand({
    id: 'proj-1',
    label: '测试项目',
    category: 'project',
    keywords: ['项目', 'project'],
  }),
  makeCommand({ id: 'act-1', label: '导出文档', category: 'action', keywords: ['导出', 'export'] }),
]

describe('@story-1-9 use-command-search', () => {
  it('@p0 returns all commands when query is empty', () => {
    const { result } = renderHook(() => useCommandSearch(testCommands, ''))
    expect(result.current).toHaveLength(4)
  })

  it('@p0 fuzzy matches label text', () => {
    const { result } = renderHook(() => useCommandSearch(testCommands, '需求'))
    expect(result.current.length).toBeGreaterThanOrEqual(1)
    expect(result.current[0].id).toBe('nav-1')
  })

  it('@p0 fuzzy matches keywords', () => {
    const { result } = renderHook(() => useCommandSearch(testCommands, 'export'))
    expect(result.current.length).toBeGreaterThanOrEqual(1)
    expect(result.current[0].id).toBe('act-1')
  })

  it('@p1 returns empty array for non-matching query', () => {
    const { result } = renderHook(() => useCommandSearch(testCommands, 'zzzzzzzzz'))
    expect(result.current).toHaveLength(0)
  })

  it('@p1 empty query sorts by category order (navigation first)', () => {
    const { result } = renderHook(() => useCommandSearch(testCommands, ''))
    // navigation commands should come before project/action
    expect(result.current[0].category).toBe('navigation')
  })

  it('@p1 limits results to 20 max', () => {
    const manyCommands = Array.from({ length: 30 }, (_, i) =>
      makeCommand({ id: `cmd-${i}`, label: `命令${i}`, keywords: ['命令'] })
    )
    const { result } = renderHook(() => useCommandSearch(manyCommands, '命令'))
    expect(result.current.length).toBeLessThanOrEqual(20)
  })
})
