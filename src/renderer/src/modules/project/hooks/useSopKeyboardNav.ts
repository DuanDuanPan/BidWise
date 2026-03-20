import { useEffect } from 'react'
import { SOP_STAGES } from '../types'
import type { SopStageKey } from '../types'

type ActiveStageKey = Exclude<SopStageKey, 'not-started'>

/**
 * Alt+2~6 快捷键导航到对应 SOP 阶段。
 * Alt+2=方案设计(阶段2), Alt+3=方案撰写(阶段3), ..., Alt+6=交付归档(阶段6)。
 * 阶段 1（需求分析）为进入工作空间时的默认激活阶段，无快捷键。
 */
export function useSopKeyboardNav(navigateToStage: (key: ActiveStageKey) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return

      const num = parseInt(e.key, 10)
      if (num < 2 || num > 6) return

      const stage = SOP_STAGES.find((s) => s.altKey === num)
      if (stage) {
        e.preventDefault()
        navigateToStage(stage.key)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateToStage])
}
