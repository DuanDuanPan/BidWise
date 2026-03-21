import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from 'antd'
import type { InputRef } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useCommandSearch } from './use-command-search'
import type { Command } from './types'
import { CATEGORY_ORDER, CATEGORY_LABELS } from './types'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<InputRef>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<Element | null>(null)

  // React-recommended render-time state adjustment: reset on open/close
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }

  // React-recommended render-time state adjustment: reset index on query change
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setSelectedIndex(0)
  }

  const results = useCommandSearch(commands, query)

  // Focus input when opening / capture & restore active element
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement
      requestAnimationFrame(() => {
        inputRef.current?.focus?.()
      })
    } else {
      const prev = previousActiveElement.current
      if (prev instanceof HTMLElement) {
        prev.focus()
      }
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('[data-command-item]')
    const selectedItem = items[selectedIndex]
    if (selectedItem && typeof selectedItem.scrollIntoView === 'function') {
      selectedItem.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const executeCommand = useCallback(
    (command: Command) => {
      onClose()
      command.action()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % results.length || 0)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length || 0)
          break
        case 'Enter':
          e.preventDefault()
          if (results[selectedIndex]) {
            executeCommand(results[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [results, selectedIndex, executeCommand, onClose]
  )

  if (!open) return null

  // Group results by category for display when no query
  const groupedResults = !query.trim() ? groupByCategory(results) : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/30"
        onClick={onClose}
        data-testid="command-palette-backdrop"
        style={{
          animation: 'var(--duration-micro, 150ms) ease-out fadeIn',
        }}
      />

      {/* Panel */}
      <div
        className="bg-bg-content fixed left-1/2 z-[1001] w-[560px] -translate-x-1/2 overflow-hidden rounded-xl"
        style={{
          top: '20%',
          boxShadow: 'var(--shadow-modal)',
          maxHeight: '60vh',
          animation: 'var(--duration-micro, 150ms) ease-out scaleIn',
        }}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="命令面板"
        data-testid="command-palette"
      >
        {/* Search input */}
        <div className="border-border flex items-center border-b px-4" style={{ height: 48 }}>
          <SearchOutlined className="text-text-tertiary mr-2" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索命令..."
            variant="borderless"
            className="flex-1"
            aria-label="搜索命令"
            data-testid="command-palette-input"
          />
          <kbd className="text-caption text-text-tertiary rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          className="overflow-auto"
          style={{ maxHeight: 'calc(60vh - 48px)' }}
          role="listbox"
          aria-label="命令列表"
          data-testid="command-palette-list"
        >
          {results.length === 0 ? (
            <div
              className="text-text-tertiary py-8 text-center text-sm"
              data-testid="command-palette-empty"
            >
              无匹配命令
            </div>
          ) : groupedResults ? (
            // Grouped display (no query)
            CATEGORY_ORDER.map((category) => {
              const items = groupedResults[category]
              if (!items || items.length === 0) return null
              return (
                <div key={category}>
                  <div className="text-caption text-text-tertiary px-4 pt-3 pb-1">
                    {CATEGORY_LABELS[category]}
                  </div>
                  {items.map((cmd) => {
                    const flatIndex = results.indexOf(cmd)
                    return (
                      <CommandItem
                        key={cmd.id}
                        command={cmd}
                        selected={flatIndex === selectedIndex}
                        onExecute={executeCommand}
                      />
                    )
                  })}
                </div>
              )
            })
          ) : (
            // Flat display (with query)
            results.map((cmd, index) => (
              <CommandItem
                key={cmd.id}
                command={cmd}
                selected={index === selectedIndex}
                onExecute={executeCommand}
              />
            ))
          )}
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: translateX(-50%) scale(0.95); }
          to { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="command-palette-backdrop"],
          [data-testid="command-palette"] {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}

function CommandItem({
  command,
  selected,
  onExecute,
}: {
  command: Command
  selected: boolean
  onExecute: (cmd: Command) => void
}): React.JSX.Element {
  return (
    <div
      data-command-item
      role="option"
      aria-selected={selected}
      aria-disabled={command.disabled}
      className={`flex cursor-pointer items-center gap-2 px-4 ${
        command.disabled ? 'text-text-tertiary cursor-default' : ''
      } ${selected ? 'bg-[var(--color-bg-hover)]' : ''}`}
      style={{ height: 40 }}
      onClick={() => onExecute(command)}
      data-testid={`command-item-${command.id}`}
    >
      {command.icon && (
        <span className="flex w-5 items-center justify-center text-sm">{command.icon}</span>
      )}
      <span className="flex-1 truncate text-sm">{command.label}</span>
      {command.badge && (
        <span className="text-text-tertiary text-caption rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5">
          {command.badge}
        </span>
      )}
      {command.shortcut && (
        <kbd className="text-text-tertiary text-caption rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5">
          {command.shortcut}
        </kbd>
      )}
    </div>
  )
}

function groupByCategory(commands: Command[]): Record<string, Command[]> {
  const grouped: Record<string, Command[]> = {}
  for (const cmd of commands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = []
    grouped[cmd.category].push(cmd)
  }
  return grouped
}
