import { createContext, useContext } from 'react'
import type { Command } from './types'

export interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  registerCommand: (command: Command) => void
  unregisterCommand: (id: string) => void
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  }
  return ctx
}
