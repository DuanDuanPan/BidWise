import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Mock antd components to avoid complex DOM setup
vi.mock('antd', () => ({
  Input: {
    Search: ({
      placeholder,
      onChange,
      loading,
    }: {
      placeholder?: string
      onChange?: (e: { target: { value: string } }) => void
      onSearch?: (value: string) => void
      loading?: boolean
      allowClear?: boolean
      defaultValue?: string
      style?: React.CSSProperties
      size?: string
    }) => (
      <input
        data-testid="search-input"
        placeholder={placeholder}
        onChange={onChange}
        data-loading={loading ? 'true' : 'false'}
      />
    ),
  },
  Empty: ({ description }: { description?: React.ReactNode }) => (
    <div data-testid="empty-state">{description}</div>
  ),
  Tag: ({
    children,
    closable,
    onClose,
    color,
  }: {
    children?: React.ReactNode
    closable?: boolean
    onClose?: (e: React.MouseEvent) => void
    color?: string
  }) => (
    <span data-testid="tag" data-closable={closable} data-color={color} onClick={onClose}>
      {children}
    </span>
  ),
}))

vi.mock('@ant-design/icons', () => ({
  PlusOutlined: () => <span data-testid="plus-icon" />,
  ArrowLeftOutlined: () => <span data-testid="arrow-left-icon" />,
}))

// Mock the store
const mockLoadInitialAssets = vi.fn()
const mockSearch = vi.fn()
const mockToggleAssetType = vi.fn()
const mockResetAssetTypes = vi.fn()
const mockSelectAsset = vi.fn()
const mockUpdateAssetTags = vi.fn()
const mockClearError = vi.fn()

let storeState = {
  rawQuery: '',
  assetTypes: [] as string[],
  results: [] as Array<{
    id: string
    title: string
    summary: string
    assetType: string
    sourceProject: string | null
    tags: Array<{ id: string; name: string; normalizedName: string; createdAt: string }>
    matchScore: number
  }>,
  total: 0,
  loading: false,
  error: null as string | null,
  selectedAssetId: null as string | null,
  selectedAsset: null as Record<string, unknown> | null,
  debouncedSearch: vi.fn(),
  loadInitialAssets: mockLoadInitialAssets,
  toggleAssetType: mockToggleAssetType,
  resetAssetTypes: mockResetAssetTypes,
  selectAsset: mockSelectAsset,
  updateAssetTags: mockUpdateAssetTags,
  clearError: mockClearError,
}

vi.mock('@modules/asset/hooks/useAssetSearch', () => ({
  useAssetSearch: () => storeState,
}))

const { AssetSearchPage } = await import(
  '@modules/asset/components/AssetSearchPage'
)

describe('AssetSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      rawQuery: '',
      assetTypes: [],
      results: [],
      total: 0,
      loading: false,
      error: null,
      selectedAssetId: null,
      selectedAsset: null,
      debouncedSearch: vi.fn(),
      loadInitialAssets: mockLoadInitialAssets,
      toggleAssetType: mockToggleAssetType,
      resetAssetTypes: mockResetAssetTypes,
      selectAsset: mockSelectAsset,
      updateAssetTags: mockUpdateAssetTags,
      clearError: mockClearError,
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders page header and search input', () => {
    render(<AssetSearchPage />)

    expect(screen.getByText('资产库')).toBeTruthy()
    expect(screen.getByTestId('search-input')).toBeTruthy()
  })

  it('renders type filter buttons including 全部', () => {
    render(<AssetSearchPage />)

    expect(screen.getByText('全部')).toBeTruthy()
    expect(screen.getByText('文字片段')).toBeTruthy()
    expect(screen.getByText('架构图')).toBeTruthy()
    expect(screen.getByText('表格')).toBeTruthy()
    expect(screen.getByText('案例')).toBeTruthy()
  })

  it('calls loadInitialAssets on mount', () => {
    render(<AssetSearchPage />)
    expect(mockLoadInitialAssets).toHaveBeenCalled()
  })

  it('renders empty state when no results', () => {
    storeState.results = []
    render(<AssetSearchPage />)

    expect(screen.getByTestId('empty-state')).toBeTruthy()
    expect(screen.getByText('未找到匹配资产')).toBeTruthy()
  })

  it('renders result count and cards when results exist', () => {
    storeState.results = [
      {
        id: 'a1',
        title: '微服务架构',
        summary: '摘要文本',
        assetType: 'text',
        sourceProject: '项目A',
        tags: [],
        matchScore: 95,
      },
    ]
    storeState.total = 1

    render(<AssetSearchPage />)

    expect(screen.getByText('找到 1 个资产')).toBeTruthy()
    expect(screen.getByText('微服务架构')).toBeTruthy()
  })

  it('clicking 全部 button calls resetAssetTypes', () => {
    render(<AssetSearchPage />)

    fireEvent.click(screen.getByText('全部'))
    expect(mockResetAssetTypes).toHaveBeenCalled()
  })

  it('clicking type filter calls toggleAssetType', () => {
    render(<AssetSearchPage />)

    fireEvent.click(screen.getByText('架构图'))
    expect(mockToggleAssetType).toHaveBeenCalledWith('diagram')
  })

  it('triggers debouncedSearch on input change', async () => {
    render(<AssetSearchPage />)

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '测试' } })

    await waitFor(() => {
      expect(storeState.debouncedSearch).toHaveBeenCalledWith('测试')
    })
  })
})
