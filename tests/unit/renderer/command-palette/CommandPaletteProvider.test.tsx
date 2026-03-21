import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { HashRouter } from 'react-router-dom'
import { CommandPaletteProvider } from '@renderer/shared/command-palette/CommandPaletteProvider'
import { useCommandPalette } from '@renderer/shared/command-palette/use-command-palette'
import { useProjectStore } from '@renderer/stores'

// Test consumer component
function TestConsumer(): React.JSX.Element {
  const { setOpen, registerCommand, unregisterCommand } = useCommandPalette()
  return (
    <div>
      <button data-testid="open-palette" onClick={() => setOpen(true)}>
        Open
      </button>
      <button
        data-testid="register-cmd"
        onClick={() =>
          registerCommand({
            id: 'dynamic-cmd',
            label: '动态命令',
            category: 'action',
            keywords: ['dynamic'],
            action: () => {},
          })
        }
      >
        Register
      </button>
      <button data-testid="unregister-cmd" onClick={() => unregisterCommand('dynamic-cmd')}>
        Unregister
      </button>
    </div>
  )
}

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>
        <HashRouter>{children}</HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  useProjectStore.setState({
    projects: [],
    currentProject: null,
    loading: false,
    error: null,
  })
  vi.stubGlobal('api', {
    projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectCreate: vi.fn(),
    projectGet: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectArchive: vi.fn(),
  })
})

describe('@story-1-9 CommandPaletteProvider', () => {
  afterEach(cleanup)

  it('@p0 provides context to children', () => {
    render(
      <Wrapper>
        <CommandPaletteProvider>
          <TestConsumer />
        </CommandPaletteProvider>
      </Wrapper>
    )
    expect(screen.getByTestId('open-palette')).toBeInTheDocument()
  })

  it('@p0 opens command palette via context', async () => {
    render(
      <Wrapper>
        <CommandPaletteProvider>
          <TestConsumer />
        </CommandPaletteProvider>
      </Wrapper>
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-palette'))
    })
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })

  it('@p0 registers and displays dynamic command', async () => {
    render(
      <Wrapper>
        <CommandPaletteProvider>
          <TestConsumer />
        </CommandPaletteProvider>
      </Wrapper>
    )
    // Register a dynamic command
    await act(async () => {
      fireEvent.click(screen.getByTestId('register-cmd'))
    })
    // Open palette
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-palette'))
    })
    // Search for the dynamic command
    const input = screen.getByTestId('command-palette-input')
    await act(async () => {
      fireEvent.change(input, { target: { value: '动态' } })
    })
    expect(screen.getByText('动态命令')).toBeInTheDocument()
  })

  it('@p0 unregisters command removes it from palette', async () => {
    render(
      <Wrapper>
        <CommandPaletteProvider>
          <TestConsumer />
        </CommandPaletteProvider>
      </Wrapper>
    )
    // Register then unregister
    await act(async () => {
      fireEvent.click(screen.getByTestId('register-cmd'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('unregister-cmd'))
    })
    // Open palette
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-palette'))
    })
    const input = screen.getByTestId('command-palette-input')
    await act(async () => {
      fireEvent.change(input, { target: { value: '动态' } })
    })
    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument()
  })

  it('@p0 registers project switch commands globally from the project store', async () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: '全局项目切换',
          customerName: '客户A',
          industry: '军工',
          deadline: null,
          sopStage: 'requirements-analysis',
          status: 'active',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      ],
    })

    render(
      <Wrapper>
        <CommandPaletteProvider>
          <TestConsumer />
        </CommandPaletteProvider>
      </Wrapper>
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-palette'))
    })

    const input = screen.getByTestId('command-palette-input')
    await act(async () => {
      fireEvent.change(input, { target: { value: '全局项目切换' } })
    })

    expect(screen.getByText('全局项目切换')).toBeInTheDocument()
  })

  it('@p1 throws when useCommandPalette used outside provider', () => {
    function BadConsumer(): React.JSX.Element {
      useCommandPalette()
      return <div />
    }
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <Wrapper>
          <BadConsumer />
        </Wrapper>
      )
    ).toThrow('useCommandPalette must be used within CommandPaletteProvider')
    spy.mockRestore()
  })
})
