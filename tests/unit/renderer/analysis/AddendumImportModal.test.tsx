import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AddendumImportModal } from '@modules/analysis/components/AddendumImportModal'

const { mockMessageError, uploadState } = vi.hoisted(() => ({
  mockMessageError: vi.fn(),
  uploadState: {
    nextFileList: [] as unknown[],
  },
}))

vi.mock('@ant-design/icons', () => ({
  UploadOutlined: () => <span />,
}))

vi.mock('antd', () => {
  const Button = ({
    children,
    onClick,
    disabled,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    'data-testid'?: string
  }): React.JSX.Element => (
    <button data-testid={testId} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
  Button.displayName = 'MockButton'

  const Input = ({
    value,
    onChange,
    ...rest
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    [key: string]: unknown
  }): React.JSX.Element => (
    <input
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      {...rest}
    />
  )
  Input.displayName = 'MockInput'
  Input.TextArea = ({
    value,
    onChange,
    ...rest
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    [key: string]: unknown
  }): React.JSX.Element => (
    <textarea
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      {...rest}
    />
  )
  Input.TextArea.displayName = 'MockTextArea'

  const Modal = ({
    open,
    children,
    footer,
    title,
  }: {
    open?: boolean
    children?: React.ReactNode
    footer?: React.ReactNode
    title?: React.ReactNode
  }): React.JSX.Element | null => {
    if (!open) return null
    return (
      <div>
        <div>{title}</div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    )
  }
  Modal.displayName = 'MockModal'

  const Upload = ({
    children,
    onChange,
    disabled,
  }: {
    children?: React.ReactNode
    onChange?: (info: { fileList: unknown[] }) => void
    disabled?: boolean
  }): React.JSX.Element => (
    <div>
      <button
        data-testid="mock-upload-select"
        disabled={disabled}
        onClick={() => onChange?.({ fileList: uploadState.nextFileList })}
      >
        选择文件
      </button>
      {children}
    </div>
  )
  Upload.displayName = 'MockUpload'

  return {
    Button,
    Input,
    Modal,
    Upload,
    message: {
      error: mockMessageError,
    },
  }
})

describe('AddendumImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadState.nextFileList = []
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('clears the selected txt file after importing through FileReader', async () => {
    class MockFileReader {
      onload: ((event: { target?: { result?: string } }) => void) | null = null

      readAsText(): void {
        this.onload?.({ target: { result: '补遗正文内容' } })
      }
    }

    vi.stubGlobal('FileReader', MockFileReader)

    const onImport = vi.fn()
    uploadState.nextFileList = [
      {
        uid: 'txt-1',
        name: 'notice.txt',
        originFileObj: new File(['seed'], 'notice.txt', { type: 'text/plain' }),
      },
    ]

    render(<AddendumImportModal open onImport={onImport} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByTestId('mock-upload-select'))
    const importButton = screen.getByTestId('start-addendum-import')
    expect(importButton).not.toBeDisabled()

    fireEvent.click(importButton)

    expect(onImport).toHaveBeenCalledWith({
      content: '补遗正文内容',
      fileName: 'notice.txt',
    })
    await waitFor(() => {
      expect(importButton).toBeDisabled()
    })
  })

  it('shows an error when the selected file path is unavailable', () => {
    const onImport = vi.fn()
    uploadState.nextFileList = [
      {
        uid: 'pdf-1',
        name: 'notice.pdf',
        originFileObj: new File(['pdf'], 'notice.pdf', { type: 'application/pdf' }),
      },
    ]

    render(<AddendumImportModal open onImport={onImport} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByTestId('mock-upload-select'))
    fireEvent.click(screen.getByTestId('start-addendum-import'))

    expect(onImport).not.toHaveBeenCalled()
    expect(mockMessageError).toHaveBeenCalled()
  })
})
