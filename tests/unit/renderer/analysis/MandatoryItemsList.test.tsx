import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MandatoryItemsList } from '@renderer/modules/analysis/components/MandatoryItemsList'
import type { MandatoryItem, MandatoryItemSummary } from '@shared/analysis-types'

const { mockModalConfirm, mockMessageError, mockMessageSuccess } = vi.hoisted(() => ({
  mockModalConfirm: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageSuccess: vi.fn(),
}))

vi.mock('@ant-design/icons', () => ({
  CheckOutlined: () => <span />,
  CloseOutlined: () => <span />,
  PlusOutlined: () => <span />,
  LoadingOutlined: () => <span />,
  ReloadOutlined: () => <span />,
  ExclamationCircleOutlined: () => <span />,
}))

vi.mock('antd', () => {
  const Button = ({
    children,
    onClick,
    disabled,
    loading,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    'data-testid'?: string
  }): React.JSX.Element => (
    <button data-testid={testId} disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  )
  Button.displayName = 'MockButton'

  const Alert = ({
    message,
    action,
    'data-testid': testId,
  }: {
    message: React.ReactNode
    action?: React.ReactNode
    'data-testid'?: string
  }): React.JSX.Element => (
    <div data-testid={testId}>
      <div>{message}</div>
      {action}
    </div>
  )
  Alert.displayName = 'MockAlert'

  const Table = ({
    dataSource,
    'data-testid': testId,
  }: {
    dataSource: MandatoryItem[]
    'data-testid'?: string
  }): React.JSX.Element => (
    <div data-testid={testId}>
      {dataSource.map((item) => (
        <div key={item.id}>{item.content}</div>
      ))}
    </div>
  )
  Table.displayName = 'MockTable'

  const Form = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <form>{children}</form>
  )
  Form.displayName = 'MockForm'
  Form.Item = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  Form.Item.displayName = 'MockFormItem'
  Form.useForm = () => [
    {
      validateFields: vi.fn(),
      resetFields: vi.fn(),
    },
  ]

  const Input = (props: React.ComponentProps<'input'>): React.JSX.Element => <input {...props} />
  Input.displayName = 'MockInput'
  const InputTextArea = (props: React.ComponentProps<'textarea'>): React.JSX.Element => (
    <textarea {...props} />
  )
  InputTextArea.displayName = 'MockInputTextArea'
  Input.TextArea = InputTextArea

  const Modal = ({
    children,
    open,
  }: {
    children?: React.ReactNode
    open?: boolean
  }): React.JSX.Element | null => (open ? <div>{children}</div> : null)
  Modal.displayName = 'MockModal'
  Modal.confirm = mockModalConfirm

  const Progress = ({ percent }: { percent?: number }): React.JSX.Element => (
    <div>{percent ?? 0}</div>
  )
  Progress.displayName = 'MockProgress'

  const Tag = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <span>{children}</span>
  )
  Tag.displayName = 'MockTag'

  const Tooltip = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <>{children}</>
  )
  Tooltip.displayName = 'MockTooltip'

  const App = {
    useApp: () => ({
      modal: { confirm: mockModalConfirm },
    }),
  }

  return {
    App,
    Alert,
    Button,
    Form,
    Input,
    Modal,
    Progress,
    Table,
    Tag,
    Tooltip,
    message: {
      error: mockMessageError,
      success: mockMessageSuccess,
    },
  }
})

const baseSummary: MandatoryItemSummary = {
  total: 0,
  confirmed: 0,
  dismissed: 0,
  pending: 0,
}

const existingItems: MandatoryItem[] = [
  {
    id: 'item-1',
    content: '投标文件须加盖公章',
    sourceText: '投标文件须加盖公章，否则按无效标处理。',
    sourcePages: [12],
    confidence: 0.95,
    status: 'confirmed',
    linkedRequirementId: null,
    detectedAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  },
]

describe('MandatoryItemsList', () => {
  const onDetect = vi.fn()
  const onUpdate = vi.fn().mockResolvedValue(undefined)
  const onAdd = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an error banner while preserving the zero-result state after a failed re-detect', () => {
    render(
      <MandatoryItemsList
        items={[]}
        summary={baseSummary}
        detecting={false}
        progress={0}
        progressMessage=""
        error="AI 服务超时"
        onDetect={onDetect}
        onUpdate={onUpdate}
        onAdd={onAdd}
      />
    )

    expect(screen.getByTestId('mandatory-error')).toHaveTextContent('*项检测失败：AI 服务超时')
    expect(screen.getByText('本次未识别出必响应项，请人工复核或手动添加')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('mandatory-retry-btn'))
    expect(mockModalConfirm).toHaveBeenCalledTimes(1)

    const modalConfig = mockModalConfirm.mock.calls[0][0] as { onOk: () => void }
    modalConfig.onOk()
    expect(onDetect).toHaveBeenCalledTimes(1)
  })

  it('keeps previously reviewed items visible when re-detection fails', () => {
    render(
      <MandatoryItemsList
        items={existingItems}
        summary={{ total: 1, confirmed: 1, dismissed: 0, pending: 0 }}
        detecting={false}
        progress={0}
        progressMessage=""
        error="AI 服务超时"
        onDetect={onDetect}
        onUpdate={onUpdate}
        onAdd={onAdd}
      />
    )

    expect(screen.getByTestId('mandatory-error')).toBeInTheDocument()
    expect(screen.getByText('投标文件须加盖公章')).toBeInTheDocument()
  })

  it('retries immediately when the first detection fails before any results exist', () => {
    render(
      <MandatoryItemsList
        items={null}
        summary={null}
        detecting={false}
        progress={0}
        progressMessage=""
        error="AI 服务超时"
        onDetect={onDetect}
        onUpdate={onUpdate}
        onAdd={onAdd}
      />
    )

    fireEvent.click(screen.getByTestId('mandatory-retry-btn'))
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(mockModalConfirm).not.toHaveBeenCalled()
  })
})
