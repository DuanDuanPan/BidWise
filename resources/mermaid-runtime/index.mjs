/* eslint-disable @typescript-eslint/explicit-function-return-type */

import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import mermaid from 'mermaid'

const MERMAID_VALIDATION_CONFIG = {
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'strict',
  logLevel: 'error',
}

function resolveMermaidRuntime(holder) {
  let current = holder

  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (typeof current.parse === 'function' || typeof current.initialize === 'function') {
      return current
    }
    current = current.default
  }

  return null
}

function isMermaidInfrastructureError(message) {
  return (
    message.includes('DOMPurify.') ||
    message.includes('Mermaid parser unavailable') ||
    message.includes('Mermaid runtime bootstrap failed')
  )
}

const dom = new JSDOM('')
const purifier = createDOMPurify(dom.window)
Object.assign(createDOMPurify, purifier)

try {
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  })
} catch {
  // Best-effort globals for libraries that probe browser APIs.
}

const runtime = resolveMermaidRuntime(mermaid)
if (!runtime || typeof runtime.parse !== 'function') {
  throw new Error('Mermaid parser unavailable')
}

if (typeof runtime.initialize === 'function') {
  runtime.initialize(MERMAID_VALIDATION_CONFIG)
}

function respond(message) {
  process.send?.(message)
}

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return

  if (message.type === 'shutdown') {
    process.exit(0)
    return
  }

  if (message.type !== 'validate') return

  const { requestId, source } = message

  try {
    await runtime.parse(source)
    respond({
      type: 'validate:result',
      requestId,
      result: {
        valid: true,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    respond({
      type: 'validate:result',
      requestId,
      result: {
        valid: false,
        error: errorMessage,
        failureKind: isMermaidInfrastructureError(errorMessage) ? 'infrastructure' : undefined,
      },
    })
  }
})

respond({ type: 'ready' })
