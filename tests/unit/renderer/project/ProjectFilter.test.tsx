import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { ProjectFilter } from '@modules/project/components/ProjectFilter'
import { useProjectStore } from '@renderer/stores/projectStore'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  useProjectStore.setState({
    filter: {
      quick: 'all',
      customer: null,
      industry: null,
      status: null,
      deadlineBefore: null,
    },
    sortMode: 'smart',
  })
})

describe('ProjectFilter', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render filter tabs', () => {
    render(<ProjectFilter />, { wrapper: Wrapper })
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('本周截止')).toBeInTheDocument()
    expect(screen.getByText('有警告')).toBeInTheDocument()
  })

  it('should render sort toggle button', () => {
    render(<ProjectFilter />, { wrapper: Wrapper })
    expect(screen.getByTestId('sort-toggle-btn')).toBeInTheDocument()
  })

  it('should render advanced filter button', () => {
    render(<ProjectFilter />, { wrapper: Wrapper })
    expect(screen.getByTestId('advanced-filter-btn')).toBeInTheDocument()
  })

  it('should toggle sort mode on click', () => {
    render(<ProjectFilter />, { wrapper: Wrapper })
    fireEvent.click(screen.getByTestId('sort-toggle-btn'))
    expect(useProjectStore.getState().sortMode).toBe('updated')
  })
})
