import type { ReactNode } from 'react'

interface WorkspaceLayoutProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  statusBar: ReactNode
  /**
   * Center column max-width cap in px, or `null` to disable capping (fluid).
   *
   * Defaults to `null` (fluid) — center column fills the remaining space
   * between OutlinePanel and AnnotationPanel. Inner views own their own
   * typography cap (e.g. Plate editor internally gates prose line-length).
   *
   * Pass a number to force a reading-optimised cap on a per-stage basis.
   */
  centerMaxWidth?: number | null
}

export function WorkspaceLayout({
  left,
  center,
  right,
  statusBar,
  centerMaxWidth = null,
}: WorkspaceLayoutProps): React.JSX.Element {
  const capped = centerMaxWidth !== null
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden" data-testid="workspace-layout">
      {/* Three-column area */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Left: Outline panel */}
        {left}

        {/* Center: Main content. maxWidth governed by stage via centerMaxWidth. */}
        <main
          className="flex min-w-[600px] flex-1 flex-col overflow-y-auto"
          data-testid="workspace-main"
          data-center-variant={capped ? 'reading' : 'fluid'}
        >
          <div
            className={`${capped ? 'mx-auto' : ''} flex w-full flex-1 flex-col overflow-x-auto`}
            style={{
              maxWidth: capped ? centerMaxWidth : undefined,
              padding: '0 var(--spacing-lg)',
            }}
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
