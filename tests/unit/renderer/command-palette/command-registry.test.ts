import { describe, it, expect, beforeEach } from 'vitest'
import { commandRegistry } from '@renderer/shared/command-palette/command-registry'
import type { Command } from '@renderer/shared/command-palette/types'

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test-cmd',
    label: '测试命令',
    category: 'action',
    keywords: ['test'],
    action: () => {},
    ...overrides,
  }
}

describe('@story-1-9 command-registry', () => {
  beforeEach(() => {
    commandRegistry.clear()
  })

  it('@p0 registers and retrieves a command', () => {
    const cmd = makeCommand({ id: 'cmd-1' })
    commandRegistry.registerCommand(cmd)
    const result = commandRegistry.getCommands()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('cmd-1')
  })

  it('@p0 batch registers commands', () => {
    const cmds = [makeCommand({ id: 'cmd-1' }), makeCommand({ id: 'cmd-2' })]
    commandRegistry.registerCommands(cmds)
    expect(commandRegistry.getCommands()).toHaveLength(2)
  })

  it('@p0 unregisters a command', () => {
    commandRegistry.registerCommand(makeCommand({ id: 'cmd-1' }))
    commandRegistry.unregisterCommand('cmd-1')
    expect(commandRegistry.getCommands()).toHaveLength(0)
  })

  it('@p0 filters by when condition', () => {
    commandRegistry.registerCommand(makeCommand({ id: 'visible', when: () => true }))
    commandRegistry.registerCommand(makeCommand({ id: 'hidden', when: () => false }))
    const result = commandRegistry.getCommands()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('visible')
  })

  it('@p1 duplicate id overwrites previous command', () => {
    commandRegistry.registerCommand(makeCommand({ id: 'dup', label: 'First' }))
    commandRegistry.registerCommand(makeCommand({ id: 'dup', label: 'Second' }))
    const result = commandRegistry.getCommands()
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Second')
  })

  it('@p1 disabled commands are still returned by getCommands', () => {
    commandRegistry.registerCommand(makeCommand({ id: 'dis', disabled: true }))
    const result = commandRegistry.getCommands()
    expect(result).toHaveLength(1)
    expect(result[0].disabled).toBe(true)
  })

  it('@p1 getCommand returns specific command by id', () => {
    commandRegistry.registerCommand(makeCommand({ id: 'specific' }))
    expect(commandRegistry.getCommand('specific')).toBeDefined()
    expect(commandRegistry.getCommand('nonexistent')).toBeUndefined()
  })

  it('@p1 clear removes all commands', () => {
    commandRegistry.registerCommands([makeCommand({ id: 'a' }), makeCommand({ id: 'b' })])
    commandRegistry.clear()
    expect(commandRegistry.getCommands()).toHaveLength(0)
  })
})
