import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { TourProps } from 'antd'
import { FogMapView } from '@renderer/modules/analysis/components/FogMapView'
import type { FogMapItem, FogMapSummary, RequirementItem } from '@shared/analysis-types'

vi.mock('@ant-design/icons', () => ({
  LoadingOutlined: () => <span />,
  ThunderboltOutlined: () => <span />,
  ExclamationCircleOutlined: () => <span />,
  ReloadOutlined: () => <span />,
  CheckOutlined: () => <span />,
  QuestionCircleOutlined: () => <span />,
}))

vi.mock('@renderer/modules/analysis/components/FogMapCard', () => ({
  FogMapCard: ({ item }: { item: FogMapItem }) => <div>{item.requirement.description}</div>,
}))

vi.mock('antd', async () => {
  const React = await import('react')

  const Button = ({
    children,
    onClick,
    'data-testid': testId,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    'data-testid'?: string
  }): React.JSX.Element => (
    <button data-testid={testId} onClick={onClick}>
      {children}
    </button>
  )

  const Progress = ({ percent }: { percent?: number }): React.JSX.Element => (
    <div>{percent ?? 0}</div>
  )

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

  const Collapse = ({
    items,
  }: {
    items: Array<{ key: string; label: React.ReactNode; children: React.ReactNode }>
  }): React.JSX.Element => (
    <div>
      {items.map((item) => (
        <section key={item.key}>
          <div>{item.label}</div>
          <div>{item.children}</div>
        </section>
      ))}
    </div>
  )

  const Popover = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <>{children}</>
  )
  const Popconfirm = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
    <>{children}</>
  )

  const Tour = ({
    open,
    steps,
  }: {
    open?: boolean
    steps?: TourProps['steps']
  }): React.JSX.Element => {
    const [targetsReady, setTargetsReady] = React.useState('pending')

    React.useEffect(() => {
      if (!open || !steps) {
        setTargetsReady('closed')
        return
      }

      const resolved = steps.map((step) => String(Boolean(step.target?.()))).join(',')
      setTargetsReady(resolved)
    }, [open, steps])

    return (
      <div data-open={String(Boolean(open))} data-targets-ready={targetsReady} data-testid="tour" />
    )
  }

  return {
    Alert,
    Button,
    Collapse,
    Popconfirm,
    Popover,
    Progress,
    Tour,
  }
})

const requirements: RequirementItem[] = [
  {
    id: 'req-1',
    sequenceNumber: 1,
    description: '系统应支持分布式架构',
    sourcePages: [1],
    category: 'technical',
    priority: 'high',
    status: 'extracted',
  },
]

const clearFogMap: FogMapItem[] = [
  {
    id: 'cert-1',
    requirementId: 'req-1',
    certaintyLevel: 'clear',
    reason: '需求已经足够明确',
    suggestion: '无需补充确认',
    confirmed: false,
    confirmedAt: null,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    requirement: requirements[0],
  },
]

const clearSummary: FogMapSummary = {
  total: 1,
  clear: 1,
  ambiguous: 0,
  risky: 0,
  confirmed: 0,
  fogClearingPercentage: 100,
}

describe('FogMapView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps all three first-time tour targets anchored even when no items need confirmation', async () => {
    render(
      <FogMapView
        fogMap={clearFogMap}
        fogMapSummary={clearSummary}
        requirements={requirements}
        generating={false}
        progress={100}
        progressMessage=""
        error={null}
        onGenerate={vi.fn()}
        onConfirm={vi.fn()}
        onBatchConfirm={vi.fn()}
        onNavigateToRequirements={vi.fn()}
      />
    )

    const tour = screen.getByTestId('tour')
    expect(tour).toHaveAttribute('data-open', 'true')

    await waitFor(() => {
      expect(tour).toHaveAttribute('data-targets-ready', 'true,true,true')
    })
  })
})
