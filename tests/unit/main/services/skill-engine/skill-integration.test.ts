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

  it('should expose style and diagramType arguments for AI diagram integration', async () => {
    await loader.loadAll()
    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()

    // Story 3.9: SKILL.md must declare arguments: [$style, $diagramType]
    expect(skill!.frontmatter.arguments).toBeDefined()
    expect(skill!.frontmatter.arguments).toContain('$style')
    expect(skill!.frontmatter.arguments).toContain('$diagramType')
  })

  it('should have raw-SVG-only output contract in body', async () => {
    await loader.loadAll()
    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()

    // Story 3.9: Body must reference output contract for SVG-only output
    expect(skill!.body).toContain('Output Contract')
    expect(skill!.body).toContain('<svg')
  })

  it('should consume $style and $diagramType in body', async () => {
    await loader.loadAll()
    const skill = loader.getSkill('fireworks-tech-graph')
    expect(skill).toBeDefined()

    // skill-executor only replaces placeholders that are actually referenced in body
    expect(skill!.body).toContain('$style')
    expect(skill!.body).toContain('$diagramType')
  })

  it('should list skills correctly', async () => {
    await loader.loadAll()
    const list = loader.listSkills()
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list.some((s) => s.name === 'fireworks-tech-graph')).toBe(true)
  })
})
