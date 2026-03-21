import type { Command } from './types'

class CommandRegistry {
  private commands = new Map<string, Command>()
  private listeners = new Set<() => void>()
  private version = 0

  private emit(): void {
    this.version += 1
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  registerCommand(command: Command): void {
    this.commands.set(command.id, command)
    this.emit()
  }

  registerCommands(commands: Command[]): void {
    for (const command of commands) {
      this.commands.set(command.id, command)
    }
    this.emit()
  }

  unregisterCommand(id: string): void {
    this.commands.delete(id)
    this.emit()
  }

  getCommands(): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => !cmd.when || cmd.when())
  }

  getVersion(): number {
    return this.version
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id)
  }

  clear(): void {
    this.commands.clear()
    this.emit()
  }
}

export const commandRegistry = new CommandRegistry()
