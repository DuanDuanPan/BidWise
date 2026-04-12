import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'

interface MockColumn {
  dataIndex: string
  render?: (value: ReactNode, record: Record<string, ReactNode>) => ReactNode
}

// Mock antd components with simple HTML
vi.mock('antd', () => ({
  Button: ({
    children,
    onClick,
    icon,
  }: {
    children?: ReactNode
    onClick?: () => void
    icon?: ReactNode
  }) => (
    <button onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Input: {
    Search: ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string
      onChange?: (e: ChangeEvent<HTMLInputElement>) => void
      placeholder?: string
    }) => (
      <input
        data-testid="search-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    ),
  },
  Select: ({
    value,
    onChange,
    options,
  }: {
    value?: string
    onChange: (value: string | null) => void
    options?: Array<{ value: string; label: string }>
  }) => (
    <select
      data-testid="category-filter"
      value={value || ''}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value || null)}
    >
      <option value="">All</option>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (checked: boolean) => void }) => (
    <input
      type="checkbox"
      data-testid="switch"
      checked={checked}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)}
    />
  ),
  Table: ({
    dataSource,
    columns,
    locale,
  }: {
    dataSource?: Array<Record<string, ReactNode>>
    columns: MockColumn[]
    locale?: { emptyText: ReactNode }
  }) => {
    if (!dataSource?.length) return <div data-testid="empty-table">{locale?.emptyText}</div>
    return (
      <table data-testid="terminology-table">
        <tbody>
          {dataSource.map((row, i) => (
            <tr key={i}>
              {columns.map((col, j) => (
                <td key={j}>
                  {col.render ? col.render(row[col.dataIndex], row) : row[col.dataIndex]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  },
  Popconfirm: ({ children, onConfirm }: { children: ReactNode; onConfirm: () => void }) => (
    <span onClick={onConfirm}>{children}</span>
  ),
  Space: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Typography: {
    Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  },
  App: {
    useApp: () => ({
      message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    }),
  },
}))

vi.mock('@ant-design/icons', () => ({
  PlusOutlined: () => <span>+</span>,
  UploadOutlined: () => <span>&#8593;</span>,
  ExportOutlined: () => <span>&#8595;</span>,
  InboxOutlined: () => <span>inbox</span>,
  DownloadOutlined: () => <span>download</span>,
}))

// Mock the store
const mockLoadEntries = vi.fn()
const mockUpdateEntry = vi.fn()
const mockDeleteEntry = vi.fn()
const mockExportJson = vi.fn()
const mockSetSearchQuery = vi.fn()
const mockSetCategoryFilter = vi.fn()
const mockSetActiveOnly = vi.fn()

let storeState: Record<string, unknown> = {
  entries: [],
  loading: false,
  searchQuery: '',
  categoryFilter: null,
  activeOnly: true,
  error: null,
  loadEntries: mockLoadEntries,
  updateEntry: mockUpdateEntry,
  deleteEntry: mockDeleteEntry,
  exportJson: mockExportJson,
  setSearchQuery: mockSetSearchQuery,
  setCategoryFilter: mockSetCategoryFilter,
  setActiveOnly: mockSetActiveOnly,
}

vi.mock('@renderer/stores', () => ({
  useTerminologyStore: (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}))

// Mock child components
vi.mock('@modules/asset/components/TerminologyEntryForm', () => ({
  TerminologyEntryForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="entry-form">Form</div> : null,
}))

vi.mock('@modules/asset/components/TerminologyImportDialog', () => ({
  TerminologyImportDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="import-dialog">Import</div> : null,
}))

const { TerminologyPage } = await import('@modules/asset/components/TerminologyPage')

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    sourceTerm: '设备管理',
    targetTerm: '装备全寿命周期管理',
    normalizedSourceTerm: '设备管理',
    category: '军工装备',
    description: '行业标准术语',
    isActive: true,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('TerminologyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      entries: [],
      loading: false,
      searchQuery: '',
      categoryFilter: null,
      activeOnly: true,
      error: null,
      loadEntries: mockLoadEntries,
      updateEntry: mockUpdateEntry,
      deleteEntry: mockDeleteEntry,
      exportJson: mockExportJson,
      setSearchQuery: mockSetSearchQuery,
      setCategoryFilter: mockSetCategoryFilter,
      setActiveOnly: mockSetActiveOnly,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders table with empty state text when no entries', () => {
    render(<TerminologyPage />)

    expect(screen.getByTestId('empty-table')).toBeTruthy()
    expect(screen.getByText('术语库暂无条目。点击"添加术语"创建第一条行业术语映射。')).toBeTruthy()
  })

  it('renders table rows when entries exist', () => {
    storeState.entries = [
      makeEntry(),
      makeEntry({ id: 'e2', sourceTerm: '系统', targetTerm: '信息化平台', category: '信息化' }),
    ]

    render(<TerminologyPage />)

    expect(screen.getByTestId('terminology-table')).toBeTruthy()
    expect(screen.getByText('设备管理')).toBeTruthy()
    expect(screen.getByText('装备全寿命周期管理')).toBeTruthy()
    expect(screen.getByText('系统')).toBeTruthy()
    expect(screen.getByText('信息化平台')).toBeTruthy()
  })

  it('calls loadEntries on mount', () => {
    render(<TerminologyPage />)

    expect(mockLoadEntries).toHaveBeenCalled()
  })

  it('search input change triggers setSearchQuery', () => {
    render(<TerminologyPage />)

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: '测试' },
    })

    expect(mockSetSearchQuery).toHaveBeenCalledWith('测试')
  })

  it('add button click opens entry form dialog', () => {
    render(<TerminologyPage />)

    expect(screen.queryByTestId('entry-form')).toBeNull()

    fireEvent.click(screen.getByText('添加术语'))

    expect(screen.getByTestId('entry-form')).toBeTruthy()
  })

  it('delete button with Popconfirm calls deleteEntry', () => {
    storeState.entries = [makeEntry()]
    mockDeleteEntry.mockResolvedValue(undefined)

    render(<TerminologyPage />)

    // The Popconfirm mock wraps children in a span with onClick=onConfirm
    // So clicking "删除" fires the Popconfirm onConfirm directly
    fireEvent.click(screen.getByText('删除'))

    expect(mockDeleteEntry).toHaveBeenCalledWith('e1')
  })

  it('export button calls exportJson', () => {
    mockExportJson.mockResolvedValue({
      cancelled: false,
      outputPath: '/tmp/out.json',
      entryCount: 2,
    })

    render(<TerminologyPage />)

    fireEvent.click(screen.getByText('导出 JSON'))

    expect(mockExportJson).toHaveBeenCalled()
  })

  it('import button opens import dialog', () => {
    render(<TerminologyPage />)

    expect(screen.queryByTestId('import-dialog')).toBeNull()

    fireEvent.click(screen.getByText('批量导入'))

    expect(screen.getByTestId('import-dialog')).toBeTruthy()
  })
})
