import { useState, useEffect, useCallback, useRef } from 'react'
import { CommentOutlined, RobotOutlined } from '@ant-design/icons'
import { Badge, Tooltip } from 'antd'

interface AnnotationPanelProps {
  collapsed: boolean
  isCompact: boolean
  onToggle: () => void
  /** Number of chapters currently being generated */
  generatingCount?: number
}

export function AnnotationPanel({
  collapsed,
  isCompact,
  onToggle,
  generatingCount = 0,
}: AnnotationPanelProps): React.JSX.Element {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const iconBarRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const closeFlyout = useCallback(() => {
    setFlyoutOpen(false)
    // Return focus to trigger button
    triggerRef.current?.focus()
  }, [])

  const toggleFlyout = useCallback(() => {
    setFlyoutOpen((prev) => !prev)
  }, [])

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutOpen) return

    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        iconBarRef.current &&
        !iconBarRef.current.contains(target)
      ) {
        closeFlyout()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [flyoutOpen, closeFlyout])

  // Close flyout on Escape
  useEffect(() => {
    if (!flyoutOpen) return

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFlyout()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [flyoutOpen, closeFlyout])

  // Focus management: move focus into flyout when opened
  useEffect(() => {
    if (flyoutOpen && flyoutRef.current) {
      flyoutRef.current.focus()
    }
  }, [flyoutOpen])

  // Compact mode + collapsed: show icon bar
  if (isCompact && collapsed) {
    return (
      <div className="relative shrink-0" style={{ width: 48 }}>
        {/* Icon bar */}
        <div
          ref={iconBarRef}
          className="flex h-full flex-col items-center pt-3"
          style={{
            width: 48,
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-content)',
          }}
          data-testid="annotation-icon-bar"
        >
          <Tooltip title="智能批注" placement="left">
            <button
              ref={triggerRef}
              type="button"
              className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-2 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
              onClick={toggleFlyout}
              aria-expanded={flyoutOpen}
              aria-controls="annotation-flyout"
              aria-label="智能批注"
              data-testid="annotation-icon-button"
            >
              <Badge count={0} size="small" offset={[4, -4]}>
                <CommentOutlined style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }} />
              </Badge>
            </button>
          </Tooltip>
        </div>

        {/* Flyout panel */}
        {flyoutOpen && (
          <div
            ref={flyoutRef}
            id="annotation-flyout"
            role="dialog"
            aria-label="智能批注面板"
            tabIndex={-1}
            className="absolute top-0 h-full"
            style={{
              right: 48,
              width: 320,
              zIndex: 10,
              backgroundColor: 'var(--color-bg-content)',
              borderLeft: '1px solid var(--color-border)',
              animation: 'flyout-slide-in var(--duration-panel) var(--ease-in-out)',
            }}
            data-testid="annotation-flyout"
          >
            <div className="flex h-full flex-col">
              <div
                className="flex shrink-0 items-center justify-between px-4"
                style={{ height: 48, borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-h4">智能批注</span>
                  <Badge count={0} size="small" />
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center p-4">
                <p
                  className="text-caption text-center"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  批注面板将在批注模块（Epic 4）中加载
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Standard mode, collapsed: narrow strip with expand button
  if (collapsed) {
    return (
      <aside
        id="annotation-panel"
        role="complementary"
        aria-label="智能批注"
        className="shrink-0"
        style={{
          width: 40,
          borderLeft: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-content)',
          transition: 'width var(--duration-panel) var(--ease-in-out)',
        }}
        data-testid="annotation-panel"
      >
        <div className="flex h-full flex-col items-center pt-3" style={{ width: 40 }}>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
            onClick={onToggle}
            aria-expanded={false}
            aria-controls="annotation-panel"
            aria-label="展开智能批注"
            data-testid="annotation-toggle"
          >
            <CommentOutlined style={{ fontSize: 14 }} />
          </button>
        </div>
      </aside>
    )
  }

  // Standard mode, expanded: full panel
  return (
    <aside
      id="annotation-panel"
      role="complementary"
      aria-label="智能批注"
      aria-live="polite"
      className="shrink-0 overflow-hidden"
      style={{
        width: 320,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-content)',
        transition: 'width var(--duration-panel) var(--ease-in-out)',
      }}
      data-testid="annotation-panel"
    >
      <div className="flex h-full flex-col" style={{ width: 320 }}>
        {/* Title bar */}
        <div
          className="flex shrink-0 items-center justify-between px-4"
          style={{ height: 48, borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-h4">智能批注</span>
            <Badge count={0} size="small" />
          </div>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
            onClick={onToggle}
            aria-expanded={true}
            aria-controls="annotation-panel"
            aria-label="折叠智能批注"
            data-testid="annotation-toggle"
          >
            <CommentOutlined style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Content area — placeholder for Epic 4 */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          {generatingCount > 0 && (
            <div
              className="flex w-full items-center gap-2 rounded-md p-3"
              style={{ backgroundColor: 'var(--color-bg-global)' }}
              data-testid="annotation-generating-summary"
            >
              <RobotOutlined style={{ color: 'var(--color-brand)' }} />
              <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>
                {generatingCount} 个章节正在生成...
              </span>
            </div>
          )}
          <p className="text-caption text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            批注面板将在批注模块（Epic 4）中加载
          </p>
        </div>
      </div>
    </aside>
  )
}
