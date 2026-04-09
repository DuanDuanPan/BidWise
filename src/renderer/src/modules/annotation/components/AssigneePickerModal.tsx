import { useState } from 'react'
import { Modal, Select, Input, Button } from 'antd'
import { useUserStore } from '@renderer/stores/userStore'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import type { AnnotationRecord } from '@shared/annotation-types'

const { TextArea } = Input

interface AssigneePickerModalProps {
  annotation: AnnotationRecord | null
  open: boolean
  onClose: () => void
}

export function AssigneePickerModal({
  annotation,
  open,
  onClose,
}: AssigneePickerModalProps): React.JSX.Element {
  const knownUsers = useUserStore((s) => s.knownUsers)
  const currentUser = useUserStore((s) => s.currentUser)
  const addCustomUser = useUserStore((s) => s.addCustomUser)
  const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation)
  const createAnnotation = useAnnotationStore((s) => s.createAnnotation)

  const [selectedAssignee, setSelectedAssignee] = useState<string | undefined>(undefined)
  const [supplementNote, setSupplementNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleClose = (): void => {
    setSelectedAssignee(undefined)
    setSupplementNote('')
    setSubmitting(false)
    onClose()
  }

  const handleConfirm = async (): Promise<void> => {
    if (!annotation || !selectedAssignee) return

    setSubmitting(true)
    try {
      const ok = await updateAnnotation({
        id: annotation.id,
        status: 'needs-decision',
        assignee: selectedAssignee,
      })

      if (ok && supplementNote.trim()) {
        await createAnnotation({
          projectId: annotation.projectId,
          sectionId: annotation.sectionId,
          type: 'human',
          content: supplementNote.trim(),
          author: currentUser.id,
          parentId: annotation.id,
        })
      }

      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  const userOptions = knownUsers
    .filter((u) => u.id !== currentUser.id)
    .map((u) => ({
      value: u.id,
      label: `${u.displayName}（${u.roleLabel}）`,
    }))

  const handleSearch = (value: string): void => {
    if (!value.trim()) return
    const exists = knownUsers.some(
      (u) => u.displayName === value.trim() || u.id === `user:custom:${value.trim().toLowerCase()}`
    )
    if (!exists) {
      // Will be created on select
    }
  }

  const handleSelect = (value: string): void => {
    const exists = knownUsers.find((u) => u.id === value)
    if (exists) {
      setSelectedAssignee(value)
    } else {
      // Treat as custom user display name
      const newUser = addCustomUser(value)
      setSelectedAssignee(newUser.id)
    }
  }

  return (
    <Modal
      title="选择指导人"
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnClose
      data-testid="assignee-picker-modal"
    >
      {annotation && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              padding: 8,
              backgroundColor: '#F5F5F5',
              borderRadius: 6,
              fontSize: 13,
              color: '#595959',
              marginBottom: 12,
            }}
          >
            {annotation.content.length > 100
              ? `${annotation.content.slice(0, 100)}...`
              : annotation.content}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>指导人</div>
            <Select
              style={{ width: '100%' }}
              placeholder="选择或输入指导人"
              showSearch
              value={selectedAssignee}
              options={userOptions}
              onSearch={handleSearch}
              onSelect={handleSelect}
              onChange={(value) => setSelectedAssignee(value)}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
              }
              data-testid="assignee-select"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>补充说明（可选）</div>
            <TextArea
              rows={3}
              placeholder="添加补充说明..."
              value={supplementNote}
              onChange={(e) => setSupplementNote(e.target.value)}
              data-testid="supplement-note-input"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              onClick={handleConfirm}
              disabled={!selectedAssignee}
              loading={submitting}
              data-testid="assignee-confirm-btn"
            >
              确认
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
