export interface UserIdentity {
  id: string
  displayName: string
  roleLabel: string
}

export const ALPHA_KNOWN_USERS: UserIdentity[] = [
  { id: 'user:default', displayName: '我', roleLabel: '售前工程师' },
  { id: 'user:zhang-zong', displayName: '张总', roleLabel: '售前总监' },
  { id: 'user:li-jingli', displayName: '李经理', roleLabel: '商务经理' },
]
