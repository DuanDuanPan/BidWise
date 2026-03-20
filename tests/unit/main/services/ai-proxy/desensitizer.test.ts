import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/mock-user-data' },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
      unlink: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  }
})

describe('Desensitizer', () => {
  let Desensitizer: typeof import('@main/services/ai-proxy/desensitizer').Desensitizer
  let desensitizer: InstanceType<typeof Desensitizer>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@main/services/ai-proxy/desensitizer')
    Desensitizer = mod.Desensitizer
    desensitizer = new Desensitizer()
  })

  describe('desensitize', () => {
    it('replaces company names', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '华为技术有限公司是我们的客户' },
      ])
      expect(result.messages[0].content).not.toContain('华为技术有限公司')
      expect(result.messages[0].content).toMatch(/\{\{COMPANY_\d+\}\}/)
      expect(result.stats.byType['COMPANY']).toBeGreaterThanOrEqual(1)
    })

    it('replaces phone numbers', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '联系电话13800138000' },
      ])
      expect(result.messages[0].content).not.toContain('13800138000')
      expect(result.messages[0].content).toMatch(/\{\{PHONE_\d+\}\}/)
    })

    it('replaces email addresses', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '邮箱是test@example.com' },
      ])
      expect(result.messages[0].content).not.toContain('test@example.com')
      expect(result.messages[0].content).toMatch(/\{\{EMAIL_\d+\}\}/)
    })

    it('replaces amounts with ¥ symbol', async () => {
      const result = await desensitizer.desensitize([{ role: 'user', content: '预算¥500万' }])
      expect(result.messages[0].content).not.toContain('¥500万')
      expect(result.messages[0].content).toMatch(/\{\{AMOUNT_\d+\}\}/)
    })

    it('replaces amounts with Chinese numerals', async () => {
      const result = await desensitizer.desensitize([{ role: 'user', content: '350万元' }])
      expect(result.messages[0].content).not.toContain('350万元')
      expect(result.messages[0].content).toMatch(/\{\{AMOUNT_\d+\}\}/)
    })

    it('replaces contract numbers', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '合同号HT-2026-001' },
      ])
      expect(result.messages[0].content).not.toContain('HT-2026-001')
      expect(result.messages[0].content).toMatch(/\{\{CONTRACT_\d+\}\}/)
    })

    it('replaces ID card numbers', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '身份证110101199001011234' },
      ])
      expect(result.messages[0].content).not.toContain('110101199001011234')
      expect(result.messages[0].content).toMatch(/\{\{IDCARD_\d+\}\}/)
    })

    it('replaces IP addresses', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '服务器地址192.168.1.100' },
      ])
      expect(result.messages[0].content).not.toContain('192.168.1.100')
      expect(result.messages[0].content).toMatch(/\{\{TECHPARAM_\d+\}\}/)
    })

    it('replaces version numbers', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '使用MySQL 8.0.36和v2.3.4版本的SDK' },
      ])
      expect(result.messages[0].content).not.toContain('8.0.36')
      expect(result.messages[0].content).not.toContain('v2.3.4')
      expect(result.stats.byType['TECHPARAM']).toBeGreaterThanOrEqual(2)
    })

    it('handles mixed sensitive fields in one message', async () => {
      const result = await desensitizer.desensitize([
        {
          role: 'user',
          content: '华为技术有限公司的联系方式是13800138000，邮箱hr@huawei.com，预算¥200万',
        },
      ])
      const content = result.messages[0].content
      expect(content).not.toContain('华为')
      expect(content).not.toContain('13800138000')
      expect(content).not.toContain('hr@huawei.com')
      expect(result.stats.totalReplacements).toBeGreaterThanOrEqual(3)
    })

    it('handles empty content without changes', async () => {
      const result = await desensitizer.desensitize([{ role: 'user', content: '' }])
      expect(result.messages[0].content).toBe('')
      expect(result.stats.totalReplacements).toBe(0)
    })

    it('handles text without sensitive data', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '今天天气很好，我们出去走走吧' },
      ])
      expect(result.messages[0].content).toBe('今天天气很好，我们出去走走吧')
      expect(result.stats.totalReplacements).toBe(0)
    })

    it('generates globally unique placeholders across messages', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '服务器192.168.1.1' },
        { role: 'assistant', content: '另一台192.168.1.2' },
      ])
      const allPlaceholders = result.messages
        .map((m) => m.content)
        .join(' ')
        .match(/\{\{[A-Z]+_\d+\}\}/g)
      // All placeholders should be unique
      const unique = new Set(allPlaceholders)
      expect(unique.size).toBe(allPlaceholders?.length)
    })

    it('returns a valid mappingId (UUID format)', async () => {
      const result = await desensitizer.desensitize([{ role: 'user', content: '13800138000' }])
      expect(result.mappingId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    })

    it('placeholder format does not conflict with normal text', async () => {
      const result = await desensitizer.desensitize([
        { role: 'user', content: '变量名是 COMPANY_NAME 或 {value}' },
      ])
      // These should NOT be treated as placeholders
      expect(result.messages[0].content).toContain('COMPANY_NAME')
      expect(result.messages[0].content).toContain('{value}')
    })
  })

  describe('restore', () => {
    it('restores all placeholders to original values', async () => {
      const original = '华为技术有限公司的预算¥500万，联系13800138000'
      const { messages, mappingId } = await desensitizer.desensitize([
        { role: 'user', content: original },
      ])

      // Simulate AI echoing back the same placeholders
      const restored = await desensitizer.restore(messages[0].content, mappingId)
      expect(restored).toBe(original)
    })

    it('handles unknown mappingId gracefully', async () => {
      const restored = await desensitizer.restore('some content', 'nonexistent-id')
      expect(restored).toBe('some content')
    })

    it('cleans up mapping after restore', async () => {
      const { mappingId } = await desensitizer.desensitize([
        { role: 'user', content: '13800138000' },
      ])
      await desensitizer.restore('{{PHONE_1}}', mappingId)

      // Second restore should return as-is (mapping cleaned up)
      const secondRestore = await desensitizer.restore('{{PHONE_1}}', mappingId)
      expect(secondRestore).toBe('{{PHONE_1}}')
    })
  })
})
