---
title: 'AI 输出截断自动续写与 maxTokens 适配'
slug: 'ai-truncation-auto-continue'
created: '2026-04-14'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Vitest', 'OpenAI SDK (MiniMax compatible)']
files_to_modify:
  - 'src/shared/ai-types.ts'
  - 'src/main/services/ai-proxy/index.ts'
  - 'src/main/services/agent-orchestrator/agents/generate-agent.ts'
  - 'src/main/prompts/generate-chapter.prompt.ts'
  - 'tests/unit/main/services/ai-proxy/ai-proxy.test.ts'
  - 'tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts'
  - 'tests/unit/main/services/agent-orchestrator/agents/generate-agent.batch.test.ts'
code_patterns:
  - 'AiProxyResponse 是 proxy 层返回类型，需加 finishReason'
  - 'generate-agent 中 handleSkeletonBatch/handleChapterGeneration 直接调用 aiProxy.call'
  - 'wrapResult 用于返回 kind:result 的 AgentHandlerResult'
  - 'accumulateUsage 累加 token usage（参数类型为 AiProxyResponse）'
test_patterns:
  - 'Vitest + vi.mock + vi.hoisted 模式'
  - 'makeAiResponse helper 构建 mock response'
  - 'unwrapParams helper 解构 params 结果'
  - 'AbortController 用于测试取消'
---

# Tech-Spec: AI 输出截断自动续写与 maxTokens 适配

**Created:** 2026-04-14

## Overview

### Problem Statement

MiniMax-M2.7-highspeed 模型输出极其啰嗦（约为同类模型 4 倍），现有 maxTokens 限制（子章节 4096、单章节 8192）容易导致章节内容被截断。同时，`AiProxyResponse` 未透传 `finishReason`，下游代码无法检测截断，也没有自动续写逻辑，导致生成的章节内容不完整。

### Solution

1. 提高各调用点的 maxTokens 参数以适配高输出量模型
2. 在 `AiProxyResponse` 中透传 `finishReason`，使下游能检测截断
3. 在 generate-agent 的 `handleSkeletonBatch` 和 `handleChapterGeneration` 中实现截断检测与自动续写循环
4. 优化 prompt 增加篇幅约束，减少续写触发概率（续写是兜底机制而非主要路径）

### Scope

**In Scope:**
- maxTokens 参数调整（子章节 4096→8192，单章节 8192→16384）
- `finishReason` 从 provider 层透传到 proxy 层
- handleSkeletonBatch 截断检测与自动续写
- handleChapterGeneration 截断检测与自动续写（有图表 + 无图表 + enableDiagrams=false 三条路径统一改为 agent 内部调用）
- 续写后残留图表占位符的编程级检测与 strip
- 续写 prompt 优化（防止标题重复、图表占位符泄漏、无意义扩展）
- prompt 篇幅约束（减少触发续写概率，同时作用于 `generateSubChapterPrompt`，因其复用 `generateChapterPrompt`）
- 相关单元测试更新

**Out of Scope:**
- 输入 token 估算/截断
- 模型切换逻辑
- temperature 范围校验
- 图表生成/coherence validation 等辅助调用的 maxTokens
- `handleAskSystem`/`handleAnnotationFeedback` 续写——这两个 handler 的 maxTokens 为 2048，输出量小（问答/反馈场景），截断概率极低，且仍走 `wrapParams` 路径由 orchestrator 执行 AI 调用，续写不适用。这是已知的设计局限，如果未来需要可单独扩展

## Context for Development

### Codebase Patterns

- `AiChatResponse`（provider 层，`provider-adapter.ts`）已有 `finishReason: string` 字段
- `AiProxyResponse`（proxy 层，`ai-types.ts:54-62`）缺少 `finishReason`——`AiProxyService.call()` 未透传
- `generate-agent` 的 `handleChapterGeneration` 在 `!aiProxy || !enableDiagrams` 时走 `wrapParams` 路径（L673 是合并条件），有图表时 agent 内部直接调用 `aiProxy.call()`
- **关键：`!aiProxy || !enableDiagrams` 是合并条件**，需拆分为：(a) `!aiProxy` → wrapParams 回退；(b) `aiProxy && !enableDiagrams` → agent 内部调用 + 续写；(c) `aiProxy && enableDiagrams` → agent 内部调用 + 续写 + 图表流程
- `handleSkeletonBatch` 始终在 agent 内部直接调用 `aiProxy.call()`
- 续写需要 `assistant`（已生成内容）+ `user`（续写指令）消息追加到消息列表
- OpenAI 兼容 API 的 `finishReason` 映射：`stop` = 正常结束，`length` = 达到 maxTokens 截断
- `AiProxyLike` 类型在 `orchestrator.ts:48` 中定义但**未导出**，generate-agent 内部需重新声明
- `AiChatMessage` 类型当前**未被 generate-agent.ts 导入**，需新增 import
- orchestrator 的 `createExecutor`（L109-121）在 wrapParams AI 调用后只取 `content/usage/latencyMs`，即使 `AiProxyResponse` 添加了 `finishReason`，orchestrator 也不会使用它——仅 agent 内部直接调用时可利用 finishReason 做续写

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/shared/ai-types.ts:54-62` | AiProxyResponse 类型定义——需添加 finishReason |
| `src/main/services/ai-proxy/index.ts:89-209` | AiProxyService.call() 完整方法——需透传 finishReason |
| `src/main/services/ai-proxy/provider-adapter.ts:157,205` | 两个 provider 已返回 finishReason |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts:409-583` | handleSkeletonBatch——续写目标 |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts:641-787` | handleChapterGeneration——续写目标 |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts:673` | `if (!aiProxy \|\| !enableDiagrams)` 合并条件——需拆分 |
| `src/main/services/agent-orchestrator/orchestrator.ts:48` | AiProxyLike 类型定义（未导出） |
| `src/main/services/agent-orchestrator/orchestrator.ts:109-121` | orchestrator wrapParams AI 调用路径（不透传 finishReason） |
| `src/main/prompts/generate-chapter.prompt.ts:112-125` | 非对照表输出要求——需增加篇幅约束（第 11 条） |

### Technical Decisions

1. **续写策略**：检测 `finishReason === 'length'`，追加 `assistant`（已生成内容）+ `user`（结构化续写指令）消息，循环调用直到非 `length` 或达到 `MAX_CONTINUATIONS = 3`
2. **maxTokens 调整仅影响章节生成**：图表/coherence/ask-system/annotation-feedback 等辅助调用保持原值
3. **handleChapterGeneration 条件拆分**：将原来的 `if (!aiProxy || !enableDiagrams)` 合并条件拆分为三条路径：
   - `!aiProxy`：wrapParams 回退（无 AI 配置，向后兼容）
   - `aiProxy && !enableDiagrams`：agent 内部调用 `callWithContinuation()` → `wrapResult`（无图表但有续写保护）
   - `aiProxy && enableDiagrams`：agent 内部调用 `callWithContinuation()` → 图表生成流程 → `wrapResult`
4. **续写函数提取为通用 helper**：`callWithContinuation()` 在 generate-agent 内部封装续写循环，同时被 batch 和 chapter 两个 handler 使用
5. **续写是兜底机制**：prompt 中增加篇幅约束减少触发概率，续写 prompt 增加"核心要点已阐述完毕则自然收尾"约束防止无意义扩展
6. **续写拼接策略**：各段内容 trim 后用 `\n\n` 连接，避免拼接处断裂或多余空行
7. **续写后图表占位符检测**：对续写拼接后的完整文本做 `%%DIAGRAM:` regex 检测，如在续写段（非首段）中发现残留占位符则 strip 并 warn，作为 prompt 约束的编程级兜底
8. **`callWithContinuation` 中 messages 浅拷贝**：使用 `const messages = [...params.messages]` 创建浅拷贝，**不解构到局部变量**，因为后续 `messages.push()` 会修改数组——如果解构则会影响调用方的原始数组。其他参数（aiProxy/signal/caller 等）为不可变值，可安全解构
9. **编译依赖链**：Task 1（类型）→ Task 2（透传）→ Task 5（callWithContinuation 使用 `response.finishReason`）是编译级阻塞依赖，必须按序实现。Task 3（测试断言）也依赖 Task 2 完成后才能通过

### Risk Analysis (Pre-mortem / Failure Mode / Red Team)

| # | 风险 | 影响 | 缓解措施 |
|---|---|---|---|
| R1 | 续写拼接处出现标题重复或层级错乱 | 内容格式混乱 | 续写 prompt 明确"不要重复已有标题，保持当前 markdown 标题层级" |
| R2 | 有图表路径续写后出现新的 `%%DIAGRAM:...%%` 占位符 | 占位符残留在最终输出 | 续写 prompt 禁止 + 编程级 regex 检测并 strip（双重防御） |
| R3 | 续写 messages 膨胀（3 次续写累积约 49K output tokens） | 输入接近 200K 上限 | 对 200K 窗口可控；日志记录每次续写的累计 promptTokens 便于监控 |
| R4 | 简短章节（如"项目背景"）触发无意义续写 | 内容臃肿 | prompt 增加篇幅约束 + 续写 prompt 加"核心要点完毕请自然收尾" |
| R5 | aiProxy 为 undefined 时无图表路径 NPE | agent 崩溃 | `!aiProxy` 作为独立守卫条件，回退到 wrapParams |
| R6 | batch checkpoint 膨胀（续写后单 section 可达约 128KB） | SQLite checkpoint 字段过大 | 可控——SQLite TEXT 字段无硬上限；10 section × 128KB ≈ 1.3MB checkpoint 在合理范围内。如后续出现性能问题，可考虑只存 markdown hash + 压缩 |
| R7 | handleAskSystem/handleAnnotationFeedback 走 wrapParams 路径截断无声失败 | 少量问答/反馈内容不完整 | 这两个场景 maxTokens=2048 且输出量小，截断概率极低；已在 Out of Scope 中明确标注为已知局限 |
| R8 | 续写循环边界：最后一次调用无续写指令 | 第 4 次调用可能行为不确定 | 改为 `attempt < MAX_CONTINUATIONS` 循环，续写指令无条件追加，循环到上限自然退出（见 Task 5 修正） |

## Implementation Plan

### Task Dependency Graph

```
Task 1 (类型) ──→ Task 2 (透传) ──→ Task 3 (proxy 测试)
                       │
                       ▼
                  Task 5 (callWithContinuation) ──→ Task 6 (chapter) ──→ Task 9 (chapter 测试)
                       │                                                       
                       ▼                                                       
                  Task 7 (batch) ──→ Task 10 (batch 测试)
                       
Task 4 (maxTokens) ── 可并行，无编译依赖
Task 8 (prompt) ── 可并行，无编译依赖
Task 11 (占位符检测) ── 依赖 Task 6
```

### Tasks

- [x] Task 1: 在 `AiProxyResponse` 类型中添加 `finishReason` 字段 **[阻塞 Task 2, 5]**
  - File: `src/shared/ai-types.ts`
  - Action: 在 `AiProxyResponse` 接口（L54-62）中添加 `finishReason: string` 字段
  - Notes: 与 `AiChatResponse`（L35）中已有的 `finishReason` 类型一致

- [x] Task 2: 在 `AiProxyService.call()` 中透传 `finishReason` **[阻塞 Task 3, 5]**
  - File: `src/main/services/ai-proxy/index.ts`
  - Action: 在 `call()` 方法（L89-209）的成功返回对象（约 L155-165）中，添加 `finishReason: response.finishReason`。`response` 是 `AiChatResponse` 类型，已包含 `finishReason`
  - Notes: provider-adapter 无需改动，两个 provider 已正确返回 finishReason

- [x] Task 3: 更新 ai-proxy 测试以验证 finishReason 透传 **[依赖 Task 2]**
  - File: `tests/unit/main/services/ai-proxy/ai-proxy.test.ts`
  - Action: 
    - 在 "complete flow" 的 `desensitize → call → log → restore → return` 测试（L98）中追加断言 `expect(response.finishReason).toBe('end_turn')`
    - 在 "provider switching" 的 `works with OpenAI config` 测试（L212）中追加断言 `expect(response.finishReason).toBe('stop')`
  - Notes: mockChat 的 `beforeEach`（L85-90）已返回 `finishReason: 'end_turn'`，OpenAI 测试的 mockChat（L222-227）已返回 `finishReason: 'stop'`——mock 无需改动。**此 Task 的断言需要 Task 2 完成后才能通过**

- [x] Task 4: 提高 maxTokens 参数 **[可并行]**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action:
    - `handleChapterGeneration` 中所有文本生成调用：`maxTokens: 8192` → `16384`（L680 wrapParams 路径和 L691 aiProxy.call 路径）
    - `handleSkeletonBatch` 中子章节调用：`maxTokens: 4096` → `8192`（L521）
  - Notes: 骨架规划（2048）、图表生成（4096）、coherence（2048）、ask-system（2048）、annotation-feedback（2048）保持不变

- [x] Task 5: 实现 `callWithContinuation()` 续写 helper **[依赖 Task 1+2]**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: 
    1. 在文件顶部 import 区域添加：`import type { AiChatMessage, TokenUsage } from '@shared/ai-types'`（`TokenUsage` 如已导入则跳过，只补 `AiChatMessage`）
    2. 在文件顶部常量区域添加：
    ```typescript
    const MAX_CONTINUATIONS = 3
    const CONTINUATION_PROMPT =
      '请从上文断点处继续撰写。要求：1) 不要重复已有内容和标题；2) 保持当前 markdown 标题层级；3) 不要插入新的图表占位符；4) 如果核心要点已阐述完毕，请自然收尾而非强行扩展。'
    ```
    3. 在 generate-agent.ts 内部声明本地类型（因 orchestrator.ts 未导出 AiProxyLike）：
    ```typescript
    type AiProxyCallable = { call: typeof aiProxy.call }
    ```
    注意：不要使用 `typeof import(...)` 语法以避免循环依赖担忧。直接从 agent handler 的已有参数类型推断即可，或使用 `NonNullable<Parameters<AgentHandler>[1]['aiProxy']>` 这个已在文件中使用的模式
    4. 实现 `callWithContinuation()` 函数：
    ```typescript
    async function callWithContinuation(params: {
      aiProxy: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
      signal: AbortSignal
      caller: string
      messages: AiChatMessage[]
      maxTokens: number
      usage: TokenUsage
    }): Promise<string> {
      const { aiProxy, signal, caller, maxTokens, usage } = params
      // 浅拷贝 messages 数组：后续 push 不会影响调用方的原始数组
      // 注意：不要将 messages 解构到局部变量，否则 push 会影响 params.messages
      const messages = [...params.messages]
      const parts: string[] = []

      for (let attempt = 0; attempt < MAX_CONTINUATIONS + 1; attempt++) {
        throwIfAborted(signal, 'Generate agent cancelled')
        const response = await aiProxy.call({
          caller: attempt === 0 ? caller : `${caller}:cont-${attempt}`,
          signal,
          maxTokens,
          messages,
        })
        accumulateUsage(usage, response)
        parts.push(response.content.trim())

        if (response.finishReason !== 'length') break

        // 续写：追加 assistant + user 消息对，然后循环继续
        logger.info(
          `Truncation detected (${caller}), continuing attempt ${attempt + 1}/${MAX_CONTINUATIONS}, promptTokens this call: ${response.usage.promptTokens}`
        )
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: CONTINUATION_PROMPT })
      }

      return parts.join('\n\n')
    }
    ```
  - Notes: 
    - 循环使用 `attempt < MAX_CONTINUATIONS + 1`（即 0,1,2,3 共 4 次），当 `finishReason === 'length'` 时**无条件追加**续写消息，然后循环自然检查 `attempt < 4`。这避免了"最后一次调用无续写指令"的边界问题（修复 F7）
    - `accumulateUsage` 的参数类型为 `AiProxyResponse`，Task 1 添加 `finishReason` 后类型自动兼容
    - 使用 `NonNullable<Parameters<AgentHandler>[1]['aiProxy']>` 作为 aiProxy 类型，复用文件中已有的模式（如 `requestDiagramSource` 的参数类型），避免重新声明 type
    - 日志记录的是**本次调用**的 `promptTokens`，随着续写次数增加此值会持续上升（因 messages 变长），可反映膨胀趋势

- [x] Task 6: 在 `handleChapterGeneration` 中使用 `callWithContinuation` **[依赖 Task 5]**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: 将 L673 的 `if (!aiProxy || !enableDiagrams)` 合并条件拆分为三条路径：
    ```typescript
    // 路径 A：无 aiProxy — 向后兼容回退到 wrapParams
    if (!aiProxy) {
      updateProgress(10, 'generating-text')
      return wrapParams({
        messages: [
          { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        maxTokens: 16384,
      })
    }

    const startedAt = Date.now()
    const totalUsage = createEmptyUsage()

    updateProgress(10, 'generating-text')

    const textContent = await callWithContinuation({
      aiProxy,
      signal,
      caller: 'generate-agent:text',
      messages: [
        { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 16384,
      usage: totalUsage,
    })
    throwIfAborted(signal, 'Generate agent cancelled')

    // 路径 B：有 aiProxy 无图表 — 直接返回
    if (!enableDiagrams) {
      return wrapResult(textContent, totalUsage, Date.now() - startedAt)
    }

    // 路径 C：有 aiProxy 有图表 — 继续图表生成流程
    updateProgress(20, 'validating-text')
    const parsed = parseDiagramPlaceholders(textContent)
    let currentMarkdown = parsed.markdownWithSkeletons.trim()
    // ... 后续图表生成逻辑保持不变
    ```
  - Notes: 
    - 原来的 `textResponse.content.trim()` 改为 `textContent`（callWithContinuation 返回的已 trim+join 的字符串）
    - `parseDiagramPlaceholders` 接收 `textContent` 而非 `textResponse.content.trim()`
    - 已有测试 `should stay on single-pass flow when diagrams are disabled` 需要更新（见 Task 9）

- [x] Task 7: 在 `handleSkeletonBatch` 中使用 `callWithContinuation` **[依赖 Task 5]**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: 将 L519-528 的 `aiProxy.call()` 替换为 `callWithContinuation()`：
    ```typescript
    const subContent = await callWithContinuation({
      aiProxy,
      signal,
      caller: `generate-agent:batch:${i}`,
      messages: [
        { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
        { role: 'user', content: subChapterPrompt },
      ],
      maxTokens: 8192,
      usage: totalUsage,
    })
    // accumulateUsage 已在 callWithContinuation 内部调用，此处移除原来的 accumulateUsage
    sectionResults[i] = { kind: 'completed', markdown: subContent }
    ```
  - Notes: checkpoint 逻辑不变——续写完成后整体算一个 section 完成。注意移除原来的 `accumulateUsage(totalUsage, response)` 调用，因为 `callWithContinuation` 内部已处理

- [x] Task 8: 在 prompt 输出要求中增加篇幅约束 **[可并行]**
  - File: `src/main/prompts/generate-chapter.prompt.ts`
  - Action: 在 `generateChapterPrompt` 的非对照表输出要求中，在第 10 条（L125 `自检` 条目）后追加第 11 条：
    ```
    11. 控制篇幅在合理范围内，聚焦核心要点，避免不必要的重复和冗余展开
    ```
  - Notes: 由于 `generateSubChapterPrompt` 调用 `generateChapterPrompt` 作为 base prompt，此篇幅约束会自动继承到子章节生成路径，无需额外修改

- [x] Task 9: 更新 generate-agent 单章节测试 **[依赖 Task 6]**
  - File: `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts`
  - Action:
    1. **现有测试 `should return AiRequestParams`**（L57）：此测试不提供 aiProxy，应继续断言 `kind: 'params'`——验证路径 A 回退。但 `maxTokens` 断言从 `8192` 改为 `16384`
    2. **现有测试 `should stay on single-pass flow when diagrams are disabled`**（L395）：此测试提供了 aiProxy 且 `enableDiagrams=false`，原来断言 `kind: 'params'` + `aiProxy.call not called`。改为断言 `kind: 'result'` + `aiProxy.call 被调用 1 次`（路径 B），mock aiProxy.call 返回包含 `finishReason: 'stop'`
    3. **新增测试**：无 aiProxy 时仍返回 `kind: 'params'`（显式验证路径 A 守卫）
    4. **新增测试**：当 `finishReason === 'length'` 时验证续写——mock 第 1 次返回 `finishReason: 'length'`、第 2 次返回 `'stop'`，断言 `aiProxy.call` 被调用 2 次，且返回内容用 `\n\n` 拼接
    5. **新增测试**：续写达到 MAX_CONTINUATIONS 后停止——mock 4 次都返回 `finishReason: 'length'`，断言 `aiProxy.call` 被调用 4 次（不会无限循环）
    6. **现有测试 `should execute multi-phase flow`**（L143）：aiProxy mock 的返回值补充 `finishReason: 'stop'`（规范化，虽然 undefined 也不会触发续写）

- [x] Task 10: 更新 generate-agent batch 测试 **[依赖 Task 7]**
  - File: `tests/unit/main/services/agent-orchestrator/agents/generate-agent.batch.test.ts`
  - Action:
    1. 更新 `makeAiResponse` helper 使其包含 `finishReason: 'stop'`
    2. **新增测试**：当某个子章节（如第 2 个）返回 `finishReason: 'length'`（第 1 次），然后返回 `'stop'`（第 2 次），验证：
       - aiProxy.call 总共被调用 4 次（section 0: 1次, section 1: 2次(含续写), section 2: 1次）
       - 续写调用的 caller 为 `generate-agent:batch:1:cont-1`
       - 最终拼接内容正确，section 1 的内容包含 `\n\n` 分隔的两段

- [x] Task 11: 续写后图表占位符残留检测 **[依赖 Task 6]**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: 在 `handleChapterGeneration` 的有图表路径中，`callWithContinuation` 返回 `textContent` 后、`parseDiagramPlaceholders` 之前，如果续写实际发生（可通过判断 parts 数量或日志推断——简化实现：直接对 textContent 做 regex 检查），检测续写段中是否有残留的 `%%DIAGRAM:` 标记。实现方式：
    ```typescript
    // 在 parseDiagramPlaceholders 之前，strip 续写可能引入的格式异常占位符
    // parseDiagramPlaceholders 会正常解析合法占位符，此处仅处理不完整/畸形的
    // 注意：完整合法的占位符应该被正常解析和处理，不需要 strip
    ```
    实际上更安全的做法是：在 `parseDiagramPlaceholders(textContent)` 正常处理所有合法占位符（包括续写段中可能出现的）。图表生成流程会处理它们。因此不需要额外 strip 逻辑——只需确保续写段中的合法占位符也会被解析。
    
    **修正方案**：不做 strip，而是在日志中 warn 如果续写段（非首段拼接结果）中检测到 `%%DIAGRAM:` 标记：
    ```typescript
    if (parts.length > 1) {
      const continuationText = parts.slice(1).join('\n\n')
      if (/%%DIAGRAM:/.test(continuationText)) {
        logger.warn('Continuation text contains diagram placeholders despite prompt constraint')
      }
    }
    ```
    但这需要 `callWithContinuation` 返回 parts 信息而非只返回 join 后的字符串。
    
    **最终方案**：让 `callWithContinuation` 返回 `{ content: string, continuationCount: number }`，使调用方可以判断是否发生了续写。在有图表路径中，如果 `continuationCount > 0`，对 textContent 做 warn 级别的占位符检查。
  - Notes: 这是 R2 风险的编程级兜底。`parseDiagramPlaceholders` 会正常处理所有合法占位符，所以续写段中的占位符也会被正常生成图表——不是 bug，只是不符合设计预期（续写不应引入新图表）。warn 日志足以监控此行为频率

### Acceptance Criteria

- [x] AC 1: Given aiProxy.call 返回 finishReason，when 通过 AiProxyService.call() 调用，then response 中包含 finishReason 字段且值与 provider 层一致
- [x] AC 2: Given 子章节生成返回 finishReason='length'，when handleSkeletonBatch 处理该子章节，then 自动追加续写消息并再次调用 aiProxy.call，最终内容用 `\n\n` 拼接
- [x] AC 3: Given 单章节生成（无图表，有 aiProxy，enableDiagrams=false）返回 finishReason='length'，when handleChapterGeneration 处理，then 自动续写并返回 kind='result'
- [x] AC 4: Given 单章节生成（有图表）返回 finishReason='length'，when handleChapterGeneration 处理文本生成阶段，then 自动续写后再进入图表生成阶段
- [x] AC 5: Given 续写已达到 MAX_CONTINUATIONS（3次）但仍返回 length，when callWithContinuation 循环，then 总共调用 4 次后停止（不无限循环）
- [x] AC 6: Given 正常生成返回 finishReason='stop' 或 'end_turn'，when callWithContinuation 检测，then 不触发续写，行为与改动前一致
- [x] AC 7: Given maxTokens 参数已调整，when 单章节生成调用 aiProxy，then maxTokens 为 16384；when 子章节调用，then maxTokens 为 8192
- [x] AC 8: Given 无 aiProxy 配置，when handleChapterGeneration 处理，then 仍返回 kind='params'（向后兼容回退），maxTokens 为 16384
- [x] AC 9: Given 章节生成 prompt，when 检查非对照表输出要求，then 包含篇幅约束条款（第 11 条）
- [x] AC 10: Given enableDiagrams=false 且 aiProxy 存在，when handleChapterGeneration 处理，then agent 内部直接调用 aiProxy（kind='result'），不走 wrapParams
- [x] AC 11: Given 续写发生且续写内容包含 `%%DIAGRAM:` 标记，when handleChapterGeneration 有图表路径检测，then logger.warn 输出警告

## Additional Context

### Dependencies

- 无新外部依赖
- 依赖 `AiChatResponse.finishReason` 已被 provider-adapter 正确设置——Claude 返回 `'end_turn'`，OpenAI 兼容 API 返回 `'stop'` 或 `'length'`
- 编译依赖链：Task 1 → Task 2 → Task 5 → Task 6/7 → Task 9/10/11

### Testing Strategy

**单元测试（Vitest）：**
- `ai-proxy.test.ts`: 验证 finishReason 透传（2 个新断言追加到现有测试）
- `generate-agent.test.ts`: 
  - 现有测试调整：路径 B（enableDiagrams=false + aiProxy）从 params→result；路径 A（无 aiProxy）保持 params
  - 新增 3 个测试：续写触发、续写上限停止、无 aiProxy 回退
  - 现有 multi-phase 测试 mock 补 finishReason
- `generate-agent.batch.test.ts`: makeAiResponse 补 finishReason，新增 1 个续写测试

**手动测试：**
- 使用 MiniMax-M2.7-highspeed 模型生成一个复杂复合章节（如"系统架构设计"），观察是否触发续写日志 `Truncation detected`，验证最终内容完整性
- 生成一个简短章节（如"项目背景"），验证不会触发续写
- 生成一个 enableDiagrams=false 的技术章节，验证仍能触发续写（路径 B）

### Notes

- MiniMax-M2.7 的 `finishReason` 遵循 OpenAI 兼容规范：`stop`（正常）/ `length`（截断）
- 续写 prompt 使用中文，包含 4 条约束：不重复、保持层级、禁止新图表占位符、允许自然收尾
- `callWithContinuation` 仅在 generate-agent 内部使用，不暴露为公共 API
- 续写拼接使用 `parts[] + join('\n\n')`，各段 trim 后连接，避免断裂或多余空行
- `callWithContinuation` 返回 `{ content, continuationCount }` 而非纯 string，便于调用方判断续写是否发生
- 续写日志记录每次调用的 `promptTokens`，随续写次数增加此值递增，可反映 messages 膨胀趋势
- `handleAskSystem`/`handleAnnotationFeedback` 仍走 wrapParams 路径，不具备续写能力——这是已知设计局限，其 maxTokens=2048 下截断概率极低
- orchestrator 的 wrapParams AI 调用路径（L109-121）获取到 finishReason 后不使用它——这是预期行为，仅 agent 内部直接调用时利用 finishReason
- `generateSubChapterPrompt` 复用 `generateChapterPrompt` 作为 base，Task 8 的篇幅约束自动继承，无需额外修改
