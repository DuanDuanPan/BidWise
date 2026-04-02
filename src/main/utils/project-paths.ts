import { app } from 'electron'
import { isAbsolute, relative, resolve } from 'path'
import { ValidationError } from './errors'

export function resolveProjectDataPath(projectId: string): string {
  if (!projectId || projectId.trim().length === 0) {
    throw new ValidationError('项目 ID 不能为空')
  }

  const projectsRoot = resolve(app.getPath('userData'), 'data', 'projects')
  const projectPath = resolve(projectsRoot, projectId)
  const relativePath = relative(projectsRoot, projectPath)

  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new ValidationError(`非法项目目录路径: ${projectId}`)
  }

  return projectPath
}
