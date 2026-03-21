import { useState, useCallback, useMemo, useRef, useEffect, useSyncExternalStore } from 'react'
import { App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@renderer/stores'
import { CommandPaletteContext } from './use-command-palette'
import { commandRegistry } from './command-registry'
import { createDefaultCommands, createProjectSwitchCommands } from './default-commands'
import { CommandPalette } from './CommandPalette'
import { useGlobalShortcuts } from './use-global-shortcuts'
import type { Command } from './types'

function readCommands(): Command[] {
  return commandRegistry.getCommands()
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const { message: messageApi } = App.useApp()

  // Register default commands during first render (React-approved init pattern)
  const defaultsRef = useRef<Command[] | null>(null)
  if (defaultsRef.current == null) {
    const defaults = createDefaultCommands(navigate, messageApi)
    defaultsRef.current = defaults
    commandRegistry.registerCommands(defaults)
  }

  useSyncExternalStore(
    commandRegistry.subscribe.bind(commandRegistry),
    commandRegistry.getVersion.bind(commandRegistry)
  )
  const commands = readCommands()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (defaultsRef.current) {
        for (const cmd of defaultsRef.current) {
          commandRegistry.unregisterCommand(cmd.id)
        }
      }
    }
  }, [])

  useEffect(() => {
    const projectCommands = createProjectSwitchCommands(projects, navigate)
    commandRegistry.registerCommands(projectCommands)

    return () => {
      for (const command of projectCommands) {
        commandRegistry.unregisterCommand(command.id)
      }
    }
  }, [projects, navigate])

  useGlobalShortcuts(setOpen, open, messageApi)

  const registerCommand = useCallback((command: Command) => {
    commandRegistry.registerCommand(command)
  }, [])

  const unregisterCommand = useCallback((id: string) => {
    commandRegistry.unregisterCommand(id)
  }, [])

  const contextValue = useMemo(
    () => ({ open, setOpen, registerCommand, unregisterCommand }),
    [open, registerCommand, unregisterCommand]
  )

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} />
    </CommandPaletteContext.Provider>
  )
}
