import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AutoSaveIndicator } from '@modules/editor/components/AutoSaveIndicator'
import { getAutoSaveIndicatorStatus } from '@modules/editor/lib/autoSaveIndicator'

describe('AutoSaveIndicator', () => {
  it('maps auto-save state to the expected status', () => {
    expect(
      getAutoSaveIndicatorStatus({
        dirty: false,
        saving: false,
        lastSavedAt: null,
        error: null,
      })
    ).toBe('saved')
    expect(
      getAutoSaveIndicatorStatus({
        dirty: true,
        saving: false,
        lastSavedAt: null,
        error: null,
      })
    ).toBe('unsaved')
    expect(
      getAutoSaveIndicatorStatus({
        dirty: false,
        saving: true,
        lastSavedAt: null,
        error: null,
      })
    ).toBe('saving')
    expect(
      getAutoSaveIndicatorStatus({
        dirty: true,
        saving: false,
        lastSavedAt: null,
        error: '保存失败',
      })
    ).toBe('error')
  })

  it('renders retry UI when autoSave.error is present', () => {
    const onRetry = vi.fn()

    render(
      <AutoSaveIndicator
        autoSave={{
          dirty: true,
          saving: false,
          lastSavedAt: null,
          error: '保存失败',
        }}
        onRetry={onRetry}
      />
    )

    expect(screen.getByTestId('auto-save-status')).toHaveTextContent('保存失败')
    fireEvent.click(screen.getByTestId('auto-save-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
