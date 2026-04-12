import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock antd components
vi.mock('antd', () => ({
  Modal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean
    title: ReactNode
    children: ReactNode
    footer: ReactNode
  }) =>
    open ? (
      <div data-testid="import-modal">
        <h2>{title}</h2>
        {children}
        <div data-testid="footer">{footer}</div>
      </div>
    ) : null,
  Upload: {
    Dragger: ({
      children,
      beforeUpload,
    }: {
      children: ReactNode
      beforeUpload: (file: File) => boolean | void
    }) => (
      <div
        data-testid="upload-dragger"
        onClick={() => {
          const file = new File(['源术语,目标术语\nA,B'], 'test.csv', {
            type: 'text/csv',
          })
          beforeUpload(file)
        }}
      >
        {children}
      </div>
    ),
  },
  Table: ({ dataSource }: { dataSource?: Array<{ sourceTerm: string; targetTerm: string }> }) => (
    <table data-testid="preview-table">
      <tbody>
        {dataSource?.map((r, i) => (
          <tr key={i}>
            <td>{r.sourceTerm}</td>
            <td>{r.targetTerm}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
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
  InboxOutlined: () => <span>inbox</span>,
  DownloadOutlined: () => <span>download</span>,
}))

// Mock the store
const mockBatchCreate = vi.fn()

vi.mock('@renderer/stores', () => ({
  useTerminologyStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { batchCreate: mockBatchCreate }
    return selector ? selector(state) : state
  },
}))

const { TerminologyImportDialog } =
  await import('@modules/asset/components/TerminologyImportDialog')

describe('TerminologyImportDialog', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows upload dragger when open (initial state)', () => {
    render(<TerminologyImportDialog open={true} onClose={mockOnClose} />)

    expect(screen.getByTestId('upload-dragger')).toBeTruthy()
    expect(screen.getByText('点击或拖拽 CSV 文件到此区域')).toBeTruthy()
  })

  it('does not render when open=false', () => {
    render(<TerminologyImportDialog open={false} onClose={mockOnClose} />)

    expect(screen.queryByTestId('import-modal')).toBeNull()
  })

  it('shows title "批量导入术语"', () => {
    render(<TerminologyImportDialog open={true} onClose={mockOnClose} />)

    expect(screen.getByText('批量导入术语')).toBeTruthy()
  })

  it('shows download template button', () => {
    render(<TerminologyImportDialog open={true} onClose={mockOnClose} />)

    expect(screen.getByText('下载模板')).toBeTruthy()
  })
})
