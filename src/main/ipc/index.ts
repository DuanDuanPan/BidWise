import { registerProjectHandlers } from './project-handlers'

// Thin dispatch layer — business logic lives in services/
export function registerIpcHandlers(): void {
  registerProjectHandlers()
}
