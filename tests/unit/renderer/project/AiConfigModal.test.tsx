import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { AiConfigModal } from '@modules/project/components/AiConfigModal'

function renderModal(open = true): void {
  render(
    <ConfigProvider>
      <AntApp>
        <AiConfigModal open={open} onClose={vi.fn()} />
      </AntApp>
    </ConfigProvider>
  )
}

describe('AiConfigModal', () => {
  beforeEach(() => {
    vi.stubGlobal('api', {
      configGetAiStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          configured: true,
          configPath: '/mock-user-data/data/config/ai-provider.enc',
          provider: 'openai',
          defaultModel: 'gpt-4o',
          baseUrl: 'https://example.com/v1',
          desensitizeEnabled: true,
          hasApiKey: true,
        },
      }),
      configSaveAi: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads current config status when opened', async () => {
    renderModal()

    expect(await screen.findByRole('dialog', { name: 'AI 设置' })).toBeInTheDocument()
    expect(window.api.configGetAiStatus).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText('/mock-user-data/data/config/ai-provider.enc')
    ).toBeInTheDocument()
    expect(await screen.findByText('留空则保留现有密钥')).toBeInTheDocument()
  })

  it('submits merged config without requiring key re-entry for same provider', async () => {
    renderModal()

    expect(await screen.findByRole('dialog', { name: 'AI 设置' })).toBeInTheDocument()
    const modelInput = screen.getByLabelText('默认模型')
    fireEvent.change(modelInput, { target: { value: 'gpt-4o-mini' } })

    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => {
      expect(window.api.configSaveAi).toHaveBeenCalledWith({
        provider: 'openai',
        apiKey: undefined,
        defaultModel: 'gpt-4o-mini',
        baseUrl: 'https://example.com/v1',
        desensitizeEnabled: true,
      })
    })
  })

  it('requires API key when no existing key is available', async () => {
    vi.stubGlobal('api', {
      configGetAiStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          configured: false,
          configPath: '/mock-user-data/data/config/ai-provider.enc',
          provider: 'claude',
          defaultModel: 'claude-sonnet-4-20250514',
          desensitizeEnabled: true,
          hasApiKey: false,
        },
      }),
      configSaveAi: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    })

    renderModal()
    expect(await screen.findByRole('dialog', { name: 'AI 设置' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    expect(await screen.findByText('请输入 API Key')).toBeInTheDocument()
    expect(window.api.configSaveAi).not.toHaveBeenCalled()
  })
})
