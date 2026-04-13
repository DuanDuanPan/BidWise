import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TenderUploadZone } from '@modules/analysis/components/TenderUploadZone'

const { importTenderMock, mockMessageError } = vi.hoisted(() => ({
  importTenderMock: vi.fn(),
  mockMessageError: vi.fn(),
}))

vi.mock('@ant-design/icons', () => ({
  InboxOutlined: () => <span />,
  FileTextOutlined: () => <span />,
  ReloadOutlined: () => <span />,
}))

vi.mock('@renderer/stores', () => ({
  useAnalysisStore: (selector: (state: object) => unknown) =>
    selector({
      importTender: importTenderMock,
      projects: {},
    }),
  getAnalysisProjectState: () => ({
    tenderMeta: null,
    loading: false,
  }),
}))

vi.mock('antd', () => {
  const Dragger = ({
    beforeUpload,
    children,
  }: {
    beforeUpload?: (file: File) => boolean
    children?: React.ReactNode
  }): React.JSX.Element => (
    <div>
      <button
        data-testid="mock-dragger"
        onClick={() =>
          beforeUpload?.(
            new File(['seed'], 'tender.docx', {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            })
          )
        }
      >
        上传
      </button>
      {children}
    </div>
  )

  const Upload = { Dragger }

  return {
    Upload,
    message: {
      error: mockMessageError,
    },
  }
})

describe('TenderUploadZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getPathForFile: vi.fn(() => '/resolved/tender.docx'),
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('starts tender import with the preload-resolved file path', () => {
    render(<TenderUploadZone projectId="proj-1" disabled={false} />)

    fireEvent.click(screen.getByTestId('mock-dragger'))

    expect(importTenderMock).toHaveBeenCalledWith('proj-1', '/resolved/tender.docx')
    expect(mockMessageError).not.toHaveBeenCalled()
  })
})
