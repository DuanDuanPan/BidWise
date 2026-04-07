import { WritingStyleSelector } from './WritingStyleSelector'

interface EditorToolbarProps {
  projectId: string
}

export function EditorToolbar({ projectId }: EditorToolbarProps): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-end border-b border-gray-200 px-4 py-1.5"
      data-testid="editor-toolbar"
    >
      <WritingStyleSelector projectId={projectId} />
    </div>
  )
}
