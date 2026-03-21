import type { ReactNode } from 'react'

interface WorkspaceLayoutProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  statusBar: ReactNode
}

export function WorkspaceLayout({
  left,
  center,
  right,
  statusBar,
}: WorkspaceLayoutProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden" data-testid="workspace-layout">
      {/* Three-column area */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Left: Outline panel */}
        {left}

        {/* Center: Main content with 800px max-width */}
        <main
          className="flex min-w-[600px] flex-1 flex-col overflow-y-auto"
          data-testid="workspace-main"
        >
          <div
            className="mx-auto flex w-full flex-1 flex-col overflow-x-auto"
            style={{ maxWidth: 800, padding: '0 var(--spacing-lg)' }}
          >
            {center}
          </div>
        </main>

        {/* Right: Annotation panel */}
        {right}
      </div>

      {/* Bottom status bar */}
      {statusBar}
    </div>
  )
}
