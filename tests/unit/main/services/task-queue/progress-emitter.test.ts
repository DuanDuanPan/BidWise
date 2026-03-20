import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSend = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      { isDestroyed: () => false, webContents: { send: mockSend } },
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ]),
  },
}))

import { ProgressEmitter } from '@main/services/task-queue/progress-emitter'

describe('ProgressEmitter @story-2-2', () => {
  let emitter: ProgressEmitter

  beforeEach(() => {
    vi.clearAllMocks()
    emitter = new ProgressEmitter()
  })

  it('@p0 should send progress to all windows via webContents.send', () => {
    const event = { taskId: 'task-1', progress: 50, message: 'halfway' }
    emitter.emit(event)

    // 2 windows × 1 emit = 2 calls
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith('task:progress', event)
  })

  it('@p1 should throttle same taskId within 200ms', () => {
    vi.useFakeTimers()

    emitter.emit({ taskId: 'task-1', progress: 10 })
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Within throttle window — should be suppressed
    emitter.emit({ taskId: 'task-1', progress: 20 })
    expect(mockSend).toHaveBeenCalledTimes(2) // still 2

    // Advance past throttle
    vi.advanceTimersByTime(201)
    emitter.emit({ taskId: 'task-1', progress: 30 })
    expect(mockSend).toHaveBeenCalledTimes(4) // 2 more

    vi.useRealTimers()
  })

  it('@p1 should not throttle different taskIds', () => {
    emitter.emit({ taskId: 'task-1', progress: 10 })
    emitter.emit({ taskId: 'task-2', progress: 20 })

    // 2 windows × 2 emits = 4 calls
    expect(mockSend).toHaveBeenCalledTimes(4)
  })

  it('@p1 should skip destroyed windows', async () => {
    const { BrowserWindow } = await import('electron')
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([
      { isDestroyed: () => true, webContents: { send: mockSend } },
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ] as never)

    emitter.emit({ taskId: 'task-1', progress: 50 })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('@p1 should clear throttle state for a task', () => {
    vi.useFakeTimers()

    emitter.emit({ taskId: 'task-1', progress: 10 })
    expect(mockSend).toHaveBeenCalledTimes(2)

    // Clear throttle state
    emitter.clear('task-1')

    // Should emit immediately even within 200ms window
    emitter.emit({ taskId: 'task-1', progress: 100 })
    expect(mockSend).toHaveBeenCalledTimes(4)

    vi.useRealTimers()
  })
})
