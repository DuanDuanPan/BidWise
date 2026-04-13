export function getNativeFilePath(file: File): string {
  const preloadPath = window.api.getPathForFile(file)
  if (preloadPath) {
    return preloadPath
  }

  const legacyPath = (file as File & { path?: string }).path
  return typeof legacyPath === 'string' ? legacyPath : ''
}
