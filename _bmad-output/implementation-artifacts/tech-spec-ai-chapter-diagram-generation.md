---
title: 'AI章节生成支持自动嵌入Draw.io和Mermaid图表'
slug: 'ai-chapter-diagram-generation'
created: '2026-04-14'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Plate/Slate editor', 'mermaid-js', 'draw.io mxGraph XML', 'agent-orchestrator', 'ai-proxy', 'fast-xml-parser (新增)', 'Vitest 4.x']
files_to_modify:
  - 'src/main/prompts/generate-chapter.prompt.ts'
  - 'src/main/prompts/generate-diagram.prompt.ts (新建)'
  - 'src/main/prompts/validate-text-diagram-coherence.prompt.ts (新建)'
  - 'src/main/services/chapter-generation-service.ts'
  - 'src/main/services/agent-orchestrator/orchestrator.ts'
  - 'src/main/services/agent-orchestrator/agents/generate-agent.ts'
  - 'src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts'
  - 'src/main/services/diagram-validation-service.ts (新建)'
  - 'src/renderer/src/modules/editor/hooks/useChapterGeneration.ts'
  - 'src/renderer/src/modules/editor/components/EditorView.tsx'
  - 'src/renderer/src/modules/editor/components/DrawioElement.tsx'
  - 'src/renderer/src/modules/editor/components/MermaidElement.tsx'
  - 'src/shared/ai-types.ts'
  - 'src/shared/chapter-types.ts'
  - 'src/shared/mermaid-types.ts'
  - 'src/shared/chapter-markdown.ts'
  - 'src/main/services/task-queue/queue.ts'
  - 'src/main/services/task-queue/progress-emitter.ts'
code_patterns:
  - 'AgentHandler options extended with optional aiProxy — handler returns discriminated union { kind: params | result }'
  - 'Progress stages: analyzing → generating-text → validating-text → generating-diagrams → validating-diagrams → composing → validating-coherence → completed'
  - 'TaskProgressEvent.payload?: unknown for type-safe extensible progress data'
  - 'BidWiseError hierarchy for typed errors'
  - 'Task queue single executor with checkpoint support'
  - 'Markdown serializer placeholder strategy for void elements'
  - 'Progressive delivery: text first, diagrams async with skeleton placeholders'
test_patterns:
  - 'vi.hoisted() factory functions + vi.mock() at module level'
  - 'Mock agentOrchestrator.execute() returns { taskId }'
  - 'Verify orchestrator request context structure, not AI output'
  - 'Renderer tests use jsdom + @testing-library/react'
  - 'Fake timers for debounce testing'
---

# Tech-Spec: AI章节生成支持自动嵌入Draw.io和Mermaid图表

**Created:** 2026-04-14

## Overview

### Problem Statement

当前 AI 章节生成（`generate-chapter.prompt.ts` + `chapter-generation-service.ts`）只输出纯文本 Markdown，不包含任何可视化图表。技术方案类章节（如架构设计、技术选型、模块设计等）通常需要架构图、流程图、层次图等可视化内容来增强表达。用户需要在 AI 生成章节/重新生成章节时，自动返回包含文字 + draw.io/mermaid 图表的丰富内容，并在 Plate 编辑器中直接渲染。

### Solution

采用**四阶段流水线 + 分阶段校验 + 渐进式交付**的生成模式：

1. **Phase 1 - 文字生成 + 图表占位 + 文字校验**：AI 生成章节文本，在需要图表的位置插入结构化占位符；随后 LLM 自检文字质量（必响应条款覆盖、内容越界、术语规范）。**文字完成后立即渲染到编辑器**，图表位置显示骨架屏占位。
2. **Phase 2 - 图表生成 + 三层校验**（异步）：针对每个占位符，汇总上下文，调用 AI 生成 mermaid DSL 或 draw.io XML；通过三层校验（工程硬约束 + 结构化检查清单 + LLM 自由修正）进行 ReAct 迭代自修正（最多 3 轮）。图表并发生成（上限 2 路），逐个填入编辑器。
3. **Phase 3 - 一致性校验**（异步）：LLM 进行文图一致性校验（组件覆盖、术语统一、位置合理性），使用对抗式 prompt + 结构化 JSON 输出。
4. **Phase 4 - 资产持久化**（异步）：保存图表资产到磁盘（draw.io → XML+PNG, mermaid → SVG）。

**关键 UX 策略**：Phase 1 完成后文字即时上屏，用户可以先阅读/编辑文字。Phase 2/3/4 异步执行，图表逐个填入，用户不需要等待全部完成。

**智能跳过**：纯文字类章节（项目背景、服务承诺、项目概述等）在 Phase 1 prompt 中自动不生成占位符，走快速路径，不影响现有生成速度。

draw.io XML 生成采用 **prompt 软约束（含 few-shot 模板）+ 软件工程校验硬约束 + ReAct 迭代自修正**模式。**默认 mermaid 优先**，仅在 mermaid 确实无法表达时才使用 draw.io。

### Scope

**In Scope:**
- 修改 AI prompt 支持图表占位符输出 + 文字自检指令（合并到生成 prompt 中）
- 新增图表生成 prompt（mermaid + draw.io 两种模式，draw.io 含 few-shot XML 模板）
- 新增文图一致性校验 prompt（对抗式 + 结构化 JSON 输出，v1 可选）
- draw.io XML 工程校验（well-formedness、mxGraph 基本结构）
- mermaid 语法校验（parser 验证）
- ReAct 迭代自修正循环（最多 3 轮，每轮不累积历史修正记录）
- 章节生成服务改为四阶段流水线（渐进式交付）
- Orchestrator AgentHandler 扩展可选 aiProxy 参数
- 分阶段校验体系（文字校验 → 图表校验 → 一致性校验）
- 进度上报适配新阶段 + 用户友好提示语
- 图表资产自动保存（draw.io → XML+PNG, mermaid → SVG）
- terminologyPostProcessor 保护 mermaid/drawio 区域
- DrawioElement xml-only 模式支持（自动渲染 PNG）
- 智能跳过：纯文字章节不触发图表生成
- 超时后部分交付（已完成文字 + 已生成图表）

**Out of Scope:**
- 独立的"图表生成"按钮（本次只做章节生成/重生成时的自动嵌入）
- 图表样式模板配置系统
- AI 对已有图表的编辑/优化
- 图表类型的用户偏好设置
- 生成模式 UI 选择器（纯文字/含图表切换，未来可加）

## Context for Development

### Codebase Patterns

**Orchestrator 架构（当前 → 扩展）：**
- **当前**：`AgentHandler` 返回 `AiRequestParams`，orchestrator 内部调用 `aiProxy.call()` 一次。handler 没有 aiProxy 访问权限。
- **扩展**：AgentHandler options 增加可选 `aiProxy` 参数：`(context, { signal, updateProgress, aiProxy? })`。handler 使用 aiProxy 时自行管理多次 AI 调用，orchestrator 的 `createExecutor` 检测到 handler 已使用 aiProxy 则跳过自动调用。非多阶段 agent 完全不受影响。

**渐进式交付模式：**
- Phase 1 完成后通过 progress event 的 `payload` 携带中间结果（文字内容），renderer 立即注入编辑器
- 图表占位符在编辑器中渲染为骨架屏：`> %%DIAGRAM-SKELETON:{placeholderId}:{title}%%`
- Phase 2 每完成一个图表，通过 progress event 的 `payload` 增量更新，renderer 用 regex 匹配替换对应骨架屏
- TaskProgressEvent 新增 `payload?: unknown`（通用载荷字段，保持接口通用性）

**进度阶段（用户可见提示）：**
```
analyzing(0%)           → "正在分析章节上下文..."
generating-text(10%)    → "正在撰写章节内容..."
validating-text(20%)    → "正在检查文字质量..."
generating-diagrams(35%) → "正在生成图表 (1/N)..."
validating-diagrams(60%) → "正在验证图表..."
composing(80%)          → "正在整合内容..."
validating-coherence(90%) → "正在检查文图一致性..."
completed(100%)         → "生成完成"
```

**Markdown 反序列化格式要求：**
- Mermaid（裸代码块即可被识别，无需 comment 前缀）:
  ````
  ```mermaid
  graph TD
    A[组件A] --> B[组件B]
  ```
  ````
- Draw.io（需要 comment + image 对）:
  ```
  <!-- drawio:{diagramId}:{fileName}.drawio -->
  ![caption](assets/{fileName}.png)
  ```

**图表占位符设计（安全格式）：**
AI 在 Phase 1 输出中使用以下格式标记需要图表的位置：
```
%%DIAGRAM:mermaid:架构层次图:base64(描述系统整体分层架构)%%
%%DIAGRAM:drawio:数据流向图:base64(展示数据从输入到输出的完整流转过程)%%
```
格式：`%%DIAGRAM:{type}:{title}:{base64_description}%%`
- 使用 `%%` 围栏而非 HTML 注释，避免 `-->` 注入破坏格式
- `type`: `mermaid` 或 `drawio`
- `title`: 图表标题（用于 caption）
- `base64_description`: 图表内容描述的 base64 编码（防止特殊字符破坏格式）

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/main/prompts/generate-chapter.prompt.ts` | 当前章节生成 prompt（120行），需扩展输出要求添加图表占位符指令 + 智能跳过逻辑 |
| `src/main/services/chapter-generation-service.ts` | 章节生成服务（~330行），`_dispatchGeneration()` 需改为四阶段流水线 |
| `src/main/services/agent-orchestrator/orchestrator.ts` | Agent 调度（~180行），AgentHandler options 扩展可选 aiProxy |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts` | 生成 agent（~140行），需新增多阶段处理器 + 图表并发生成 |
| `src/renderer/src/modules/editor/serializer/markdownSerializer.ts` | Markdown 反序列化（~245行），mermaid 裸代码块和 drawio comment+image 对已支持 |
| `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts` | 客户端生成状态（~390行），`progressToPhase()` 需扩展新阶段名 + 中间内容处理 |
| `src/renderer/src/modules/editor/components/EditorView.tsx` | 内容注入（~260行），渐进式交付逻辑 + 骨架屏 |
| `src/renderer/src/modules/editor/components/DrawioElement.tsx` | Draw.io 渲染组件，需支持 xml-only 模式自动渲染 PNG |
| `src/shared/ai-types.ts` | AI 类型定义，TaskProgressEvent 扩展 payload |
| `src/shared/chapter-types.ts` | ChapterGenerationPhase / ChapterGenerationStatus 类型定义，需扩展新阶段和字段 |
| `src/shared/drawio-types.ts` | DrawioElementData 接口 |
| `src/shared/mermaid-types.ts` | MermaidElementData 接口，需新增 svgPersisted 字段 |
| `src/main/services/task-queue/queue.ts` | TaskExecutorContext.updateProgress 签名，需扩展 payload 参数 |
| `src/main/services/task-queue/progress-emitter.ts` | ProgressEmitter 200ms 节流，payload 事件需绕过节流 |
| `src/main/services/drawio-asset-service.ts` | saveDrawioAsset(xml, pngBase64, fileName) |
| `src/main/services/mermaid-asset-service.ts` | saveMermaidAsset(svgContent, assetFileName) |
| `src/renderer/src/modules/editor/components/MermaidRenderer.tsx` | mermaid.parse() + mermaid.render() 用于语法校验 |
| `src/main/services/ai-proxy/index.ts` | AI 代理调用入口 |

### Technical Decisions

**TD-1: Handler 扩展而非新类型** *(revised from ADR review + Elicitation R2 + Adversarial R1)*
不引入新的 `MultiPhaseAgentHandler` 类型，而是扩展现有 `AgentHandler` 的 options：
- 增加可选 `aiProxy` 参数（注意：`aiProxy` 是 `orchestrator.ts` 顶层模块级 import `import { aiProxy } from '@main/services/ai-proxy'`，不是类属性）
- handler 返回辨别联合类型 `AgentHandlerResult = { kind: 'params'; value: AiRequestParams } | { kind: 'result'; value: AgentExecuteResult }`
- orchestrator 的 `createExecutor` 通过 `kind` 字段判断路径：`'params'` → 走旧路径自动调用；`'result'` → 直接使用
- **Breaking change**：所有现有 handler 必须将返回值包装为 `{ kind: 'params', value: existingReturn }`（机械性改动，涉及 `generate-agent.ts` 的 3 个分支及其他已注册 agent）
- `agents` map 扩展存储 `needsAiProxy` 标志，`execute()` 的火忘路径（line 127）也必须读取此标志

**TD-2: Mermaid 校验分层** *(revised from Adversarial R1)*
- 工程硬约束：main 进程进行 mermaid 语法校验
- **首选方案**：评估 `@mermaid-js/mermaid-parser`（mermaid 官方纯解析器包，无 DOM 依赖，可在 Node.js 环境运行）。如可用，在 main 进程中使用其 `parse()` 做完整语法校验
- **备选方案 A**：如 `@mermaid-js/mermaid-parser` 不可用或不成熟，尝试 `mermaid` 全量包。mermaid 库较重（~2MB）且依赖 `document` 等浏览器 API，在 Node.js 环境大概率失败（Spike A 验证）
- **备选方案 B**：如 Spike A 确认 mermaid 全量包不可用且 parser 包也不可用，退化为正则基础校验（图表类型关键词 `graph|sequenceDiagram|classDiagram|stateDiagram|gantt|flowchart` + 基本缩进结构），**注意此方案校验覆盖率显著降低**，语法错误可能通过校验到达 renderer 才失败
- 无论使用哪种方案，renderer 端渲染失败时的错误处理仍然是最后一道防线

**TD-3: Draw.io XML 校验**
- 新增 `fast-xml-parser` 依赖做 XML well-formedness 校验（轻量，~100KB）
- 结构校验：检查根元素 `<mxGraphModel>` 存在、`<root>` 子元素存在、`<mxCell>` 元素包含必要属性
- 不做完整 mxGraph schema 校验（过于复杂且不必要）

**TD-4: Draw.io PNG 生成 + xml-only 模式 + 离线降级** *(revised from ADR review + Adversarial R1)*
- AI 生成 XML 后，复用现有 DrawioElement iframe 机制异步生成 PNG
- DrawioElement 新增 xml-only 检测：`xml` 存在但无本地 PNG 时进入"渲染中"状态
- **在线模式**：自动调用 draw.io iframe（`embed.diagrams.net`）渲染 → 导出 PNG → saveDrawioAsset() 持久化
- **离线降级**：draw.io iframe 依赖外部 URL `embed.diagrams.net`，离线时无法自动生成 PNG。降级策略：
  - 检测网络状态（`navigator.onLine` 或 iframe 加载超时 5s）
  - 离线时：显示 XML 结构预览（提取节点标签列表）+ "连接网络后自动渲染" 提示 + "双击手动编辑" 按钮
  - 网络恢复后（`online` 事件）：自动重试 PNG 渲染
  - **不影响文档保存和编辑**：xml-only 状态下文档可正常保存/打开，xml 数据已持久化
- 需处理边界情况：PNG 未生成时保存文档 → 下次打开时 DrawioElement 重新触发渲染
- 需处理边界情况：PNG 未生成时 docx 导出 → figure-export-service 标记为"图表待渲染"并在 XML 中提取标题作为占位文本

**TD-5: Mermaid 优先 + 图表类型选择策略** *(revised from Pre-mortem)*
- **默认 mermaid 优先**：draw.io XML 生成收敛率较低，应最大化 mermaid 使用比例
- AI 在 Phase 1 决定每个占位符类型，启发式规则：
  - 流程图、时序图、状态图、甘特图、类图、树形图 → **mermaid**
  - 仅在需要自由布局（非规则连接关系、复杂嵌套容器）时 → **drawio**
- Draw.io prompt 内置 2-3 个不同类型的合格 XML 模板作为 few-shot 参照
- LLM 约束只使用 mxGraph 最基础元素子集（矩形、箭头、文本标签），禁止复杂样式

**TD-6: 超时 + 部分交付** *(revised from Failure Mode Analysis)*
- 超时从 120s 提升到 300s（5分钟）
- 超时后不丢弃全部成果，而是返回已完成阶段的内容：
  - Phase 1 超时前完成 → 返回纯文字（退化为现有行为）
  - Phase 2 部分完成 → 返回文字 + 已生成的图表 + 移除未完成的占位符
  - Phase 3+ 超时 → 返回文字 + 全部图表（跳过一致性校验）

**TD-7: 渐进式交付** *(new from Pre-mortem + War Room)*
- Phase 1 文字完成后立即通过 progress event 推送中间结果到 renderer
- renderer 先渲染文字，图表位置显示骨架屏（skeleton placeholder）
- Phase 2 每完成一个图表，增量推送到 renderer 替换对应骨架屏
- 用户感知等待时间 = Phase 1 耗时（~30s），与当前纯文本生成持平

**TD-8: 智能跳过** *(new from War Room)*
- 在 prompt 层面做智能判断：章节标题/类型为纯文字类（背景、承诺、概述、报价说明等）时，不生成占位符
- 无需 UI 改动，完全后端决策
- prompt 中列出"需要图表的章节类型"白名单：架构设计、技术方案、系统设计、模块设计、部署方案、网络拓扑、数据流转、实施计划等

**TD-9: ReAct token 控制** *(new from Red Team)*
- 每轮迭代只传入：压缩的原始上下文 + 当前生成结果 + 本轮校验反馈
- 不累积历史修正记录，防止 token 爆炸
- 每轮 input token 上限约束，超限则截断上下文保留校验反馈

**TD-10: terminologyPostProcessor 保护** *(new from Pre-mortem)*
- 术语替换时跳过以下区域：
  - mermaid 代码块（` ```mermaid ` ... ` ``` ` 之间）
  - drawio HTML 注释行（`<!-- drawio:... -->`）
  - 图表占位符行（`%%DIAGRAM:...%%`）
- 使用正则识别这些区域的边界，术语替换只作用于普通文本段落

**TD-11: 一致性校验对抗性设计** *(new from Pre-mortem)*
- Phase 3 prompt 使用对抗式设计：要求 LLM 必须列出至少 1 个潜在问题
- 返回结构化 JSON：`{ pass: boolean, issues: [{ type, description, suggestion }], checked_items: [...] }`
- 避免 LLM 橡皮图章倾向

**TD-12: 占位符格式安全** *(new from Red Team)*
- 使用 `%%DIAGRAM:...%%` 格式代替 HTML 注释，避免 `-->` 注入风险
- description 字段使用 base64 编码，防止特殊字符破坏格式
- 解析时做严格正则匹配，格式不合规的占位符直接移除

### 关键设计决策

**四阶段分离 + 渐进式交付的原因：**
- Phase 1 先生成文字可以早期发现文字问题，避免图表生成后再回退的高成本
- 文字即时上屏消除了用户等待感知——用户感知等待时间 = Phase 1 耗时（~30s）
- Phase 2 图表生成基于 Phase 1 已校验的文字上下文，保证图文一致性的基础
- Phase 3 一致性校验是最终质量门控，只检查文图关系而非重复检查各自内容

**ReAct 迭代上限 3 轮的原因：**
超过 3 轮仍不通过则降级为纯文本（移除占位符），避免无限循环导致用户等待过长

**三层校验体系：**

| 层级 | 检查方式 | 检查内容 |
|------|----------|----------|
| 第 1 层：工程硬约束 | 代码校验（非 LLM） | XML well-formedness、mermaid 语法可解析性、编码合法性、节点数量上限 |
| 第 2 层：结构化检查清单 | LLM 按维度逐项判断 | 术语一致性、内容完整性、图表类型适配、层级粒度适当、上下文不越界、标注语言统一 |
| 第 3 层：自由修正 | LLM 自主发现 | 在完成第 2 层后额外指出规则未覆盖的问题 |

**Phase 1 文字校验维度：**
- 必响应条款是否覆盖
- 内容是否越界（超出当前章节范围）
- 术语是否规范

**Phase 3 一致性校验维度（对抗式）：**
- 文中提到的组件在图中是否完整体现
- 图中标签与文中术语是否统一
- 图的位置是否在相关段落附近
- 必须输出至少 1 个潜在问题（避免橡皮图章）

## Implementation Plan

### Tasks

#### Layer 1: Foundation（无外部依赖）

- [ ] **Task 1: 安装 fast-xml-parser 依赖**
  - File: `package.json`
  - Action: `pnpm add fast-xml-parser`
  - Notes: 仅用于 main 进程的 draw.io XML well-formedness 校验

- [ ] **Task 2: 扩展 AI 类型定义**
  - File: `src/shared/ai-types.ts`
  - Action:
    - `TaskProgressEvent` 新增可选字段 `payload?: unknown`（通用载荷，Phase 1 传 `{ intermediateContent: string }`，Phase 2 传 `{ diagramUpdate: { placeholderId: string, markdown: string } }`）
    - `AgentHandlerOptions` 新增可选字段 `aiProxy?: AiProxy`（多阶段 handler 用）
    - 导出辨别联合类型：
      ```typescript
      type AgentHandlerResult =
        | { kind: 'params'; value: AiRequestParams }
        | { kind: 'result'; value: AgentExecuteResult }
      ```
  - Notes: 使用 `kind` 辨别联合替代字段检查（`content` vs `messages`），避免类型判别脆弱性。`payload?: unknown` 替代具体字段，保持 TaskProgressEvent 通用性

- [ ] **Task 2b: 扩展 task-queue 进度链路支持 payload**
  - Files: `src/main/services/task-queue/queue.ts`, `src/main/services/task-queue/progress-emitter.ts`
  - Action:
    - `TaskExecutorContext.updateProgress` 签名扩展为 `(progress: number, message?: string, payload?: Record<string, unknown>) => void`
    - `queue.ts` line 184–192：将 `updateProgress` 实现中的 `progressEmitter.emit()` 调用传递 `payload` 参数：`progressEmitter.emit({ taskId, progress, message, payload })`
    - `ProgressEmitter.emit()` 无需修改——它已经传递整个 `TaskProgressEvent` 对象，`payload` 字段随 Task 2 添加到接口后自动透传
    - **节流保护**：对携带 `payload` 的事件绕过 200ms 节流（与 progress=100 同等待遇），确保中间内容不被静默丢弃：
      ```typescript
      if (event.progress < 100 && !event.payload && now - lastTime < THROTTLE_MS) {
        return
      }
      ```
  - Notes: `payload` 类型约束为 `Record<string, unknown>`（而非裸 `unknown`），确保 Electron IPC structured clone 序列化安全。此 Task 是渐进式交付的关键链路——没有它，Phase 1 中间内容和 Phase 2 图表增量更新永远无法到达 renderer

- [ ] **Task 3: 创建图表校验服务**
  - File: `src/main/services/diagram-validation-service.ts`（新建）
  - Action: 实现以下方法：
    - `validateDrawioXml(xml: string): { valid: boolean, errors: string[] }` — 使用 fast-xml-parser 解析 XML，检查 `<mxGraphModel>` 根元素、`<root>` 子元素、`<mxCell>` 元素存在性，节点数量上限（50）
    - `validateMermaidSyntax(source: string): { valid: boolean, errors: string[] }` — 使用 mermaid `parse()` 校验语法，捕获异常并提取行号
    - `parseDiagramPlaceholders(markdown: string): DiagramPlaceholder[]` — 解析 `%%DIAGRAM:...%%` 占位符，返回 `{ id, type, title, description }` 数组
    - `replacePlaceholderWithDiagram(markdown: string, placeholderId: string, diagramMarkdown: string): string` — 替换单个占位符为图表 markdown
    - `removeAllPlaceholders(markdown: string): string` — 移除所有占位符（降级用）
  - Notes: mermaid 在 main 进程的加载需测试性能。如过重，`validateMermaidSyntax` 改用正则做基础检查（图表类型关键词 `graph|sequenceDiagram|classDiagram|stateDiagram|gantt|flowchart` + 基本缩进结构），返回 `{ valid: true, errors: [] }` 或 `{ valid: false, errors: ['无法识别的图表类型'] }`

- [ ] **Task 4: 创建图表生成 prompt**
  - File: `src/main/prompts/generate-diagram.prompt.ts`（新建）
  - Action: 导出以下函数和常量：
    - `generateMermaidPrompt(context: DiagramGenerationContext): string` — 生成 mermaid DSL 的 prompt，包含：图表描述、上下文（章节文字摘要）、术语约束、输出格式要求（纯 mermaid DSL，无围栏标记）
    - `generateDrawioPrompt(context: DiagramGenerationContext): string` — 生成 draw.io XML 的 prompt，包含：图表描述、上下文、2-3 个 few-shot XML 模板（分层架构图、组件关系图、数据流图）、mxGraph 元素子集约束（仅 mxCell + geometry + 矩形/箭头/文本样式）、输出格式要求（纯 XML，以 `<mxGraphModel>` 开头）
    - `GENERATE_DIAGRAM_SYSTEM_PROMPT: string` — 系统提示，定义角色为"技术方案图表设计师"
    - `DiagramGenerationContext` 接口：`{ type: 'mermaid' | 'drawio', title: string, description: string, chapterText: string, terminologyContext?: string, language?: string }`
  - Notes: few-shot XML 模板从现有 draw.io 文档中提取最简化版本，确保可渲染

- [ ] **Task 5: （已合并到 Task 8）**
  - ~~创建独立文字校验 prompt~~ → 文字自检指令直接追加到 `generate-chapter.prompt.ts` 的输出要求中，不单独创建文件
  - Notes: 减少一次 AI 调用开销，Phase 1 = 生成 + 自检一体化

- [ ] **Task 6: 创建一致性校验 prompt**
  - File: `src/main/prompts/validate-text-diagram-coherence.prompt.ts`（新建）
  - Action: 导出：
    - `validateCoherencePrompt(context: CoherenceValidationContext): string` — 对抗式设计：必须列出至少 1 个潜在问题。检查维度：组件覆盖、术语统一、位置合理性。返回 JSON：`{ pass: boolean, issues: [{ type, description, suggestion }], checked_items: string[] }`
    - `VALIDATE_COHERENCE_SYSTEM_PROMPT: string`
    - `CoherenceValidationContext` 接口：`{ chapterText: string, diagrams: { title: string, type: string, content: string }[], terminologyContext?: string }`
  - Notes: maxTokens 设为 1024。issues 中 type 可为 `'missing-component' | 'terminology-mismatch' | 'position-issue' | 'other'`

#### Layer 2: 核心基础设施（依赖 Layer 1）

- [ ] **Task 7: 扩展 Orchestrator 支持多阶段 handler**
  - File: `src/main/services/agent-orchestrator/orchestrator.ts`
  - Action:
    - `AgentHandler` 类型签名扩展 options：`(context, { signal, updateProgress, aiProxy? })` → 返回类型改为 `Promise<AgentHandlerResult>`
    - **Breaking change 迁移**：所有现有 handler 当前返回 `Promise<AiRequestParams>`，必须包装为 `{ kind: 'params', value: existingReturn }`。涉及文件：
      - `generate-agent.ts` 的 3 个分支（`handleAskSystem`, `handleAnnotationFeedback`, `handleChapterGeneration`）
      - 其他已注册的 agent handler（如有）
    - `createExecutor` 方法修改：调用 handler 后，检查返回值的 `kind` 字段——`kind === 'result'` 则直接使用 `value` 为 result，跳过 `aiProxy.call()`；`kind === 'params'` 则用 `value` 走现有路径
    - `agents` map 类型扩展为 `{ handler, postProcessor?, needsAiProxy? }`
    - `registerAgent` 方法修改：新增可选参数 `needsAiProxy?: boolean`，存储到 `agents` map 中
    - **`execute()` 方法修改**（line 127）：从 `agents` map 读取 `needsAiProxy` 标志，传入 `createExecutor`。当前 `execute()` 独立调用 `createExecutor()`（火忘模式），必须也读取此标志，否则多阶段 handler 收不到 aiProxy
    - `createExecutor` 内部：当 `needsAiProxy` 为 true 时，将模块级 `import { aiProxy } from '@main/services/ai-proxy'`（line 5）传入 handler options（注意：不是 `this.aiProxy`，orchestrator 类没有此属性，aiProxy 是模块顶层单例 import）
  - Notes: 使用辨别联合 `{ kind: 'params' | 'result' }` 做类型区分。现有 handler 包装为 `{ kind: 'params', value: ... }` 是机械性改动，但必须确保所有分支都完成包装

- [ ] **Task 8: 修改章节生成 prompt 支持图表占位符 + 文字自检**
  - File: `src/main/prompts/generate-chapter.prompt.ts`
  - Action:
    - `GenerateChapterContext` 接口新增 `enableDiagrams?: boolean` 字段
    - `generateChapterPrompt()` 函数：当 `enableDiagrams === true` 时，在输出要求中追加：
      - 图表占位符指令：
        ```
        10. 在需要可视化图表的位置插入占位符，格式为 %%DIAGRAM:{type}:{title}:{base64_encoded_description}%%
            - type 为 mermaid 或 drawio
            - 优先使用 mermaid（流程图、时序图、状态图、甘特图、类图、树形图）
            - 仅在需要自由布局时使用 drawio
            - description 使用 base64 编码
            - 每个章节最多放置 3 个图表占位符
        ```
      - 文字自检指令（合并自原 Task 5）：
        ```
        11. 输出完成后进行自检：
            a) 必响应条款是否全部覆盖
            b) 内容是否严格限定在本章节范围内
            c) 术语是否与行业术语规范一致
            如发现问题，直接在输出中修正，不要输出自检报告
        ```
    - 新增 `shouldEnableDiagrams(chapterTitle: string): boolean` 函数——基于章节标题关键词白名单判断：包含"架构|技术方案|系统设计|模块设计|部署|拓扑|数据流|实施计划|功能设计|接口设计|安全设计|性能设计"则返回 true
  - Notes: 不修改 compliance matrix 章节的逻辑。文字自检合并到生成 prompt 中，减少一次独立 AI 调用

- [ ] **Task 9: terminologyPostProcessor 区域保护**
  - File: `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts`
  - Action:
    - 在术语替换逻辑中，先提取需要保护的区域：
      - mermaid 代码块：`` /```mermaid[\s\S]*?```/ `` 匹配的区间
      - drawio 注释行：`/^<!-- drawio:.*-->$/m` 匹配的行
      - 图表占位符行：`/^%%DIAGRAM:.*%%$/m` 匹配的行
    - 将保护区域替换为唯一占位符（`__PROTECTED_BLOCK_N__`），执行术语替换后还原
  - Notes: 与 markdown serializer 的占位符策略相同——先提取、替换、还原

#### Layer 3: 多阶段 Agent Handler（依赖 Layer 2）

- [ ] **Task 10a: 多阶段 handler 骨架 + Phase 1（文字生成）**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action:
    - 新增 `handleChapterGenerationWithDiagrams()` 异步函数，签名与 `AgentHandler` 一致但使用 `aiProxy`
    - 修改 `generateAgentHandler` 的分支逻辑：当 `context.enableDiagrams === true` 时调用新 handler
    - **Phase 1 (10%→20%)**：调用 aiProxy 生成文字+占位符（prompt 已含文字自检指令）→ 通过 `updateProgress(20, 'validating-text', { intermediateContent: textMarkdown })` 推送中间结果（第三参数为 `Record<string, unknown>` payload，Task 2b 扩展的签名）
    - 超时部分交付：在每个 phase 开始前检查 `signal.aborted`，如有中间结果，用 `removeAllPlaceholders()` 清理后返回
    - 返回 `{ kind: 'result', value: AgentExecuteResult }` 辨别联合
  - Notes: 先建立骨架和 Phase 1，确保纯文字路径仍然工作。~80 行

- [ ] **Task 10b: Phase 2（图表生成 + ReAct 校验循环）**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action:
    - 在 `handleChapterGenerationWithDiagrams()` 中实现 Phase 2 (35%→60%)：
      - 解析占位符：`parseDiagramPlaceholders(textMarkdown)`
      - 无占位符则跳过 Phase 2/3 走快速路径
      - 每个占位符：组装 DiagramGenerationContext → 调用 aiProxy 生成图表 → 工程硬约束校验 → 失败则 ReAct 循环（最多 3 轮，每轮只传当前结果+本轮校验反馈，不累积历史）
      - 3 轮仍失败则移除该占位符（降级为纯文本），log warning
      - 每完成一个图表：`updateProgress(progress, 'generating-diagrams', { diagramUpdate: { placeholderId, markdown } })`
    - 并发控制：`Promise.allSettled` + 简单 semaphore（上限 2）
    - **Draw.io Phase 2 输出格式**：AI 返回纯 XML（`<mxGraphModel>` 开头），handler 包装为 markdown 格式：`<!-- drawio:{uuid}:{shortId}.drawio -->\n![{title}](assets/{shortId}.png)`
    - **Mermaid Phase 2 输出格式**：AI 返回纯 DSL，handler 包装为 ` ```mermaid\n{dsl}\n``` `
  - Notes: ~120 行。ReAct 每轮 input = 压缩上下文 + 当前生成 + 校验反馈

- [ ] **Task 10c: Phase 3（一致性校验）+ Phase 4（组装返回）**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action:
    - **Phase 3 (80%→90%)**：占位符替换（逐个用 `replacePlaceholderWithDiagram()`）→ 调用 aiProxy 做一致性校验 → 解析 JSON 结果
      - 校验 `pass: false` 时：log issues 为 warning，**不阻塞交付**（v1 不做自动修正）
      - Phase 3 标记为 v1 可选——如需快速发布，可跳过此阶段直接进入 Phase 4
    - **Phase 4 (100%)**：返回 `{ kind: 'result', value: AgentExecuteResult }` 包含完整 markdown
    - v1 不做 checkpoint recovery（崩溃 = 重新执行全流程）
  - Notes: ~50 行。Phase 3 可选是为了快速迭代——核心价值在 Phase 1+2

- [ ] **Task 11: 修改章节生成服务配置**
  - File: `src/main/services/chapter-generation-service.ts`
  - Action:
    - `_dispatchGeneration()` 中 context 新增 `enableDiagrams: shouldEnableDiagrams(chapterTitle)` 字段
    - `CHAPTER_TIMEOUT_MS` 从 `120_000` 改为 `300_000`
    - 在 orchestrator.execute() 调用时，当 enableDiagrams 为 true 时传入 `options.needsAiProxy: true`（触发 aiProxy 注入）
  - Notes: 最小化改动，只添加 enableDiagrams flag 和调整超时

#### Layer 4: 渲染层（依赖 Layer 3）

- [ ] **Task 12: 扩展客户端生成状态管理 + 进度提示语**
  - File: `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
  - Action:
    - `progressToPhase()` 函数扩展新阶段名映射：
      ```typescript
      if (message === 'generating-text') return 'generating-text'
      if (message === 'validating-text') return 'validating-text'
      if (message === 'generating-diagrams') return 'generating-diagrams'
      if (message === 'validating-diagrams') return 'validating-diagrams'
      if (message === 'composing') return 'composing'
      if (message === 'validating-coherence') return 'validating-coherence'
      ```
    - `ChapterGenerationPhase` 类型扩展新阶段值（**注意**：类型定义在 `src/shared/chapter-types.ts`，需同步修改，已加入 files_to_modify）
    - `ChapterGenerationStatus` 新增 `intermediateContent?: string` 和 `diagramUpdates?: Record<string, string>` 字段（使用 `Record` 而非 `Map`，确保 JSON 序列化兼容任务恢复逻辑）
    - progress listener 中从 `event.payload` 提取数据（`payload` 为 `unknown`，需类型守卫）：
      - payload 含 `intermediateContent` 时更新 status.intermediateContent
      - payload 含 `diagramUpdate` 时追加到 status.diagramUpdates
    - 新增 PHASE_LABELS 映射（合并自原 Task 16）：
      ```typescript
      const PHASE_LABELS: Record<string, string> = {
        'analyzing': '正在分析章节上下文...',
        'generating-text': '正在撰写章节内容...',
        'validating-text': '正在检查文字质量...',
        'generating-diagrams': '正在生成图表...',
        'validating-diagrams': '正在验证图表...',
        'composing': '正在整合内容...',
        'validating-coherence': '正在检查文图一致性...',
        'matching-assets': '正在匹配资产...',
        'generating': '正在生成...',
        'annotating-sources': '正在标注来源...',
      }
      ```
    - `generating-diagrams` 阶段如 message 包含 `(1/N)` 格式则显示具体进度
  - Notes: 保持 `completed` / `conflicted` / `failed` 等终态逻辑不变。保留旧阶段名的提示语确保向后兼容

- [ ] **Task 13: 实现渐进式交付的内容注入**
  - File: `src/renderer/src/modules/editor/components/EditorView.tsx`
  - Action:
    - 新增 watch effect 监听 `status.intermediateContent` 变化：
      - 当 phase 为 `validating-text` 且有 `intermediateContent` 时：
        - 将 `%%DIAGRAM:...%%` 占位符替换为骨架屏 markdown 标记：`> %%DIAGRAM-SKELETON:{placeholderId}:{title}%%`（**先转换占位符，再 sanitize**——避免 sanitize 意外处理占位符）
        - 调用 `sanitizeGeneratedContent()` 清理 markdown
        - 调用 `replaceSectionRef.current()` 注入编辑器
        - **关键：注入后更新 `baselineDigest`**（重新计算当前文档内容的 digest），防止 Phase 4 完成时误判为用户手动编辑导致虚假冲突弹窗
        - **关键：将当前 key 加入 `intermediateInjectedKeysRef`**（新增 ref），Phase 4 `completed` 处理中检查此 ref：如果 intermediate 已注入且用户未手动编辑（digest 匹配），直接用 final content 替换，不触发冲突检测
    - 新增 watch effect 监听 `status.diagramUpdates` 变化：
      - 收到新的 diagramUpdate 时：
        - 获取当前编辑器 markdown
        - 用 regex 匹配 `> %%DIAGRAM-SKELETON:{placeholderId}:...%%` 并替换为实际图表 markdown
        - 重新 setValue 更新编辑器
        - 更新 `baselineDigest`（每次图表增量注入后都刷新 baseline）
    - `completed` phase 处理逻辑调整：如果 `intermediateInjectedKeysRef` 包含此 key 且 baselineDigest 匹配（用户未手动编辑），直接用 final content 替换，跳过冲突检测。如果 digest 不匹配（用户已编辑），走现有冲突检测流程
  - Notes: 骨架屏使用 `%%DIAGRAM-SKELETON%%` 格式。**操作顺序关键**：先占位符→骨架屏转换，再 sanitize。每次注入后刷新 baselineDigest 是防止虚假冲突的核心机制

- [ ] **Task 14: DrawioElement xml-only 模式 + 离线降级**
  - File: `src/renderer/src/modules/editor/components/DrawioElement.tsx`
  - Action:
    - 在组件 mount / props 变化时检测：`xml` 存在（非空）且 `pngDataUrl` 为空/undefined
    - 进入 "rendering" 状态：显示 spinner + "正在渲染图表..."
    - **在线路径**：自动启动 draw.io iframe 渲染流程：
      - 创建隐藏的 draw.io iframe（复用现有 DrawioEditor 的 postMessage 协议）
      - iframe 加载超时 5s → 视为离线，走降级路径
      - 发送 xml → 等待渲染完成 → 导出 PNG
      - 调用 `window.api.drawioSaveAsset({ projectId, diagramId, xml, pngBase64, fileName })` 持久化
      - 更新 element node 的 `pngDataUrl` 字段
    - **离线降级路径**：
      - 显示 XML 结构预览（提取 `<mxCell value="...">` 的标签列表，最多显示 10 个节点）
      - 显示提示："连接网络后自动渲染完整图表" + "双击手动编辑"
      - 监听 `window.addEventListener('online', ...)` → 网络恢复后自动重试 PNG 渲染
    - 渲染失败时（非网络原因）：显示 XML 代码的前 200 字符预览 + "双击编辑" 提示
  - Notes: 隐藏 iframe 需挂载到 document.body（Spike B 验证）。离线降级确保 local-first 架构下文档仍可正常使用。

- [ ] **Task 14b: MermaidElement AI 插入自动持久化**
  - Files: `src/renderer/src/modules/editor/components/MermaidElement.tsx`, `src/shared/mermaid-types.ts`
  - Action:
    - `MermaidElementData` 接口新增 `svgPersisted?: boolean` 字段（在 `src/shared/mermaid-types.ts`，已加入 files_to_modify）
    - 检测 AI 插入的 mermaid 元素：`source` 存在（非默认模板 `MERMAID_DEFAULT_TEMPLATE`）且 `svgPersisted !== true`
    - 自动触发：`MermaidRenderer.render()` → 获取 SVG → 调用 `window.api.mermaidSaveAsset({ projectId, assetFileName, svgContent })` 持久化
    - 持久化成功后通过 `editor.tf.setNode()` 更新 node data：`{ svgPersisted: true }` — 写入 Plate node data（非 React state），确保组件 unmount/remount（滚动）后标记不丢失
    - 在 useEffect 中检查 `svgPersisted` 字段，已为 true 则跳过
  - Notes: 使用 node data 而非 React useState 存储 persisted 标记是关键——useState 在组件 remount 时重置，导致每次滚动都重复调用 saveMermaidAsset

- [ ] **Task 15: 确认 sanitizeGeneratedChapterMarkdown 兼容性**
  - File: `src/shared/chapter-markdown.ts`（`sanitizeGeneratedChapterMarkdown()` 在 ~line 320）
  - Action:
    - 确认该函数不会剥离：
      - mermaid 代码块（` ```mermaid ` ... ` ``` `）
      - drawio HTML 注释（`<!-- drawio:... -->`）
      - 图表占位符（`%%DIAGRAM:...%%`）
      - 骨架屏 blockquote 标记（`> %%DIAGRAM-SKELETON:...%%`）
    - 如果存在剥离行为，添加对应的保护逻辑
  - Notes: 该函数当前主要做标题重复移除等清理，大概率不需要修改，但必须验证

#### Layer 5: Spike 验证

- [ ] **Spike A: mermaid 主进程语法校验方案验证**
  - Action:
    1. 评估 `@mermaid-js/mermaid-parser`：`pnpm add @mermaid-js/mermaid-parser` → 在 Node.js 脚本中测试 `parse()` 是否可用且无 DOM 依赖
    2. 如 parser 包不可用：测试 `import { parse } from 'mermaid'` 在 Electron main 进程（Node.js 环境）是否可用
    3. 如均不可用：确认正则备选方案的校验边界（哪些语法错误会漏过），评估是否可接受
    4. 产出结论：推荐的 `validateMermaidSyntax` 实现方案（parser 包 / mermaid 全量 / 正则）
  - Notes: **阻塞 Task 3** 的 `validateMermaidSyntax` 实现方案选择。必须在 Layer 1 之前完成

- [ ] **Spike B: draw.io iframe 隐藏渲染验证**
  - Action:
    - 测试 draw.io iframe 在 `display:none` 或 offscreen 状态下是否能正常渲染并导出 PNG
    - 如不能，测试 `visibility:hidden` + 固定尺寸作为替代
  - Notes: 阻塞 Task 14 的 xml-only 自动渲染实现方案。可与 Spike A 并行

### Acceptance Criteria

#### 核心流程

- [ ] AC-1: Given 一个技术方案类章节（如"总体架构设计"），when 用户点击生成，then Phase 1 完成后文字内容立即显示在编辑器中，图表占位位置显示骨架屏
- [ ] AC-2: Given Phase 1 已完成且包含 mermaid 占位符，when Phase 2 生成 mermaid 图表完成，then 图表自动替换骨架屏，编辑器中渲染为可交互的 Mermaid void 元素
- [ ] AC-3: Given Phase 1 已完成且包含 drawio 占位符，when Phase 2 生成 draw.io XML 通过工程校验，then 图表自动替换骨架屏，编辑器中渲染为 Draw.io void 元素（可能先显示"渲染中"，PNG 异步生成）
- [ ] AC-4: Given 一个纯文字类章节（如"项目背景"），when 用户点击生成，then AI 不生成任何图表占位符，章节以纯文字形式完成，耗时与当前版本一致

#### 图表校验

- [ ] AC-5: Given AI 生成了一段语法错误的 mermaid DSL，when 工程硬约束校验失败，then 触发 ReAct 修正循环，最多重试 3 轮
- [ ] AC-6: Given AI 生成了一段非法的 draw.io XML（如缺少 `<mxGraphModel>` 根元素），when 工程硬约束校验失败，then 触发 ReAct 修正循环，最多重试 3 轮
- [ ] AC-7: Given 图表经过 3 轮 ReAct 仍未通过校验，when 最终校验仍然失败，then 该图表的占位符被移除，章节该位置退化为纯文本，不影响其他已成功的图表

#### 文字校验与一致性校验

- [ ] AC-8: Given Phase 1 生成了文字内容，when 文字自检发现必响应条款未覆盖，then 校验结果中 issues 包含 `dimension: '必响应条款'` 的条目
- [ ] AC-9: Given Phase 3 一致性校验执行，when 文中提到"参数解析层"但图表中未体现，then 校验结果中 issues 包含 `type: 'missing-component'` 的条目

#### 容错与降级

- [ ] AC-10: Given 四阶段流水线执行中，when Phase 2 超时（总耗时达 300s），then 返回 Phase 1 的文字 + 已完成的图表 + 清理未完成的占位符，用户看到的是不完整但可用的内容
- [ ] AC-11: Given AI 输出中完全没有 `%%DIAGRAM%%` 占位符（退化情况），when Phase 1 完成，then 跳过 Phase 2/3，直接走 Phase 4 快速路径，行为等同现有版本
- [ ] AC-12: Given 用户在 Phase 1 文字上屏后手动编辑了内容，when Phase 2 图表完成试图更新编辑器，then 触发现有的冲突检测机制，用户可选择保留手动编辑或接受 AI 更新

#### 术语保护

- [ ] AC-13: Given AI 生成了包含 mermaid 代码块的 markdown，when terminologyPostProcessor 执行术语替换，then mermaid 代码块内的文本不被替换，代码块语法不被破坏
- [ ] AC-14: Given AI 生成了包含 `%%DIAGRAM%%` 占位符的 markdown，when terminologyPostProcessor 执行术语替换，then 占位符内容不被替换

#### Draw.io xml-only 模式

- [ ] AC-15: Given 编辑器中插入了一个 xml-only 的 draw.io 元素（有 xml，无 pngDataUrl），when 元素首次渲染，then 自动启动 PNG 生成流程，完成后 PNG 持久化到磁盘
- [ ] AC-16: Given xml-only draw.io 元素的 PNG 渲染失败，when 组件检测到渲染错误，then 显示 XML 预览 + "双击编辑"提示，不阻塞编辑器

#### 重新生成场景

- [ ] AC-17: Given 一个已包含 AI 生成图表的技术方案章节，when 用户点击重新生成，then 走完整四阶段流水线，新图表替换旧图表，旧图表资产清理或覆盖

## Additional Context

### Dependencies

**新增依赖：**
- `fast-xml-parser` — XML well-formedness 校验（draw.io XML 工程硬约束），~100KB

**可能新增（Spike A 决定）：**
- `@mermaid-js/mermaid-parser`（首选） — 纯语法解析器，无 DOM 依赖，适用于 main 进程
- `mermaid`（main 进程端，备选） — 仅用 `parse()` 做语法校验，但可能因 DOM 依赖无法在 Node.js 加载

**现有依赖复用：**
- `mermaid`（renderer 端已安装） — MermaidRenderer 已使用
- draw.io iframe embed — DrawioEditor/DrawioElement 已使用
- `aiProxy` — 所有 AI 调用的统一入口
- `task-queue` — 异步任务管理

### Testing Strategy

**单元测试（Vitest）：**

| 测试文件 | 覆盖范围 |
|---------|---------|
| `tests/unit/main/services/diagram-validation-service.test.ts` | XML 校验（合法/非法 XML）、mermaid 校验（合法/非法语法）、占位符解析、占位符替换、占位符移除 |
| `tests/unit/main/prompts/generate-diagram.prompt.test.ts` | mermaid/drawio prompt 上下文注入、few-shot 模板包含、输出格式要求 |
| `tests/unit/main/prompts/generate-chapter.prompt.test.ts` | enableDiagrams 图表占位符指令 + 文字自检指令、shouldEnableDiagrams 白名单 |
| `tests/unit/main/prompts/validate-text-diagram-coherence.prompt.test.ts` | 一致性校验 prompt 对抗式要求 |
| `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` | handler 返回 `{ kind: 'params' }` 走旧路径、返回 `{ kind: 'result' }` 走新路径、aiProxy 注入、execute() 火忘路径读取 needsAiProxy |
| `tests/unit/main/services/task-queue/progress-emitter.test.ts` | payload 事件绕过节流、无 payload 事件正常节流、progress=100 不节流 |
| `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts` | enableDiagrams=false 走旧逻辑、enableDiagrams=true 走多阶段（10a/10b/10c 分别测试）、Phase 2 并发控制、ReAct 循环、超时部分交付 |
| `tests/unit/main/services/chapter-generation-service.test.ts` | shouldEnableDiagrams 白名单、enableDiagrams 上下文传递、超时设置 |
| `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts` | 新阶段名映射、payload 类型守卫、intermediateContent 处理、diagramUpdate 处理、PHASE_LABELS 映射 |
| `tests/unit/renderer/modules/editor/components/MermaidElement.test.ts` | AI 插入检测、自动 SVG 持久化触发、persisted 状态防重复 |

**集成测试要点：**
- AI 输出 → 占位符解析 → 图表生成 → 校验 → 替换 → markdown 反序列化 → Plate 渲染全链路
- terminologyPostProcessor 处理含 mermaid 的 AI 输出不破坏格式
- DrawioElement xml-only → iframe 渲染 → PNG 持久化
- MermaidElement AI 插入 → 自动 SVG 渲染 → saveMermaidAsset 持久化
- 重新生成场景：旧图表资产清理 + 新图表替换

**手动测试步骤：**
1. 打开一个包含"总体架构设计"章节的项目，点击生成
2. 验证：文字先上屏 → 骨架屏显示 → 图表逐个填入 → 最终渲染
3. 验证 mermaid 图表可双击编辑、保存
4. 验证 draw.io 图表 PNG 生成完成后可双击编辑
5. 打开一个"项目背景"章节，点击生成，验证无图表占位符、速度与旧版一致
6. 手动破坏 AI 返回内容（在 trace 中确认），验证 ReAct 重试和降级行为

### Risk Register

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Draw.io XML ReAct 收敛率低 | 高 | 中 | mermaid 优先策略 + few-shot 模板 + 最小化 XML 子集 + 降级为纯文本 |
| 多图表生成耗时过长 | 中 | 高 | 渐进式交付 + 并发上限 2 + 部分交付 |
| terminologyPostProcessor 破坏图表语法 | 高 | 高 | 区域保护（跳过 mermaid/drawio/占位符区域） |
| 一致性校验沦为橡皮图章 | 中 | 低 | 对抗式 prompt + 结构化 JSON + 强制列出问题 |
| ReAct 循环 token 爆炸 | 中 | 中 | 每轮不累积历史 + input token 上限 |
| 占位符格式注入 | 低 | 高 | `%%DIAGRAM%%` 格式 + base64 编码 description |
| DrawioElement PNG 未生成时保存/导出 | 中 | 中 | xml-only 模式自动渲染 + 导出前检查 |
| AI 不生成占位符（退化） | 中 | 低 | 跳过 Phase 2/3 走快速路径（等同现有行为） |
| mermaid 在 main 进程不可用（DOM 依赖） | 高 | 中 | 优先评估 `@mermaid-js/mermaid-parser`（纯解析器）；最终备选正则校验 |
| draw.io iframe 离线不可用 | 高 | 中 | 离线降级显示 XML 预览 + 网络恢复自动重试（TD-4） |
| 渐进式交付破坏冲突检测 | 高 | 高 | Phase 1/Phase 2 注入后刷新 baselineDigest + intermediateInjectedKeysRef 防二次注入 |
| MermaidElement remount 重复持久化 | 中 | 中 | `svgPersisted` 写入 Plate node data（非 React state），remount 后仍可读取 |
| progress event payload 被节流丢弃 | 中 | 高 | 携带 payload 的事件绕过 200ms 节流（Task 2b） |
| AgentHandler 返回类型 breaking change | 确定 | 低 | 机械性包装 `{ kind: 'params', value: ... }`，Task 7 明确列出所有需修改的分支 |

### Notes

- 当前 Markdown 反序列化器已支持 mermaid（裸代码块，自动生成 UUID 和 assetFileName）和 draw.io（comment+image 对）的解析，Phase 4 可直接复用
- 当前 AI 输出无任何图表内容，17 条历史生成记录均为纯文本
- 图表资产持久化：mermaid 由 MermaidElement 检测 AI 插入后自动渲染 SVG 并调用 saveMermaidAsset，draw.io 由 DrawioElement 检测 xml-only 后自动渲染 PNG 并调用 saveDrawioAsset
- `sanitizeGeneratedChapterMarkdown()` 位于 `src/shared/chapter-markdown.ts` ~line 320，需确认不会剥离 mermaid 代码块、drawio 注释和 `%%DIAGRAM%%` / `%%DIAGRAM-SKELETON%%` 占位符
- terminologyPostProcessor 位于 `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts`，需区域保护跳过 mermaid/drawio/占位符区域
- Phase 2 图表并发上限 2，防止 ai-proxy 速率限制。进度细化为 "生成图表 1/N"
- **推荐实施顺序**：Spike A+B 并行 → Layer 1（含 Task 2b）全部可并行 → Layer 2 可并行 → Layer 3（10a → 10b → 10c 顺序） → Layer 4 可并行
- v1 简化：Phase 3 一致性校验标记为可选（可跳过直接交付），不做 checkpoint recovery（崩溃 = 重新执行）
- 文字校验已合并到生成 prompt 中（Task 5 → Task 8），减少一次独立 AI 调用
- 进度提示语已合并到 Task 12（原 Task 16），减少独立 Layer 5
- 预估总代码量：~800-1000 行新代码 + ~200 行修改
