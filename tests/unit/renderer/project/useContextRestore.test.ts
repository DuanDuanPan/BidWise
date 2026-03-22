import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useContextRestore } from '@modules/project/hooks/useContextRestore'

describe('@story-1-8 useContextRestore', () => {
  it('returns null for unsaved project', () => {
    const { result } = renderHook(() => useContextRestore())
    expect(result.current.restoreContext('unknown-id')).toBeNull()
  })

  it('saves and restores context for a project', () => {
    const { result } = renderHook(() => useContextRestore())

    act(() => {
      result.current.saveContext('p1', {
        sopStage: 'solution-design',
        lastVisitedAt: '2026-03-21T12:00:00.000Z',
      })
    })

    const ctx = result.current.restoreContext('p1')
    expect(ctx).toEqual({
      sopStage: 'solution-design',
      lastVisitedAt: '2026-03-21T12:00:00.000Z',
    })
  })

  it('caches contexts independently per project', () => {
    const { result } = renderHook(() => useContextRestore())

    act(() => {
      result.current.saveContext('p1', {
        sopStage: 'delivery',
        lastVisitedAt: '2026-03-21T10:00:00.000Z',
      })
      result.current.saveContext('p2', {
        sopStage: 'requirements-analysis',
        lastVisitedAt: '2026-03-21T11:00:00.000Z',
      })
    })

    expect(result.current.restoreContext('p1')?.sopStage).toBe('delivery')
    expect(result.current.restoreContext('p2')?.sopStage).toBe('requirements-analysis')
  })

  it('overwrites previous context for same project', () => {
    const { result } = renderHook(() => useContextRestore())

    act(() => {
      result.current.saveContext('p1', {
        sopStage: 'solution-design',
        lastVisitedAt: '2026-03-21T10:00:00.000Z',
      })
    })

    act(() => {
      result.current.saveContext('p1', {
        sopStage: 'proposal-writing',
        lastVisitedAt: '2026-03-21T12:00:00.000Z',
      })
    })

    expect(result.current.restoreContext('p1')?.sopStage).toBe('proposal-writing')
  })
})
