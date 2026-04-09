import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('userStore', () => {
  let useUserStore: typeof import('@renderer/stores/userStore').useUserStore

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@renderer/stores/userStore')
    useUserStore = mod.useUserStore
    // Reset to initial state (bypass persist)
    useUserStore.setState({
      currentUser: { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
      knownUsers: [
        { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
        { id: 'user:zhang-zong', displayName: '张总', roleLabel: '售前总监' },
        { id: 'user:li-jingli', displayName: '李经理', roleLabel: '商务经理' },
      ],
    })
  })

  it('defaults to user:default', () => {
    const state = useUserStore.getState()
    expect(state.currentUser.id).toBe('user:default')
    expect(state.currentUser.displayName).toBe('我')
  })

  it('has three known users', () => {
    expect(useUserStore.getState().knownUsers).toHaveLength(3)
  })

  describe('setCurrentUser', () => {
    it('switches to known user by id', () => {
      useUserStore.getState().setCurrentUser('user:zhang-zong')

      expect(useUserStore.getState().currentUser.id).toBe('user:zhang-zong')
      expect(useUserStore.getState().currentUser.displayName).toBe('张总')
    })

    it('does nothing for unknown id', () => {
      useUserStore.getState().setCurrentUser('user:unknown')

      expect(useUserStore.getState().currentUser.id).toBe('user:default')
    })
  })

  describe('addCustomUser', () => {
    it('creates a new custom user with stable slug-based id', () => {
      const user = useUserStore.getState().addCustomUser('王工')

      expect(user.id).toBe('user:custom:王工')
      expect(user.displayName).toBe('王工')
      expect(user.roleLabel).toBe('自定义用户')
      expect(useUserStore.getState().knownUsers).toHaveLength(4)
    })

    it('deduplicates same name', () => {
      const first = useUserStore.getState().addCustomUser('王工')
      const second = useUserStore.getState().addCustomUser('王工')

      expect(first.id).toBe(second.id)
      expect(useUserStore.getState().knownUsers).toHaveLength(4)
    })

    it('trims whitespace in display name', () => {
      const user = useUserStore.getState().addCustomUser('  赵经理  ')

      expect(user.displayName).toBe('赵经理')
    })
  })
})
