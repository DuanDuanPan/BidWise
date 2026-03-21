import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'

interface OutlinePanelProps {
  collapsed: boolean
  onToggle: () => void
}

export function OutlinePanel({ collapsed, onToggle }: OutlinePanelProps): React.JSX.Element {
  return (
    <aside
      id="outline-panel"
      role="complementary"
      aria-label="文档大纲"
      className="shrink-0 overflow-hidden"
      style={{
        width: collapsed ? 40 : 240,
        backgroundColor: 'var(--color-bg-sidebar)',
        transition: 'width var(--duration-panel) var(--ease-in-out)',
        borderRight: '1px solid var(--color-border)',
      }}
      data-testid="outline-panel"
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center pt-3" style={{ width: 40 }}>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
            onClick={onToggle}
            aria-expanded={false}
            aria-controls="outline-panel"
            aria-label="展开文档大纲"
            data-testid="outline-toggle"
          >
            <MenuUnfoldOutlined style={{ fontSize: 14 }} />
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col" style={{ width: 240 }}>
          {/* Title bar */}
          <div
            className="flex shrink-0 items-center justify-between px-4"
            style={{ height: 48, borderBottom: '1px solid var(--color-border)' }}
          >
            <span className="text-h4">文档大纲</span>
            <button
              type="button"
              className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
              onClick={onToggle}
              aria-expanded={true}
              aria-controls="outline-panel"
              aria-label="折叠文档大纲"
              data-testid="outline-toggle"
            >
              <MenuFoldOutlined style={{ fontSize: 14 }} />
            </button>
          </div>

          {/* Content area — placeholder for Story 3.2 */}
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-caption text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              大纲内容将在编辑器模块（Story 3.2）中加载
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
