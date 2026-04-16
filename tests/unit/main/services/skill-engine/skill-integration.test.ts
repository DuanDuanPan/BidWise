import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

// ─── Mocks ───

const MOCK_APP_PATH = join(__dirname, '../../../../..')

vi.mock('electron', () => ({
  app: { getAppPath: () => MOCK_APP_PATH },
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { SkillLoader } from '@main/services/skill-engine/skill-loader'

describe('Skill Engine Integration — fireworks-tech-graph', () => {
  let loader: SkillLoader

  beforeEach(() => {
    loader = new SkillLoader()
  })

  it('should load fireworks-tech-graph skill from real skills directory', async () => {
    const skills = await loader.loadAll()

    expect(skills.size).toBeGreaterThanOrEqual(1)

    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()
    expect(skill!.name).toBe('fireworks-tech-graph')
    expect(skill!.frontmatter.description).toContain('diagram')
    expect(skill!.body).toContain('SVG')
    expect(skill!.dirPath).toContain('fireworks-tech-graph')
  })

  it('should parse frontmatter with >- multiline description', async () => {
    await loader.loadAll()
    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()

    // The >- multiline description should be joined into a single line
    expect(skill!.frontmatter.description).not.toContain('\n')
    expect(skill!.frontmatter.description.length).toBeGreaterThan(20)
  })

  it('should have body containing diagram generation instructions', async () => {
    await loader.loadAll()
    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()

    // Body should contain the main workflow content
    expect(skill!.body).toContain('Fireworks Tech Graph')
    expect(skill!.body).toContain('generate-diagram.js')
    expect(skill!.body).toContain('validate-svg.js')
  })

  it('should list skills correctly', async () => {
    await loader.loadAll()
    const list = loader.listSkills()
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list.some((s) => s.name === 'fireworks-tech-graph')).toBe(true)
  })
})
