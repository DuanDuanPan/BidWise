/** SKILL.md frontmatter 解析结果 */
export interface SkillFrontmatter {
  name: string
  description: string
  arguments?: string[]
  argumentHint?: string
  model?: string
  shell?: 'bash' | 'powershell'
  maxTokens?: number
  temperature?: number
}

/** 解析后的完整 skill */
export interface ParsedSkill {
  name: string
  dirPath: string
  frontmatter: SkillFrontmatter
  body: string
}

/** skill agent 执行上下文（通过 AgentExecuteRequest.context 传入） */
export interface SkillExecuteContext {
  skillName: string
  args?: string
  userMessage?: string
  sessionId?: string
}
