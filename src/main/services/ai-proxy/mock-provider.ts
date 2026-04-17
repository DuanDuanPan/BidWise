/**
 * Mock AI provider for E2E testing.
 *
 * Activated when `process.env.BIDWISE_E2E_AI_MOCK === 'true'`.
 * Returns canned Markdown chapter content. If the user prompt contains
 * the marker `__E2E_FORCE_ERROR__`, the call throws to exercise error-recovery paths.
 *
 * Delay is configurable via `BIDWISE_E2E_AI_MOCK_DELAY_MS` (default 500ms).
 */
import { ErrorCode } from '@shared/constants'
import { AiProxyError } from '@main/utils/errors'
import { app } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { AiProvider, AiProviderCallOptions } from './provider-adapter'
import type { AiChatRequest, AiChatResponse } from '@shared/ai-types'

const FORCE_ERROR_SECTION_RE = /## (?:编写指导|补充说明)\n[\s\S]*?__E2E_FORCE_ERROR__/
const PROMPT_CAPTURE_ENV = 'BIDWISE_E2E_AI_MOCK_CAPTURE_PROMPTS'
const PROMPT_CAPTURE_FILE = 'e2e-ai-prompts.jsonl'

const MOCK_CHAPTER_CONTENT = `### 方案概述

本章节基于项目需求和技术要求，提供了详细的技术实施方案。以下从架构设计、技术选型、实施步骤三个维度展开说明。

### 核心技术方案

| 维度 | 方案 | 说明 |
|------|------|------|
| 架构模式 | 微服务架构 | 支持独立部署和弹性伸缩 |
| 数据存储 | 分布式数据库 | 保障数据一致性和高可用 |
| 接口规范 | RESTful + gRPC | 兼顾通用性和高性能场景 |

### 实施步骤

- 第一阶段：需求确认与方案评审（2 周）
- 第二阶段：核心模块开发（6 周）
- 第三阶段：系统集成与联调（3 周）
- 第四阶段：试运行与验收交付（2 周）
`

async function capturePromptForE2e(request: AiChatRequest): Promise<void> {
  if (process.env[PROMPT_CAPTURE_ENV] !== 'true') return

  const filePath = join(app.getPath('userData'), 'data', 'logs', PROMPT_CAPTURE_FILE)
  const entry = {
    timestamp: new Date().toISOString(),
    model: request.model,
    messages: request.messages,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8')
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock'

  async chat(request: AiChatRequest, options?: AiProviderCallOptions): Promise<AiChatResponse> {
    if (options?.signal?.aborted) {
      throw new AiProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'Mock AI: request aborted')
    }

    const delayMs = parseInt(process.env.BIDWISE_E2E_AI_MOCK_DELAY_MS ?? '500', 10)
    await this.sleep(delayMs, options?.signal)

    await capturePromptForE2e(request)

    const userContent = request.messages.find((m) => m.role === 'user')?.content ?? ''
    if (FORCE_ERROR_SECTION_RE.test(userContent)) {
      throw new AiProxyError(ErrorCode.AI_PROXY_PROVIDER, 'Mock AI: forced error for E2E testing')
    }

    return {
      content: MOCK_CHAPTER_CONTENT,
      usage: { promptTokens: 500, completionTokens: 300 },
      model: 'mock-e2e-model',
      finishReason: 'end_turn',
      termination: { kind: 'completed', finishReason: 'end_turn' },
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer)
          reject(new AiProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'Mock AI: aborted during delay'))
          return
        }
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new AiProxyError(ErrorCode.AI_PROXY_TIMEOUT, 'Mock AI: aborted during delay'))
          },
          { once: true }
        )
      }
    })
  }
}
