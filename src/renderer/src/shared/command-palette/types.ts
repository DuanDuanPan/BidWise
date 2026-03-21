import type { ReactNode } from 'react'

export type CommandCategory = 'navigation' | 'project' | 'action' | 'stage'

export interface Command {
  id: string
  label: string
  category: CommandCategory
  keywords: string[]
  icon?: ReactNode
  shortcut?: string
  action: () => void
  when?: () => boolean
  disabled?: boolean
  badge?: string
}

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: '导航',
  project: '项目',
  action: '操作',
  stage: 'SOP 阶段',
}

export const CATEGORY_ORDER: CommandCategory[] = ['navigation', 'project', 'action', 'stage']
