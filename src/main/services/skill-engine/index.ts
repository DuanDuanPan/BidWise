import { createLogger } from '@main/utils/logger'
import { SkillLoader } from './skill-loader'
import { SkillExecutor } from './skill-executor'

const logger = createLogger('skill-engine')

export const skillLoader = new SkillLoader()
export const skillExecutor = new SkillExecutor()

export async function initSkillEngine(): Promise<void> {
  try {
    const skills = await skillLoader.loadAll()
    logger.info(`Skill 引擎初始化完成，已加载 ${skills.size} 个 skill`)
  } catch (err) {
    logger.warn(`Skill 引擎初始化失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}
