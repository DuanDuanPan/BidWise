import { join } from 'path'
import { promises as fs } from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createLogger } from '@main/utils/logger'
import type { SkillFrontmatter, ParsedSkill } from './types'

const logger = createLogger('skill-loader')

export class SkillLoader {
  private cache = new Map<string, ParsedSkill>()

  private resolveSkillsDir(): string {
    if (is.dev) {
      return join(app.getAppPath(), 'src', 'main', 'skills')
    }
    return join(process.resourcesPath, 'skills')
  }

  async loadAll(): Promise<Map<string, ParsedSkill>> {
    this.cache.clear()

    const skillsDir = this.resolveSkillsDir()

    let entries: string[]
    try {
      entries = await fs.readdir(skillsDir)
    } catch {
      logger.warn(`Skills 目录不存在: ${skillsDir}`)
      return this.cache
    }

    for (const entry of entries) {
      const dirPath = join(skillsDir, entry)

      // F5: use lstat to detect symlinks — skip them to prevent path traversal
      let stat: Awaited<ReturnType<typeof fs.lstat>>
      try {
        stat = await fs.lstat(dirPath)
      } catch {
        continue
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue

      const skillMdPath = join(dirPath, 'SKILL.md')
      let content: string
      try {
        content = await fs.readFile(skillMdPath, 'utf-8')
      } catch {
        logger.warn(`Skill 目录 ${entry} 缺少 SKILL.md，跳过`)
        continue
      }

      try {
        const parsed = this.parseSkillMd(content, entry, dirPath)
        if (this.cache.has(parsed.name)) {
          logger.warn(`Skill 重名: "${parsed.name}"，后者覆盖前者`)
        }
        this.cache.set(parsed.name, parsed)
      } catch (err) {
        logger.warn(`Skill ${entry} 解析失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return this.cache
  }

  getSkill(name: string): ParsedSkill | undefined {
    return this.cache.get(name)
  }

  listSkills(): ParsedSkill[] {
    return Array.from(this.cache.values())
  }

  parseFrontmatter(raw: string): SkillFrontmatter {
    const fm: SkillFrontmatter = { name: '', description: '' }
    const lines = raw.split('\n')
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const match = line.match(/^(\w[\w-]*):\s*(.*)$/)
      if (!match) {
        i++
        continue
      }

      const key = match[1]
      let value = match[2].trim()

      // Handle >- multiline folded scalar
      if (value === '>-') {
        const parts: string[] = []
        i++
        while (i < lines.length && /^\s+/.test(lines[i])) {
          parts.push(lines[i].trim())
          i++
        }
        value = parts.join(' ')
      } else {
        i++
      }

      this.setFrontmatterField(fm, key, value)
    }

    return fm
  }

  // F14: normalize kebab-case keys to their canonical form
  private normalizeKey(key: string): string {
    const aliases: Record<string, string> = {
      'argument-hint': 'argument-hint',
      'max-tokens': 'maxTokens',
    }
    return aliases[key] ?? key
  }

  private setFrontmatterField(fm: SkillFrontmatter, key: string, value: string): void {
    const normalizedKey = this.normalizeKey(key)
    switch (normalizedKey) {
      case 'name':
        fm.name = value
        break
      case 'description':
        fm.description = value
        break
      case 'arguments':
        fm.arguments = this.parseArrayValue(value)
        break
      case 'argument-hint':
        fm.argumentHint = value
        break
      case 'model':
        fm.model = value || undefined
        break
      case 'shell':
        if (value === 'bash' || value === 'powershell') {
          fm.shell = value
        }
        break
      case 'maxTokens': {
        const n = parseInt(value, 10)
        if (!isNaN(n)) fm.maxTokens = n
        break
      }
      case 'temperature': {
        const t = parseFloat(value)
        if (!isNaN(t)) fm.temperature = t
        break
      }
    }
  }

  private parseArrayValue(value: string): string[] {
    // Inline array: [a, b, c]
    const arrayMatch = value.match(/^\[(.+)]$/)
    if (arrayMatch) {
      return arrayMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    }
    // Space-separated string: $file $style
    return value.split(/\s+/).filter(Boolean)
  }

  private parseSkillMd(content: string, dirName: string, dirPath: string): ParsedSkill {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
    let frontmatter: SkillFrontmatter
    let body: string

    if (fmMatch) {
      frontmatter = this.parseFrontmatter(fmMatch[1])
      body = content.slice(fmMatch[0].length).trim()
    } else {
      frontmatter = { name: '', description: '' }
      body = content.trim()
    }

    if (!frontmatter.name) {
      frontmatter.name = dirName
    }

    return { name: frontmatter.name, dirPath, frontmatter, body }
  }
}
