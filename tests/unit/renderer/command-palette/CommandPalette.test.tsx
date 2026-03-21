import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { CommandPalette } from '@renderer/shared/command-palette/CommandPalette'
import type { Command } from '@renderer/shared/command-palette/types'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test-cmd',
    label: '测试命令',
    category: 'action',
    keywords: ['test'],
    action: vi.fn(),
    ...overrides,
  }
}

const sampleCommands: Command[] = [
  makeCommand({ id: 'cmd-1', label: '需求分析', category: 'navigation', keywords: ['需求'] }),
  makeCommand({
    id: 'cmd-2',
    label: '导出文档',
    category: 'action',
    keywords: ['导出'],
    shortcut: '⌘E',
  }),
  makeCommand({
    id: 'cmd-disabled',
    label: '对抗评审',
    category: 'action',
    keywords: ['对抗'],
    disabled: true,
    badge: '需要 Epic 5',
  }),
]

describe('@story-1-9 CommandPalette', () => {
  afterEach(cleanup)

  it('@p0 renders search input and command list when open', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(screen.getByTestId('command-palette-input')).toBeInTheDocument()
    expect(screen.getByTestId('command-palette-list')).toBeInTheDocument()
  })

  it('@p0 does not render when closed', () => {
    render(
      <Wrapper>
        <CommandPalette open={false} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
  })

  it('@p0 keyboard ArrowDown moves selection', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    const palette = screen.getByTestId('command-palette')
    fireEvent.keyDown(palette, { key: 'ArrowDown' })
    const items = screen.getAllByRole('option')
    expect(items[1].getAttribute('aria-selected')).toBe('true')
  })

  it('@p0 keyboard ArrowUp moves selection', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    const palette = screen.getByTestId('command-palette')
    // ArrowUp from 0 should wrap to last item
    fireEvent.keyDown(palette, { key: 'ArrowUp' })
    const items = screen.getAllByRole('option')
    expect(items[items.length - 1].getAttribute('aria-selected')).toBe('true')
  })

  it('@p0 Enter executes selected command and closes', () => {
    const onClose = vi.fn()
    const action = vi.fn()
    const cmds = [makeCommand({ id: 'exec', label: '执行', action })]
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={cmds} />
      </Wrapper>
    )
    const palette = screen.getByTestId('command-palette')
    fireEvent.keyDown(palette, { key: 'Enter' })
    expect(action).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('@p0 Escape closes the palette', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={sampleCommands} />
      </Wrapper>
    )
    const palette = screen.getByTestId('command-palette')
    fireEvent.keyDown(palette, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('@p0 clicking a command item executes and closes', () => {
    const onClose = vi.fn()
    const action = vi.fn()
    const cmds = [makeCommand({ id: 'click-cmd', label: '点击命令', action })]
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={cmds} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('command-item-click-cmd'))
    expect(action).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('@p0 search filters the command list', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    const input = screen.getByTestId('command-palette-input')
    fireEvent.change(input, { target: { value: '需求' } })
    const items = screen.getAllByRole('option')
    expect(items.length).toBeGreaterThanOrEqual(1)
  })

  it('@p0 shows empty state for non-matching search', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    const input = screen.getByTestId('command-palette-input')
    fireEvent.change(input, { target: { value: 'zzzzzzzzz' } })
    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument()
  })

  it('@p0 disabled command shows badge and executes placeholder action', () => {
    const onClose = vi.fn()
    const disabledAction = vi.fn()
    const cmds = [
      ...sampleCommands.filter((c) => c.id !== 'cmd-disabled'),
      makeCommand({
        id: 'cmd-disabled',
        label: '对抗评审',
        category: 'action',
        keywords: ['对抗'],
        disabled: true,
        badge: '需要 Epic 5',
        action: disabledAction,
      }),
    ]
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={cmds} />
      </Wrapper>
    )
    const disabledItem = screen.getByTestId('command-item-cmd-disabled')
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(disabledItem.textContent).toContain('需要 Epic 5')
    // Clicking disabled command should still execute its placeholder action
    fireEvent.click(disabledItem)
    expect(disabledAction).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('@p0 disabled command executes placeholder action via Enter', () => {
    const onClose = vi.fn()
    const disabledAction = vi.fn()
    const cmds = [
      makeCommand({ id: 'disabled-enter', label: '禁用', disabled: true, action: disabledAction }),
    ]
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={cmds} />
      </Wrapper>
    )
    const palette = screen.getByTestId('command-palette')
    fireEvent.keyDown(palette, { key: 'Enter' })
    expect(disabledAction).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('@p1 clicking backdrop closes palette', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={onClose} commands={sampleCommands} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('command-palette-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('@p1 displays shortcut label on command', () => {
    render(
      <Wrapper>
        <CommandPalette open={true} onClose={vi.fn()} commands={sampleCommands} />
      </Wrapper>
    )
    expect(screen.getByText('⌘E')).toBeInTheDocument()
  })
})
