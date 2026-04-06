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
  createdAt: string
  updatedAt: string
}

export interface CreateAnnotationInput {
  projectId: string
  sectionId: string
  type: AnnotationType
  content: string
  author: string
}

export interface UpdateAnnotationInput {
  id: string
  content?: string
  status?: AnnotationStatus
}

export interface DeleteAnnotationInput {
  id: string
}

export interface ListAnnotationsInput {
  projectId: string
  sectionId?: string
}
