import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { AssetImportContext } from '@modules/asset/components/AssetImportDialog'

// --- Mocks ---

// Mock uuid to produce deterministic IDs
let uuidCounter = 0
vi.mock('uuid', () => ({ v4: () => `mock-uuid-${++uuidCounter}` }))

// Track form setFieldsValue calls and validateFields behavior
const formState = {
  values: {} as Record<string, string>,
  rules: {} as Record<string, Array<{ required?: boolean; message?: string }>>,
}
const mockValidateFields = vi.fn()

// Stable form object reference to avoid infinite re-renders
const stableForm = {
  setFieldsValue: (values: Record<string, string>) => {
    Object.assign(formState.values, values)
  },
  validateFields: mockValidateFields,
  getFieldsValue: () => formState.values,
  resetFields: vi.fn(),
  setFieldValue: vi.fn(),
  getFieldValue: (name: string) => formState.values[name],
}

vi.mock('antd', () => {
  const FormItem = ({
    children,
    name,
    label,
    rules,
  }: {
    children?: React.ReactNode
    name?: string
    label?: string
    rules?: Array<{ required?: boolean; message?: string }>
  }): React.JSX.Element => {
    if (name && rules) {
      // eslint-disable-next-line react-hooks/immutability
      formState.rules[name] = rules
    }
    return (
      <div data-testid={`form-item-${name || 'unnamed'}`} data-label={label}>
        {children}
      </div>
    )
  }

  const FormComponent = ({ children }: { children?: React.ReactNode }): React.JSX.Element => (
    <div data-testid="form">{children}</div>
  )
  FormComponent.Item = FormItem
  FormComponent.useForm = () => [stableForm]

  return {
    Form: FormComponent,
    Input: Object.assign(
      ({ placeholder }: { placeholder?: string }) => (
        <input data-testid="input-text" placeholder={placeholder} />
      ),
      {
        TextArea: ({ rows, placeholder }: { rows?: number; placeholder?: string }) => (
          <textarea data-testid="input-textarea" rows={rows} placeholder={placeholder} />
        ),
      }
    ),
    Select: ({ options }: { options?: Array<{ value: string; label: string }> }) => (
      <select data-testid="select">
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    Modal: ({
      children,
      open,
      title,
      onCancel,
      onOk,
      okText,
      cancelText,
      confirmLoading,
    }: {
      children?: React.ReactNode
      open?: boolean
      title?: string
      width?: number
      maskClosable?: boolean
      onCancel?: () => void
      onOk?: () => void
      okText?: string
      cancelText?: string
      confirmLoading?: boolean
      'data-testid'?: string
    }) =>
      open ? (
        <div data-testid="modal" data-loading={confirmLoading}>
          <div data-testid="modal-title">{title}</div>
          {children}
          <button data-testid="modal-ok" onClick={onOk}>
            {okText}
          </button>
          <button data-testid="modal-cancel" onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      ) : null,
    message: {
      success: vi.fn(),
    },
  }
})

// Capture TagEditor props for assertions
let capturedTagEditorProps: {
  tags: Array<{ id: string; name: string; normalizedName: string }>
  onAdd: (name: string) => void
  onRemove: (name: string) => void
} | null = null

vi.mock('@modules/asset/components/TagEditor', () => ({
  TagEditor: (props: {
    tags: Array<{ id: string; name: string; normalizedName: string }>
    onAdd: (name: string) => void
    onRemove: (name: string) => void
  }) => {
    capturedTagEditorProps = props
    return (
      <div data-testid="tag-editor">
        {props.tags.map((t) => (
          <span key={t.id} data-testid={`draft-tag-${t.name}`}>
            {t.name}
          </span>
        ))}
      </div>
    )
  },
}))

// Mock assetStore
const mockCreateAsset = vi.fn()

vi.mock('@renderer/stores', () => ({
  useAssetStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ createAsset: mockCreateAsset }),
}))

import { AssetImportDialog } from '@modules/asset/components/AssetImportDialog'

describe('AssetImportDialog', () => {
  const defaultContext: AssetImportContext = {
    selectedText: '选中的一段很长的文本内容用于测试截断和填充行为',
    sectionTitle: '系统架构设计',
    sourceProject: 'proj-1',
    sourceSection: 'sec-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(formState.values)) delete formState.values[key]
    for (const key of Object.keys(formState.rules)) delete formState.rules[key]
    capturedTagEditorProps = null
    uuidCounter = 0
    mockCreateAsset.mockResolvedValue(undefined)
    mockValidateFields.mockResolvedValue({
      title: '系统架构设计',
      content: '选中的一段很长的文本内容用于测试截断和填充行为',
      assetType: 'text',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('does not render when open is false', () => {
    render(<AssetImportDialog open={false} context={defaultContext} onClose={vi.fn()} />)
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('renders modal with title 一键入库 when open', () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)
    expect(screen.getByTestId('modal')).toBeTruthy()
    expect(screen.getByTestId('modal-title').textContent).toBe('一键入库')
  })

  it('pre-fills title from sectionTitle', () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)
    expect(formState.values.title).toBe('系统架构设计')
  })

  it('pre-fills content from selectedText', () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)
    expect(formState.values.content).toBe(defaultContext.selectedText)
  })

  it('falls back to first 50 chars of selectedText for title when sectionTitle is empty', () => {
    const longText = 'A'.repeat(60) + '\n' + 'B'.repeat(20)
    const context: AssetImportContext = {
      selectedText: longText,
      sectionTitle: '',
      sourceProject: null,
      sourceSection: null,
    }

    render(<AssetImportDialog open={true} context={context} onClose={vi.fn()} />)

    // The component replaces newlines with spaces, then slices to 50 chars
    const expected = ('A'.repeat(60) + ' ' + 'B'.repeat(20)).slice(0, 50)
    expect(formState.values.title).toBe(expected)
  })

  it('sets default assetType to text', () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)
    expect(formState.values.assetType).toBe('text')
  })

  it('tag editor add creates a tag and shows it', async () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)

    // The TagEditor captures its onAdd prop; invoke it
    await act(async () => {
      capturedTagEditorProps!.onAdd('测试标签')
    })

    await waitFor(() => {
      expect(capturedTagEditorProps!.tags).toHaveLength(1)
      expect(capturedTagEditorProps!.tags[0].name).toBe('测试标签')
    })
  })

  it('tag editor remove works', async () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)

    // Add then remove
    await act(async () => {
      capturedTagEditorProps!.onAdd('要删除')
    })

    await waitFor(() => {
      expect(capturedTagEditorProps!.tags).toHaveLength(1)
    })

    await act(async () => {
      capturedTagEditorProps!.onRemove('要删除')
    })

    await waitFor(() => {
      expect(capturedTagEditorProps!.tags).toHaveLength(0)
    })
  })

  it('submit calls createAsset with correct input', async () => {
    const mockOnClose = vi.fn()

    render(<AssetImportDialog open={true} context={defaultContext} onClose={mockOnClose} />)

    // Add a tag
    await act(async () => {
      capturedTagEditorProps!.onAdd('架构')
    })

    // Click OK button to submit
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'))
    })

    await waitFor(() => {
      expect(mockCreateAsset).toHaveBeenCalledWith({
        title: '系统架构设计',
        content: '选中的一段很长的文本内容用于测试截断和填充行为',
        assetType: 'text',
        sourceProject: 'proj-1',
        sourceSection: 'sec-1',
        tagNames: ['架构'],
      })
    })

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('cancel closes dialog', () => {
    const mockOnClose = vi.fn()
    render(<AssetImportDialog open={true} context={defaultContext} onClose={mockOnClose} />)

    fireEvent.click(screen.getByTestId('modal-cancel'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('required field validation rules are defined for title, content, assetType', () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)

    expect(formState.rules.title).toBeDefined()
    expect(formState.rules.title.some((r) => r.required === true)).toBe(true)

    expect(formState.rules.content).toBeDefined()
    expect(formState.rules.content.some((r) => r.required === true)).toBe(true)

    expect(formState.rules.assetType).toBeDefined()
    expect(formState.rules.assetType.some((r) => r.required === true)).toBe(true)
  })

  it('does not call createAsset when validation fails', async () => {
    mockValidateFields.mockRejectedValue(new Error('Validation failed'))

    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok'))
    })

    await waitFor(() => {
      expect(mockValidateFields).toHaveBeenCalled()
    })

    expect(mockCreateAsset).not.toHaveBeenCalled()
  })

  it('duplicate tag names are not added', async () => {
    render(<AssetImportDialog open={true} context={defaultContext} onClose={vi.fn()} />)

    await act(async () => {
      capturedTagEditorProps!.onAdd('重复')
    })
    await act(async () => {
      capturedTagEditorProps!.onAdd('重复')
    })

    await waitFor(() => {
      expect(capturedTagEditorProps!.tags).toHaveLength(1)
    })
  })
})
