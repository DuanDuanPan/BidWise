export type AnnotationType =
  | 'ai-suggestion'
  | 'asset-recommendation'
  | 'score-warning'
  | 'adversarial'
  | 'human'
  | 'cross-role'

export type AnnotationStatus = 'pending' | 'accepted' | 'rejected' | 'needs-decision'

export interface AnnotationRecord {
  id: string
  projectId: string
  sectionId: string
  type: AnnotationType
  content: string
  author: string
  status: AnnotationStatus
  parentId: string | null
  assignee: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAnnotationInput {
  projectId: string
  sectionId: string
  type: AnnotationType
  content: string
  author: string
  parentId?: string
  assignee?: string
}

export interface UpdateAnnotationInput {
  id: string
  content?: string
  status?: AnnotationStatus
  assignee?: string
}

export interface DeleteAnnotationInput {
  id: string
}

export interface ListAnnotationsInput {
  projectId: string
  sectionId?: string
  includeReplies?: boolean
}
