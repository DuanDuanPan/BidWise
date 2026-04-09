import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserIdentity } from '@shared/user-types'
import { ALPHA_KNOWN_USERS } from '@shared/user-types'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface UserState {
  currentUser: UserIdentity
  knownUsers: UserIdentity[]
}

interface UserActions {
  setCurrentUser: (id: string) => void
  addCustomUser: (displayName: string) => UserIdentity
}

type UserStore = UserState & UserActions

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      currentUser: ALPHA_KNOWN_USERS[0],
      knownUsers: [...ALPHA_KNOWN_USERS],

      setCurrentUser(id: string): void {
        const user = get().knownUsers.find((u) => u.id === id)
        if (user) {
          set({ currentUser: user })
        }
      },

      addCustomUser(displayName: string): UserIdentity {
        const slug = slugify(displayName)
        const customId = `user:custom:${slug}`

        const existing = get().knownUsers.find((u) => u.id === customId)
        if (existing) return existing

        const newUser: UserIdentity = {
          id: customId,
          displayName: displayName.trim(),
          roleLabel: '自定义用户',
        }

        set((state) => ({
          knownUsers: [...state.knownUsers, newUser],
        }))

        return newUser
      },
    }),
    {
      name: 'bidwise-current-user',
      partialize: (state) => ({
        currentUser: state.currentUser,
        knownUsers: state.knownUsers,
      }),
    }
  )
)
