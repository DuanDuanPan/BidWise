import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '@shared/annotation-types'

export interface AnnotationProjectState {
  items: AnnotationRecord[]
  loading: boolean
  error: string | null
  loaded: boolean
}

export interface AnnotationState {
  projects: Record<string, AnnotationProjectState>
}

interface AnnotationActions {
  loadAnnotations: (projectId: string) => Promise<void>
  createAnnotation: (input: CreateAnnotationInput) => Promise<void>
  updateAnnotation: (input: UpdateAnnotationInput) => Promise<void>
  deleteAnnotation: (id: string, projectId: string) => Promise<void>
  reset: (projectId?: string) => void
}

type AnnotationStore = AnnotationState & AnnotationActions

function createProjectState(overrides?: Partial<AnnotationProjectState>): AnnotationProjectState {
  return {
    items: [],
    loading: false,
    error: null,
    loaded: false,
    ...overrides,
  }
}

function getProjectState(state: AnnotationState, projectId: string): AnnotationProjectState {
  return state.projects[projectId] ?? createProjectState()
}

function updateProject(
  state: AnnotationState,
  projectId: string,
  patch: Partial<AnnotationProjectState>
): AnnotationState {
  return {
    ...state,
    projects: {
      ...state.projects,
      [projectId]: {
        ...getProjectState(state, projectId),
        ...patch,
      },
    },
  }
}

function sortByCreatedAtDesc(items: AnnotationRecord[]): AnnotationRecord[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const useAnnotationStore = create<AnnotationStore>()(
  subscribeWithSelector((set, get) => ({
    projects: {},

    async loadAnnotations(projectId: string): Promise<void> {
      set((state) => updateProject(state, projectId, { loading: true, error: null }))

      try {
        const response = await window.api.annotationList({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              items: sortByCreatedAtDesc(response.data),
              loading: false,
              loaded: true,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              loading: false,
              error: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            loading: false,
            error: (err as Error).message,
          })
        )
      }
    },

    async createAnnotation(input: CreateAnnotationInput): Promise<void> {
      try {
        const response = await window.api.annotationCreate(input)
        if (response.success) {
          set((state) => {
            const project = getProjectState(state, input.projectId)
            return updateProject(state, input.projectId, {
              items: sortByCreatedAtDesc([...project.items, response.data]),
            })
          })
        } else {
          set((state) => updateProject(state, input.projectId, { error: response.error.message }))
        }
      } catch (err) {
        set((state) => updateProject(state, input.projectId, { error: (err as Error).message }))
      }
    },

    async updateAnnotation(input: UpdateAnnotationInput): Promise<void> {
      try {
        const response = await window.api.annotationUpdate(input)
        if (response.success) {
          const updated = response.data
          set((state) => {
            const project = getProjectState(state, updated.projectId)
            return updateProject(state, updated.projectId, {
              items: sortByCreatedAtDesc(
                project.items.map((item) => (item.id === updated.id ? updated : item))
              ),
            })
          })
        } else {
          const allProjects = get().projects
          for (const [pid, ps] of Object.entries(allProjects)) {
            if (ps.items.some((i) => i.id === input.id)) {
              set((state) => updateProject(state, pid, { error: response.error.message }))
              break
            }
          }
        }
      } catch (err) {
        const allProjects = get().projects
        for (const [pid, ps] of Object.entries(allProjects)) {
          if (ps.items.some((i) => i.id === input.id)) {
            set((state) => updateProject(state, pid, { error: (err as Error).message }))
            break
          }
        }
      }
    },

    async deleteAnnotation(id: string, projectId: string): Promise<void> {
      try {
        const response = await window.api.annotationDelete({ id })
        if (response.success) {
          set((state) => {
            const project = getProjectState(state, projectId)
            return updateProject(state, projectId, {
              items: project.items.filter((item) => item.id !== id),
            })
          })
        } else {
          set((state) => updateProject(state, projectId, { error: response.error.message }))
        }
      } catch (err) {
        set((state) => updateProject(state, projectId, { error: (err as Error).message }))
      }
    },

    reset(projectId?: string): void {
      if (projectId) {
        set((state) => ({
          ...state,
          projects: {
            ...state.projects,
            [projectId]: createProjectState(),
          },
        }))
      } else {
        set({ projects: {} })
      }
    },
  }))
)
