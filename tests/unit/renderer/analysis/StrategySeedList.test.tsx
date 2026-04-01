import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrategySeedList } from '@renderer/modules/analysis/components/StrategySeedList'
import type { StrategySeed, StrategySeedSummary } from '@shared/analysis-types'

const { mockModalConfirm, mockMessageError, mockMessageWarning } = vi.hoisted(() => ({
  mockModalConfirm: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageWarning: vi.fn(),
}))

vi.mock('@ant-design/icons', () => ({
  PlusOutlined: () => <span />,
  ReloadOutlined: () => <span />,
  CheckOutlined: () => <span />,
  LoadingOutlined: () => <span />,
  UploadOutlined: () => <span />,
  ThunderboltOutlined: () => <span />,
  EditOutlined: () => <span />,
  DeleteOutlined: () => <span />,
  SaveOutlined: () => <span />,
  CloseOutlined: () => <span />,
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
  }: {
    message: React.ReactNode
    action?: React.ReactNode
  }): React.JSX.Element => (
    <div>
      <div>{message}</div>
      {action}
    </div>
  )
  Alert.displayName = 'MockAlert'

  const Progress = ({ percent }: { percent?: number }): React.JSX.Element => (
    <div>{percent ?? 0}</div>
  )
  Progress.displayName = 'MockProgress'

  const Input = ({
    value,
    onChange,
    placeholder,
    maxLength,
    className,
    ...rest
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    maxLength?: number
    className?: string
    [key: string]: unknown
  }): React.JSX.Element => (
    <input
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
      maxLength={maxLength}
      className={className}
      {...rest}
    />
  )
  Input.displayName = 'MockInput'
  Input.TextArea = ({
    value,
    onChange,
    placeholder,
    ...rest
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    [key: string]: unknown
  }): React.JSX.Element => (
    <textarea
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
      {...rest}
    />
  )
  Input.TextArea.displayName = 'MockTextArea'

  const Modal = ({
    title,
    open,
    children,
    footer,
    onOk,
    onCancel,
    okText,
    cancelText,
  }: {
    title?: React.ReactNode
    open?: boolean
    children?: React.ReactNode
    footer?: React.ReactNode
    onOk?: () => void
    onCancel?: () => void
    okText?: string
    cancelText?: string
  }): React.JSX.Element | null => {
    if (!open) return null
    return (
      <div>
        <div>{title}</div>
        <div>{children}</div>
        <div>
          {footer ?? (
            <>
              {cancelText ? <button onClick={onCancel}>{cancelText}</button> : null}
              {okText ? <button onClick={onOk}>{okText}</button> : null}
            </>
          )}
        </div>
      </div>
    )
  }
  Modal.displayName = 'MockModal'
  Modal.confirm = mockModalConfirm

  const Upload = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  Upload.displayName = 'MockUpload'

  const Popconfirm = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  )
  Popconfirm.displayName = 'MockPopconfirm'

  const Tag = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <span>{children}</span>
  )
  Tag.displayName = 'MockTag'

  return {
    Alert,
    Button,
    Input,
    Modal,
    Popconfirm,
    Progress,
    Tag,
    Upload,
    message: {
      error: mockMessageError,
      warning: mockMessageWarning,
    },
  }
})

const pendingSeed: StrategySeed = {
  id: 'seed-1',
  title: '数据安全合规优先级高',
  reasoning: '客户多次强调数据安全与国密算法。',
  suggestion: '突出国密能力和审计闭环。',
  sourceExcerpt: '客户非常关注数据安全合规性。',
  confidence: 0.92,
  status: 'pending',
  createdAt: '2026-04-01T09:00:00.000Z',
  updatedAt: '2026-04-01T09:00:00.000Z',
}

const summary: StrategySeedSummary = {
  total: 1,
  confirmed: 0,
  adjusted: 0,
  pending: 1,
}

describe('StrategySeedList', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onUpdate = vi.fn().mockResolvedValue(undefined)
  const onDelete = vi.fn().mockResolvedValue(undefined)
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const onConfirmAll = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the empty upload CTA before any seeds are generated', () => {
    render(
      <StrategySeedList
        seeds={null}
        summary={null}
        generating={false}
        progress={0}
        progressMessage=""
        error={null}
        onGenerate={onGenerate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAdd={onAdd}
        onConfirmAll={onConfirmAll}
      />
    )

    expect(screen.getByTestId('seed-generate')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('seed-generate'))
    expect(screen.getByTestId('material-textarea')).toBeInTheDocument()
  })

  it('keeps the retry path available when generation failed before any results existed', () => {
    render(
      <StrategySeedList
        seeds={null}
        summary={null}
        generating={false}
        progress={0}
        progressMessage=""
        error="AI 服务超时"
        onGenerate={onGenerate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAdd={onAdd}
        onConfirmAll={onConfirmAll}
      />
    )

    expect(screen.getByText('策略种子生成失败：AI 服务超时')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByTestId('material-textarea')).toBeInTheDocument()
  })

  it('opens the add modal and re-generation confirm flow for zero-result snapshots', () => {
    render(
      <StrategySeedList
        seeds={[]}
        summary={{ total: 0, confirmed: 0, adjusted: 0, pending: 0 }}
        generating={false}
        progress={0}
        progressMessage=""
        error={null}
        onGenerate={onGenerate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAdd={onAdd}
        onConfirmAll={onConfirmAll}
      />
    )

    fireEvent.click(screen.getByTestId('seed-add-manual'))
    expect(screen.getByText('手动添加策略种子')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('seed-generate'))
    expect(mockModalConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders the summary bar and exposes the confirm-all action when pending seeds exist', () => {
    render(
      <StrategySeedList
        seeds={[pendingSeed]}
        summary={summary}
        generating={false}
        progress={0}
        progressMessage=""
        error={null}
        onGenerate={onGenerate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAdd={onAdd}
        onConfirmAll={onConfirmAll}
      />
    )

    expect(screen.getByTestId('seed-summary')).toHaveTextContent('共 1 个策略种子')
    expect(screen.getByText('待确认 1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('seed-confirm-all'))
    expect(onConfirmAll).toHaveBeenCalledTimes(1)
  })
})
