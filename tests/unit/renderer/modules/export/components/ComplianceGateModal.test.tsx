import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { ComplianceGateModal } from '@modules/export/components/ComplianceGateModal'
import type { ExportComplianceGate } from '@shared/analysis-types'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

const blockedGate: ExportComplianceGate = {
  status: 'blocked',
  canExport: false,
  blockingItems: [
    {
      mandatoryItemId: 'mi-1',
      content: '必须提供资质证书',
      linkedRequirementId: 'req-1',
      coverageStatus: 'uncovered',
    },
    {
      mandatoryItemId: 'mi-2',
      content: '必须包含技术方案',
      linkedRequirementId: null,
      coverageStatus: 'unlinked',
    },
    {
      mandatoryItemId: 'mi-3',
      content: '必须提供相关案例',
      linkedRequirementId: 'req-3',
      coverageStatus: 'partial',
    },
  ],
  complianceRate: 25,
  message: '必做项合规检查未通过：3 个必做项尚未完全覆盖',
}

const notReadyGate: ExportComplianceGate = {
  status: 'not-ready',
  canExport: false,
  blockingItems: [],
  complianceRate: 0,
  message: '尚未完成必做项检测',
}

describe('ComplianceGateModal @story-7-1', () => {
  afterEach(() => {
    cleanup()
  })

  describe('blocked state', () => {
    it('renders blocking items with correct tags', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={blockedGate}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      expect(screen.getByText('必须提供资质证书')).toBeInTheDocument()
      expect(screen.getByText('必须包含技术方案')).toBeInTheDocument()
      expect(screen.getByText('必须提供相关案例')).toBeInTheDocument()
      expect(screen.getByText('未覆盖')).toBeInTheDocument()
      expect(screen.getByText('未关联')).toBeInTheDocument()
      expect(screen.getByText('部分覆盖')).toBeInTheDocument()
    })

    it('shows 返回修改 and 仍然导出 buttons', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={blockedGate}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      expect(screen.getByTestId('compliance-gate-back')).toBeInTheDocument()
      expect(screen.getByTestId('compliance-gate-force')).toBeInTheDocument()
    })

    it('calls onClose when 返回修改 is clicked', () => {
      const onClose = vi.fn()
      render(
        <ComplianceGateModal
          open={true}
          gateData={blockedGate}
          onClose={onClose}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      fireEvent.click(screen.getByTestId('compliance-gate-back'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('requires two-step confirmation for force export', () => {
      const onForceExport = vi.fn()
      render(
        <ComplianceGateModal
          open={true}
          gateData={blockedGate}
          onClose={vi.fn()}
          onForceExport={onForceExport}
        />,
        { wrapper: Wrapper }
      )

      // First click: shows confirmation
      fireEvent.click(screen.getByTestId('compliance-gate-force'))
      expect(onForceExport).not.toHaveBeenCalled()
      expect(screen.getByTestId('compliance-gate-confirm-force')).toBeInTheDocument()
      expect(screen.getByTestId('compliance-gate-force-confirm-alert')).toBeInTheDocument()

      // Second click: actually exports
      fireEvent.click(screen.getByTestId('compliance-gate-confirm-force'))
      expect(onForceExport).toHaveBeenCalledOnce()
    })
  })

  describe('not-ready state', () => {
    it('shows not-ready alert message', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={notReadyGate}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      expect(screen.getByTestId('compliance-gate-not-ready-alert')).toBeInTheDocument()
    })

    it('only shows 返回修改 button (no force export)', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={notReadyGate}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      expect(screen.getByTestId('compliance-gate-back')).toBeInTheDocument()
      expect(screen.queryByTestId('compliance-gate-force')).not.toBeInTheDocument()
    })
  })

  describe('modal behavior', () => {
    it('has closable=false (no X button)', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={blockedGate}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      // Ant Design Modal with closable=false should not render close button
      const closeBtn = document.querySelector('.ant-modal-close')
      expect(closeBtn).toBeNull()
    })

    it('does not render when gateData is null', () => {
      render(
        <ComplianceGateModal
          open={true}
          gateData={null}
          onClose={vi.fn()}
          onForceExport={vi.fn()}
        />,
        { wrapper: Wrapper }
      )

      expect(screen.queryByTestId('compliance-gate-modal')).not.toBeInTheDocument()
    })
  })
})
