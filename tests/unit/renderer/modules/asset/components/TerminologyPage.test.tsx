import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// Mock antd components with simple HTML
vi.mock('antd', () => ({
  Button: ({ children, onClick, icon, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {icon}
      {children}
    </button>
  ),
  Input: {
    Search: ({ value, onChange, placeholder, ...props }: any) => (
      <input
        data-testid="search-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...props}
      />
    ),
  },
  Select: ({ value, onChange, placeholder, options, ...props }: any) => (
    <select
      data-testid="category-filter"
      value={value || ''}
      onChange={(e: any) => onChange(e.target.value || null)}
      {...props}
    >
      <option value="">All</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Switch: ({ checked, onChange, ...props }: any) => (
    <input
      type="checkbox"
      data-testid="switch"
      checked={checked}
      onChange={(e: any) => onChange(e.target.checked)}
      {...props}
    />
  ),
  Table: ({ dataSource, columns, locale, ...props }: any) => {
    if (!dataSource?.length)
      return <div data-testid="empty-table">{locale?.emptyText}</div>
    return (
      <table data-testid="terminology-table">
        <tbody>
          {dataSource.map((row: any, i: number) => (
            <tr key={i}>
              {columns.map((col: any, j: number) => (
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
  Popconfirm: ({ children, onConfirm, title }: any) => (
    <span onClick={onConfirm}>{children}</span>
  ),
  Space: ({ children }: any) => <div>{children}</div>,
  Typography: {
    Text: ({ children }: any) => <span>{children}</span>,
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
  useTerminologyStore: (selector?: any) => (selector ? selector(storeState) : storeState),
}))

// Mock child components
vi.mock('@modules/asset/components/TerminologyEntryForm', () => ({
  TerminologyEntryForm: ({ open }: any) =>
    open ? <div data-testid="entry-form">Form</div> : null,
}))

vi.mock('@modules/asset/components/TerminologyImportDialog', () => ({
  TerminologyImportDialog: ({ open }: any) =>
    open ? <div data-testid="import-dialog">Import</div> : null,
}))

const { TerminologyPage } = await import(
  '@modules/asset/components/TerminologyPage'
)

function makeEntry(overrides: Record<string, unknown> = {}) {
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
    expect(
      screen.getByText('术语库暂无条目。点击"添加术语"创建第一条行业术语映射。')
    ).toBeTruthy()
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
    mockExportJson.mockResolvedValue({ cancelled: false, outputPath: '/tmp/out.json', entryCount: 2 })

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
