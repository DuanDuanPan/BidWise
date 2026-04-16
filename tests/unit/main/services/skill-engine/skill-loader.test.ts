import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock-app' },
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

const mockReaddir = vi.fn()
const mockLstat = vi.fn()
const mockReadFile = vi.fn()

vi.mock('fs', () => ({
  promises: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    lstat: (...args: unknown[]) => mockLstat(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}))

import { SkillLoader } from '@main/services/skill-engine/skill-loader'

describe('SkillLoader', () => {
  let loader: SkillLoader

  beforeEach(() => {
    vi.clearAllMocks()
    loader = new SkillLoader()
  })

  // ─── parseFrontmatter ───

  describe('parseFrontmatter', () => {
    it('should parse single-line key-value pairs', () => {
      const raw = 'name: test-skill\ndescription: A test skill'
      const fm = loader.parseFrontmatter(raw)
      expect(fm.name).toBe('test-skill')
      expect(fm.description).toBe('A test skill')
    })

    it('should parse >- multiline folded scalar', () => {
      const raw = 'description: >-\n  This is a long\n  description text'
      const fm = loader.parseFrontmatter(raw)
      expect(fm.description).toBe('This is a long description text')
    })

    it('should parse inline array arguments', () => {
      const raw = "arguments: ['$file', '$style']"
      const fm = loader.parseFrontmatter(raw)
      expect(fm.arguments).toEqual(['$file', '$style'])
    })

    it('should parse space-separated string arguments', () => {
      const raw = 'arguments: $file $style'
      const fm = loader.parseFrontmatter(raw)
      expect(fm.arguments).toEqual(['$file', '$style'])
    })

    it('should return defaults for empty frontmatter', () => {
      const fm = loader.parseFrontmatter('')
      expect(fm.name).toBe('')
      expect(fm.description).toBe('')
      expect(fm.arguments).toBeUndefined()
    })

    it('should parse model, maxTokens, and temperature', () => {
      const raw = 'model: claude-sonnet-4-5\nmaxTokens: 16384\ntemperature: 0.7'
      const fm = loader.parseFrontmatter(raw)
      expect(fm.model).toBe('claude-sonnet-4-5')
      expect(fm.maxTokens).toBe(16384)
      expect(fm.temperature).toBe(0.7)
    })

    it('should parse argument-hint', () => {
      const raw = 'argument-hint: [file] [style]'
      const fm = loader.parseFrontmatter(raw)
      expect(fm.argumentHint).toBe('[file] [style]')
    })
  })

  // ─── loadAll ───

  describe('loadAll', () => {
    it('should load skills from valid directories', async () => {
      mockReaddir.mockResolvedValue(['skill-a', 'skill-b'])
      mockLstat.mockResolvedValue({ isDirectory: () => true, isSymbolicLink: () => false })
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('skill-a')) {
          return Promise.resolve(
            '---\nname: skill-a\ndescription: Skill A\n---\nDo something for $ARGUMENTS'
          )
        }
        return Promise.resolve('---\nname: skill-b\ndescription: Skill B\n---\nDo another thing')
      })

      const skills = await loader.loadAll()
      expect(skills.size).toBe(2)
      expect(loader.getSkill('skill-a')).toBeDefined()
      expect(loader.getSkill('skill-b')).toBeDefined()
    })

    it('should skip directories without SKILL.md', async () => {
      mockReaddir.mockResolvedValue(['skill-a', 'no-skill'])
      mockLstat.mockResolvedValue({ isDirectory: () => true, isSymbolicLink: () => false })
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('no-skill')) {
          return Promise.reject(new Error('ENOENT'))
        }
        return Promise.resolve('---\nname: skill-a\n---\nBody')
      })

      const skills = await loader.loadAll()
      expect(skills.size).toBe(1)
      expect(loader.getSkill('skill-a')).toBeDefined()
    })

    it('should return empty map when skills directory does not exist', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'))

      const skills = await loader.loadAll()
      expect(skills.size).toBe(0)
      expect(loader.listSkills()).toEqual([])
    })

    it('should warn and overwrite on duplicate names', async () => {
      mockReaddir.mockResolvedValue(['dir-a', 'dir-b'])
      mockLstat.mockResolvedValue({ isDirectory: () => true, isSymbolicLink: () => false })
      mockReadFile.mockResolvedValue('---\nname: same-name\n---\nBody')

      const skills = await loader.loadAll()
      expect(skills.size).toBe(1)
    })

    it('should use directory name when frontmatter has no name', async () => {
      mockReaddir.mockResolvedValue(['my-skill'])
      mockLstat.mockResolvedValue({ isDirectory: () => true, isSymbolicLink: () => false })
      mockReadFile.mockResolvedValue('---\ndescription: No name\n---\nBody')

      await loader.loadAll()
      const skill = loader.getSkill('my-skill')
      expect(skill).toBeDefined()
      expect(skill!.name).toBe('my-skill')
    })
  })

  // ─── getSkill / listSkills cache ───

  describe('cache', () => {
    it('should return undefined for unknown skill', () => {
      expect(loader.getSkill('nonexistent')).toBeUndefined()
    })

    it('should clear cache on reload', async () => {
      mockReaddir.mockResolvedValueOnce(['skill-a'])
      mockLstat.mockResolvedValue({ isDirectory: () => true, isSymbolicLink: () => false })
      mockReadFile.mockResolvedValue('---\nname: skill-a\n---\nBody')
      await loader.loadAll()
      expect(loader.getSkill('skill-a')).toBeDefined()

      mockReaddir.mockResolvedValueOnce([])
      await loader.loadAll()
      expect(loader.getSkill('skill-a')).toBeUndefined()
    })
  })

  // ─── F5: symlink rejection ───

  describe('symlink protection (F5)', () => {
    it('should skip symlinked directories', async () => {
      mockReaddir.mockResolvedValue(['real-skill', 'symlink-skill'])
      mockLstat.mockImplementation((path: string) => {
        if (path.includes('symlink-skill')) {
          return Promise.resolve({ isDirectory: () => true, isSymbolicLink: () => true })
        }
        return Promise.resolve({ isDirectory: () => true, isSymbolicLink: () => false })
      })
      mockReadFile.mockResolvedValue('---\nname: real-skill\n---\nBody')

      const skills = await loader.loadAll()
      expect(skills.size).toBe(1)
      expect(loader.getSkill('real-skill')).toBeDefined()
    })
  })

  // ─── F14: kebab-case key aliases ───

  describe('kebab-case frontmatter keys (F14)', () => {
    it('should parse max-tokens as maxTokens', () => {
      const fm = loader.parseFrontmatter('max-tokens: 16384')
      expect(fm.maxTokens).toBe(16384)
    })
  })
})
