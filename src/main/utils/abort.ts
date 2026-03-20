type AbortErrorLike = Error & { name: 'AbortError'; cause?: unknown }

export function makeAbortError(
  signal: AbortSignal,
  fallbackMessage = 'The operation was aborted'
): AbortErrorLike {
  const reason = signal.reason
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : fallbackMessage
  const error = new Error(message) as AbortErrorLike
  error.name = 'AbortError'
  error.cause = reason
  return error
}

export function throwIfAborted(signal: AbortSignal, fallbackMessage?: string): void {
  if (!signal.aborted) {
    return
  }

  throw makeAbortError(signal, fallbackMessage)
}

export function isAbortError(error: unknown): error is AbortErrorLike {
  return error instanceof Error && error.name === 'AbortError'
}
