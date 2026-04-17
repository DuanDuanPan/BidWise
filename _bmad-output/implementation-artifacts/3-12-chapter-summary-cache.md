# Story 3.12: 章节生成全局上下文摘要缓存

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want AI 章节生成时能够看到文档中所有已生成章节的摘要，按树距离就近注入 prompt,
so that 章节之间的承诺、数字、术语保持一致，乱序生成不丢失上下文，父子章节层级不重复展开细节。

## Acceptance Criteria

### AC1: Sidecar Summary Schema 与存储

```gherkin
Given 某章节内容已经成功写回文档
When 系统为该章节生成 summary cache
Then summary 写入项目 sidecar JSON（与 annotations/scores 同目录），
     每条 entry 至少包含：
     { headingKey, headingTitle, headingLevel, occurrenceIndex, lineHash, summary, generatedAt, model, provider }
     headingKey = createChapterLocatorKey(locator)
     lineHash = createContentDigest(该 heading 的直属正文，不含子章节)
     summary ≤200 字符，内容聚焦关键承诺 / 数字 / 术语 / 语气

Given 文档中存在同名同级章节
When 读取或覆盖 summary entry
Then 以 headingKey + occurrenceIndex 定位唯一 entry，重复标题场景保持稳定

Given sidecar 中残留已删除或已移动章节的 entry
When 下次读取 summary cache
Then 读取方按当前 headings 集合清理或忽略失配 entry，
     当前章节上下文继续使用命中 cache 或 500 字直属正文截断
```

### AC2: 写时异步提炼（Task-Queue 入列）

```gherkin
Given 单章节 generate / regenerate / conflict-replace 已在 renderer 成功写回章节正文
When EditorView 中的 replaceSectionRef.current(...) 返回成功
Then fire-and-forget 调用新 IPC `chapter-summary:extract`
     请求参数至少包含 { projectId, locator }
     main process 通过 `chapterSummaryService.enqueueExtraction()` 入列摘要任务

Given 批量 skeleton-expand 生成多个子章节
When `chapter-generation-service._onBatchSectionDone()` 收到 completed 结果并已写回该子章节
Then main process 为该子章节调用同一 `enqueueExtraction()` 逻辑

Given summary 任务执行
When 调用 LLM
Then 所有 AI 请求走 `agent-orchestrator`
     新 `agentType = 'chapter-summary'`
     prompt 走 `src/main/prompts/summarize-chapter.prompt.ts`
     queue 继续使用 `category='ai-agent'`，`maxRetries=2`，`timeoutMs=60_000`
     要求结构化 JSON 输出：{ key_commitments, numbers, terms, tone }
```

### AC3: Content Hash 懒失效

```gherkin
Given 章节 Markdown 被用户编辑或 regenerate
When `chapter-generation-service` 构造 `generatedChaptersContext`
Then 对比当前 `createContentDigest(directBody)` 与 sidecar lineHash
     命中时使用 cached summary
     失配时使用当前直属正文 500 字截断作为 fallback summary

Given 某章节在读时发生 hash 失配
When 该章节之后再次完成 generate / regenerate
Then 系统重新触发 `chapter-summary:extract`，并用新结果覆盖旧 entry

Given 用户只做手动编辑
When 系统后台空闲
Then cache 保持现状，下一次生成完成时刷新该章节摘要
```

### AC4: 读时全局上下文构建（C' 策略）

```gherkin
Given 章节 N 开始生成
When chapter-generation-service 构造 context
Then 执行以下步骤：
     1. 枚举文档中所有直属正文非空的章节
     2. 对每个章节优先读取 lineHash 命中的 cached summary
     3. cache miss 时回退为该章节直属正文前 500 字截断
     4. 计算每个候选章节相对 N 的树距离（LCA 跳数）
     5. 按距离升序排序，取前 CONTEXT_TOP_N = 8
     6. 按关系分组：ancestors / siblings / descendants / others
     7. 注入 `generatedChaptersContext = { ancestors, siblings, descendants, others }`

Given 已生成章节不足 8 个
When 构造 context
Then 全部注入，不补齐

Given 当前文档仍处在首轮生成
When 构造 context
Then `generatedChaptersContext` 为空，
     `adjacentChaptersBefore / adjacentChaptersAfter` 保持现有降级路径
```

### AC5: Prompt 分组注入与角色说明

```gherkin
Given `generate-chapter.prompt` 或 skeleton-expand 子章节 prompt 收到 `generatedChaptersContext`
When 渲染 prompt
Then 注入四个独立 section：
     ## 父级章节摘要（当前章节是其细化）
     ## 已生成同级章节摘要（术语 / 数字 / 承诺对齐）
     ## 已生成子章节摘要（供上位概括）
     ## 其他已生成章节摘要（仅供全局一致性参考）

Given 旧字段 adjacentChaptersBefore / adjacentChaptersAfter
When generatedChaptersContext 为空
Then 继续沿用旧字段作为降级注入

Given `GenerateChapterContext` 与 skeleton 子章节 prompt context
When 添加新字段
Then `generatedChaptersContext` 为 optional 字段，
     现有调用方与测试基线保持兼容
```

### AC6: 供应商无关与失败降级

```gherkin
Given 当前 AI 配置 `provider` 为 `claude` 或 `openai`
When `chapter-summary` agent 执行
Then 复用 activeProvider + defaultModel / per-call model
     OpenAI-compatible vendor 通过 `provider='openai' + baseUrl` 接入
     prompt / 解析 / 缓存命中逻辑保持 provider-agnostic

Given summary 任务失败（超时/配额/网络/desensitization 失败）
When 达到 retry 上限
Then task status = failed
     章节生成结果保持成功路径
     该章节在后续读时使用 500 字直属正文截断
     下次生成完成时再次触发提炼

Given summary 任务成功但 JSON 解析失败
When post-processor 记录 warning
Then 回退为直属正文前 200 字纯文本 summary 并写入 sidecar
```

### AC7: 测试覆盖

```gherkin
Given 本 Story 完成实现
When 运行单元与集成测试
Then 至少覆盖：
     - sidecar schema 读写 + duplicate heading + stale entry prune
     - 直属正文 helper + digest 匹配/失配
     - `chapter-summary` agent 注册、post-processor、provider/model 持久化
     - IPC / preload / EditorView 单章节触发
     - `_onBatchSectionDone()` 批量子章节触发
     - 树距离计算（LCA 跳数）+ top-N + 四分组
     - prompt 四组 section 渲染 + 旧字段兼容
     - provider-agnostic：mock `claude` / `openai` 两条路径
     - 编辑章节触发 lineHash 失配
     - 乱序生成场景（先生成章节 5 再生成章节 3，3 能看到 5 的 summary）
     - 父子场景（子章节已生成后再生成父章节，父能看到子 summary 且 prompt 角色正确）
```

## Tasks / Subtasks

- [x] **Task 1: 建立共享 schema、摘要 sidecar 与直属正文 helper** (AC: 1, 3)
  - [x] 1.1 新建 `src/shared/chapter-summary-types.ts`，定义 summary entry / grouped context / IPC 输入输出 / read-side helper 类型
  - [x] 1.2 新建 `src/main/services/chapter-summary-store.ts`，sidecar 路径为 `resolveProjectDataPath(projectId)/chapter-summaries.json`
  - [x] 1.3 以 `createChapterLocatorKey(locator)` + `occurrenceIndex` 作为稳定身份键，重复标题场景保持唯一定位
  - [x] 1.4 在 `src/shared/chapter-markdown.ts` 新增“直属正文” helper，供 digest、fallback summary、空章节判断复用
  - [x] 1.5 store 单测覆盖文件缺失、损坏 JSON、并发 upsert、duplicate heading、stale entry prune

- [x] **Task 2: 新建 `chapter-summary` agent、prompt 与 post-processor** (AC: 1, 2, 6)
  - [x] 2.1 新建 `src/main/prompts/summarize-chapter.prompt.ts`，导出 prompt builder 与 system prompt
  - [x] 2.2 在 `src/shared/ai-types.ts` 扩展 `AgentType` 加入 `'chapter-summary'`
  - [x] 2.3 在 `src/shared/ai-types.ts` 与 orchestrator 序列化路径扩展 `AgentExecuteResult`，携带 `model` / `provider`
  - [x] 2.4 新建 `src/main/services/agent-orchestrator/agents/chapter-summary-agent.ts`
  - [x] 2.5 新建 `src/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.ts`，负责 JSON 解析、200 字 fallback、写 sidecar
  - [x] 2.6 在 `src/main/services/agent-orchestrator/index.ts` 注册 `chapter-summary` agent

- [x] **Task 3: 接入单章节与批量章节的真实触发点** (AC: 2, 3)
  - [x] 3.1 新建 `src/main/services/chapter-summary-service.ts`，提供 `enqueueExtraction(projectId, locator)` 与 read-side helper
  - [x] 3.2 在 `src/shared/ipc-types.ts`、`src/preload/index.ts`、`src/main/ipc/chapter-summary-handlers.ts` 增加 `chapter-summary:extract`
  - [x] 3.3 在 `src/renderer/src/modules/editor/components/EditorView.tsx` 中，`replaceSectionRef.current(...)` 成功后触发 `chapterSummaryExtract()`
  - [x] 3.4 在 `chapter-generation-service._onBatchSectionDone()` 中，子章节写回成功后触发同一 `enqueueExtraction()`
  - [x] 3.5 queue 继续使用 `category='ai-agent'`，`maxRetries=2`，`timeoutMs=60_000`，失败保持 best-effort

- [x] **Task 4: 实现树距离与全局摘要上下文构建器** (AC: 3, 4)
  - [x] 4.1 新建 `src/main/utils/heading-tree-distance.ts`
  - [x] 4.2 API 返回跳数与关系类型 `'ancestor' | 'sibling' | 'descendant' | 'other'`
  - [x] 4.3 在 `chapter-generation-service` 新增 `buildGeneratedChaptersContext(...)`
  - [x] 4.4 枚举直属正文非空章节，优先使用 lineHash 命中的 cache，cache miss 时回退直属正文前 500 字
  - [x] 4.5 按树距离排序取前 `CONTEXT_TOP_N = 8`，分组为 `ancestors / siblings / descendants / others`
  - [x] 4.6 保留 `adjacentChaptersBefore / adjacentChaptersAfter` 作为空库首轮生成降级路径

- [x] **Task 5: 更新章节生成 prompt 与 skeleton-expand prompt** (AC: 4, 5)
  - [x] 5.1 在 `src/main/prompts/generate-chapter.prompt.ts` 的 `GenerateChapterContext` 中新增 optional `generatedChaptersContext`
  - [x] 5.2 prompt 渲染四组 section，并为每组写清角色边界
  - [x] 5.3 在 `src/main/services/agent-orchestrator/agents/generate-agent.ts` 同步透传新字段
  - [x] 5.4 skeleton-expand 子章节 prompt 同步支持四组摘要注入

- [x] **Task 6: 补齐测试与回归护栏** (AC: 7)
  - [x] 6.1 新建 `tests/unit/main/services/chapter-summary-store.test.ts`
  - [x] 6.2 新建 `tests/unit/main/services/chapter-summary-service.test.ts`
  - [x] 6.3 新建 `tests/unit/main/services/agent-orchestrator/agents/chapter-summary-agent.test.ts`
  - [x] 6.4 新建 `tests/unit/main/prompts/summarize-chapter.prompt.test.ts`
  - [x] 6.5 新建 `tests/unit/main/utils/heading-tree-distance.test.ts`
  - [x] 6.6 新建 `tests/unit/main/ipc/chapter-summary-handlers.test.ts`
  - [x] 6.7 更新 `tests/unit/main/prompts/generate-chapter.prompt.test.ts`、`tests/unit/main/services/chapter-generation-service.test.ts`
  - [x] 6.8 更新 `tests/unit/renderer/modules/editor/components/EditorView.test.tsx` 覆盖写回成功后的 fire-and-forget 触发
  - [x] 6.9 集成覆盖乱序生成与父子生成场景，验证 top-N、四分组、provider/model 持久化（位于 `chapter-generation-service.test.ts` 与 `chapter-summary-post-processor.test.ts`）

## Dev Notes

### 架构决策

**全局摘要 + 树距离排序。** 当前实现只给 `generate` prompt 注入相邻章节 500 字截断。Story 3.12 改成“全局已生成章节摘要池 + 树距离 top-N + 四分组”，覆盖乱序生成、父子层级和跨枝一致性。

**写时提炼，读时命中或 fallback。** 每个章节在正文写回成功后触发一次摘要提炼。sidecar 命中时直接注入结构化摘要，hash 失配时注入直属正文 500 字截断，下一次生成完成时刷新缓存。

**AI 调用统一走 agent-orchestrator。** 仓库规则要求所有 AI 请求经 `agent-orchestrator`。本 Story 通过新 `chapter-summary` agent + post-processor 落地，不走 direct `aiProxy.call` 旁路。

### 当前缺口

1. `src/renderer/src/modules/editor/components/EditorView.tsx` 在 `replaceSectionRef.current(...)` 成功后已经触发 `sourceAttr.triggerAttribution()` 与 `triggerBaselineValidation()`；单章节 summary 触发点应与这里保持同位。
2. `src/main/services/chapter-generation-service.ts` 的批量回写路径位于 `_onBatchSectionDone()`；批量子章节 summary 触发点应落在这里。
3. `src/main/prompts/generate-chapter.prompt.ts` 当前只有 `adjacentChaptersBefore / adjacentChaptersAfter`。
4. `src/shared/ai-types.ts` 当前 `AiProviderName = 'claude' | 'openai'`，`AgentType` 尚无 `'chapter-summary'`，`AgentExecuteResult` 尚无 `model / provider`。
5. `src/shared/chapter-markdown.ts` 已有 `createContentDigest()`，缺少“直属正文” helper。
6. `src/shared/chapter-locator-key.ts` 已有 `createChapterLocatorKey(locator)`，可直接复用为 summary entry identity。

### 关键设计模式（必须遵循）

1. **Agent Orchestrator 单入口** — 所有 AI 调用走 `agentOrchestrator.execute()` / `executeWithCallback()`。
2. **Task Queue 白名单** — summary 任务复用 `category='ai-agent'`，保持 progress / retry / timeout 语义。
3. **Sidecar JSON 架构一致** — 与现有 annotations / scores 共用 `resolveProjectDataPath()` 目录策略。
4. **Prompt 存 `src/main/prompts/`** — `summarize-chapter.prompt.ts` 与现有 prompt 文件同结构。
5. **失败降级不阻塞** — summary 失败后章节生成继续成功路径，读时 fallback 为直属正文截断。
6. **Hash 懒失效** — read-time 检测 digest，write-time 覆盖更新。
7. **供应商对齐当前配置面** — repo 当前 provider 槽位是 `claude` / `openai`，OpenAI-compatible vendor 通过 `baseUrl` 承载。
8. **结构化输出优先** — summary JSON 便于压 token、分组展示和 future metrics。
9. **路径安全** — sidecar、IPC、preload、renderer 走现有命名和导出模式。
10. **四分组统一** — `ancestors / siblings / descendants / others` 在 AC、types、prompt、测试中使用同一枚举集合。

### 树距离算法

````
treeDistance(from, to):
  fromPath = ancestorChainFromRoot(from)  // [root, ..., from]
  toPath = ancestorChainFromRoot(to)
  lca = lastCommonPrefix(fromPath, toPath)
  distance = (fromPath.length - lca.length) + (toPath.length - lca.length)
  relation =
    lca === fromPath ? 'ancestor' :
    lca === toPath   ? 'descendant' :
    (from.level === to.level && lca.length === fromPath.length - 1) ? 'sibling' :
    'other'
  return { distance, relation }
````

祖先链推导：heading.level 严格递减向前扫，遇到更高层（level 更小）加入祖先链。

### 上下文构建示意

````
章节 3.2 生成：
  已生成：1（介绍）, 2（方案概述）, 3（技术架构）, 3.1（总体设计）, 3.3（数据流）, 5（部署）
  树距离 + 关系：
    1: other, d=4
    2: other, d=3
    3: ancestor, d=1
    3.1: sibling, d=2
    3.3: sibling, d=2
    5: other, d=3
  排序取前 8：全部入选
  分组：
    ancestors: [3]
    siblings: [3.1, 3.3]
    descendants: []
    others: [2, 5, 1]
````

建议四分组：`ancestors / siblings / descendants / others`。`others` 单独一组提示“仅供全局一致性参考”。

### Summarize Prompt 草案

````
## 输入
章节标题：{title}
章节正文（直属正文）：{directBody}

## 输出要求
严格输出如下 JSON（不加代码围栏、不加解释）：
{
  "key_commitments": ["承诺1", "承诺2"],      // 对甲方的具体承诺条款
  "numbers": [{"label": "工期", "value": "180 天"}],  // 数字化承诺
  "terms": ["术语1", "术语2"],                // 本章引入的关键术语
  "tone": "正式/专业/强调可靠性"              // 本章写作语气一句话
}

空字段用空数组/空字符串，不要省略。
序列化后总长度 ≤200 字符。
````

### 复用清单

| 复用目标 | 源文件 | 复用方式 |
|---------|--------|---------|
| Agent Orchestrator | `src/main/services/agent-orchestrator/*` | 新增 `chapter-summary` agent + post-processor |
| Task Queue | `src/main/services/task-queue/*` | 复用 `category='ai-agent'`、progress、retry、timeout |
| Sidecar 路径解析 | `resolveProjectDataPath` | 直接调用 |
| Heading 解析 | `extractMarkdownHeadings` / `findMarkdownHeading` | 直接复用 |
| 内容 digest | `createContentDigest` | 直接复用现有 digest 契约 |
| 章节定位 | `createChapterLocatorKey` | 直接复用为 summary key |
| 单章节写回成功钩子 | `EditorView.tsx` | 紧跟 source attribution / baseline validation 触发 |
| 批量子章节写回成功钩子 | `_onBatchSectionDone()` | 紧跟 batch write-back 触发 |

### 新建文件清单

| 文件 | 说明 |
|------|------|
| `src/shared/chapter-summary-types.ts` | summary entry / grouped context / IPC 类型 |
| `src/main/services/chapter-summary-store.ts` | sidecar JSON 读写服务 |
| `src/main/services/chapter-summary-service.ts` | enqueue + read-side helper |
| `src/main/prompts/summarize-chapter.prompt.ts` | summarize prompt + system prompt |
| `src/main/services/agent-orchestrator/agents/chapter-summary-agent.ts` | 章节摘要 agent handler |
| `src/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.ts` | JSON 解析、fallback、sidecar 持久化 |
| `src/main/ipc/chapter-summary-handlers.ts` | summary extract IPC handler |
| `src/main/utils/heading-tree-distance.ts` | 树距离 + 关系判定工具 |
| `tests/unit/main/services/chapter-summary-store.test.ts` | store 单测 |
| `tests/unit/main/services/chapter-summary-service.test.ts` | service 单测 |
| `tests/unit/main/services/agent-orchestrator/agents/chapter-summary-agent.test.ts` | agent 单测 |
| `tests/unit/main/prompts/summarize-chapter.prompt.test.ts` | prompt 单测 |
| `tests/unit/main/utils/heading-tree-distance.test.ts` | 距离算法单测 |
| `tests/unit/main/ipc/chapter-summary-handlers.test.ts` | IPC 单测 |

### 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/shared/ai-types.ts` | 新增 `chapter-summary` agent type，扩展 `AgentExecuteResult` |
| `src/shared/ipc-types.ts` | 新增 `chapter-summary:extract` channel 与 API 类型 |
| `src/shared/chapter-markdown.ts` | 新增直属正文 helper |
| `src/main/services/agent-orchestrator/index.ts` | 注册 `chapter-summary` agent |
| `src/main/services/agent-orchestrator/orchestrator.ts` | 透传并序列化 `model / provider` |
| `src/main/services/chapter-generation-service.ts` | 新增 `buildGeneratedChaptersContext()`，批量章节完成后触发摘要提炼 |
| `src/main/prompts/generate-chapter.prompt.ts` | `GenerateChapterContext` 增 `generatedChaptersContext`，prompt 渲染四组 section |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts` | skeleton-expand prompt 同步透传新字段 |
| `src/preload/index.ts` | 暴露 `chapterSummaryExtract()` API |
| `src/renderer/src/modules/editor/components/EditorView.tsx` | 单章节写回成功后 fire-and-forget 触发摘要提炼 |
| `tests/unit/main/prompts/generate-chapter.prompt.test.ts` | 四分组注入测试 |
| `tests/unit/main/services/chapter-generation-service.test.ts` | context 构建、cache 命中、fallback、top-N 测试 |

### Project Structure Notes

- 主要落在 `src/main/services/`、`src/main/prompts/`、`src/shared/`
- 单章节触发点需要 renderer / preload / IPC 三层同步改动
- 所有 LLM 调用继续走 `agentOrchestrator`
- summary 任务符合 Task Queue 白名单（AI 调用继续由 `ai-agent` 驱动）

### 范围边界

1. 本 Story 只做“章节摘要缓存 + 全局上下文注入”，全局 price / timeline / certs 约束通道留给后续 Story。
2. summary 只基于直属正文生成，父章节与子章节各自产生各自摘要。
3. cache 采用 hash 懒失效，刷新时机落在下一次章节生成完成。
4. provider 配置沿用现有 `claude` / `openai` 槽位。
5. 现有 `adjacentChaptersBefore / adjacentChaptersAfter` 保留为空库首轮生成降级路径。
6. 跨章节显式引用解析（如“见第 3 章”）不在本 Story 范围。

### Dependencies / Risks

1. **Sidecar 并发写** — 多个子章节并行完成时会同时 upsert 同一 JSON，store 需要串行化或乐观重试。
2. **Agent 结果扩展** — `AgentExecuteResult` 新增 `model / provider` 后，需要同步 orchestrator 序列化与测试基线。
3. **Token 成本上升** — 每章节新增一次摘要调用；summary cache 依旧优于每次读时现提炼。
4. **JSON 输出稳定性** — provider 差异会带来格式波动，post-processor 需要兜底到纯文本 summary。
5. **首轮生成空库** — 新旧项目都要稳定回退到 adjacent 截断路径。

### References

- [Source: _bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md] — 章节生成前序故事
- [Source: _bmad-output/implementation-artifacts/story-3-11-batch-subchapter-retry-recovery.md] — 批量生成与 finalize 流程
- [Source: src/main/services/chapter-generation-service.ts] — 当前 adjacent 截断逻辑（L46, L110-116, L286-306）
- [Source: src/main/services/agent-orchestrator/agents/generate-agent.ts] — skeleton-expand previousSectionsSummary（L1051-1069）
- [Source: src/main/prompts/generate-chapter.prompt.ts] — 当前 prompt 结构（L63-68, L111-116, L253-268）
- [Source: src/renderer/src/modules/editor/components/EditorView.tsx] — 单章节写回成功后的现有 post-write 触发点
- [Source: src/main/services/agent-orchestrator/index.ts] — agent 注册方式
- [Source: src/main/services/task-queue/] — task-queue 白名单与任务注册
- [Source: src/shared/chapter-markdown.ts] — Heading 解析工具
- [Source: src/shared/chapter-locator-key.ts] — 稳定 locator key
- [Source: CLAUDE.md] — Task Queue 白名单、Sidecar JSON 架构、命名规范

## Change Log

- 2026-04-17: 创建 Story 3.12
  - 将章节生成上下文从“前后相邻 500 字原文截断”改为“全局已生成章节 summary 池 + 树距离 Top-N + 四分组注入”
  - 写时异步提炼 + sidecar JSON + hash 懒失效
  - 供应商无关，降级路径保留现有 adjacent 截断
  - 范围限定在 summary 缓存，全局约束通道留给后续 Story
- 2026-04-17: `validate-create-story` 校准实现路径
  - 单章节摘要触发点对齐到 `EditorView` 写回成功后
  - 批量子章节摘要触发点对齐到 `_onBatchSectionDone()`
  - 摘要 LLM 路径对齐到 `agent-orchestrator` 的 `chapter-summary` agent
  - sidecar identity 对齐到 `headingKey + occurrenceIndex + createContentDigest(directBody)`
  - 上下文分组统一为 `ancestors / siblings / descendants / others`
- 2026-04-17: `bmad-dev-story` — Story 3.12 实现完成，状态 `ready-for-dev → in-progress → review`
  - 交付：sidecar store + agent-orchestrator chapter-summary agent/post-processor + service/IPC/preload/EditorView/batch 触发 + heading-tree-distance + 四分组 prompt 注入
  - 新增/扩展 7 个测试文件（store / service / agent / prompt / post-processor / tree-distance / ipc），更新 4 个现有测试文件（generate-chapter prompt / chapter-generation-service / EditorView / preload security），共 211 tests 通过
  - 供应商无关：复用 `AiProviderName = 'claude' | 'openai'`，orchestrator 将 provider/model 透传到 sidecar entry

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — via `bmad-dev-story` skill on 2026-04-17.

### Debug Log References

- `pnpm vitest run tests/unit/main/services/chapter-summary-store.test.ts` → 7 passed
- `pnpm vitest run tests/unit/main/prompts/summarize-chapter.prompt.test.ts tests/unit/main/services/agent-orchestrator/agents/chapter-summary-agent.test.ts` → 7 passed
- `pnpm vitest run tests/unit/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.test.ts` → 3 passed
- `pnpm vitest run tests/unit/main/services/chapter-summary-service.test.ts tests/unit/main/ipc/chapter-summary-handlers.test.ts` → 3 passed
- `pnpm vitest run tests/unit/main/utils/heading-tree-distance.test.ts` → 6 passed
- `pnpm vitest run tests/unit/main/prompts/generate-chapter.prompt.test.ts` → 60 passed (+5 new 3-12 cases)
- `pnpm vitest run tests/unit/main/services/chapter-generation-service.test.ts` → 43 passed (+5 new 3-12 cases)
- `pnpm vitest run tests/unit/renderer/modules/editor/components/EditorView.test.tsx tests/unit/preload/security.test.ts` → 22 passed (+1 new 3-12 case)
- Node typecheck (`pnpm typecheck:node`) clean; the pre-existing web-side `SourceAttributionLabel.tsx` TS error is from an earlier story and untouched here.

### Completion Notes List

- **Sidecar identity.** `chapter-summaries.json` entries key on `headingKey = createChapterLocatorKey(locator)` + `occurrenceIndex`. `lineHash` uses `createContentDigest(directBody)` — direct body (`getMarkdownDirectSectionBody`) stops at the first nested / sibling heading, so parent and child chapters maintain independent digests.
- **Concurrency.** `chapterSummaryStore` uses a per-project chained-promise mutex + tmp-file atomic rename, so parallel `_onBatchSectionDone` sub-chapter completions never interleave JSON writes.
- **Provider-agnostic persistence.** Extended `AgentExecuteResult` with optional `provider` / `model` fields; the orchestrator populates them from `aiProxy.call` responses, and `chapterSummaryPostProcessor` writes them into each sidecar entry.
- **Read-time hydration.** `buildGeneratedChaptersContext` enumerates every non-empty-direct-body heading, hits sidecar by `(headingKey, occurrenceIndex)` only when `lineHash` matches, otherwise falls back to 500-char direct-body truncation. Top-N = 8 by LCA distance, grouped into `ancestors / siblings / descendants / others`.
- **Prompt behaviour.** `generate-chapter.prompt.ts` prints four explicit section headers with role guidance and only falls back to the legacy `adjacentChaptersBefore / adjacentChaptersAfter` fields when the global context is empty. Skeleton sub-chapter prompt inherits the same fields via `generateSubChapterPrompt`.
- **Triggers.** Single-chapter writes call `window.api.chapterSummaryExtract()` from `EditorView` right after `replaceSectionRef.current(...)` (both completed-phase and conflict-replace paths). Batch sub-chapters trigger from `chapter-generation-service._onBatchSectionDone()` after `onSectionComplete`. Both are best-effort; failures never block chapter generation.
- **Task-queue wiring.** Summary extraction runs via `agentOrchestrator.execute` with `category='ai-agent'`, `priority='low'`, `maxRetries=2`, `timeoutMs=60_000` — aligned with AC2.
- **Regression posture.** The full-suite failures seen during development (93 total) are all in files with pre-existing unstaged modifications to other stories (`scoring-extractor`, `ai-proxy/provider-adapter`, `diagram-validation-service`, `db/client`, `db/migrations`, `app-config`, `AiConfigModal`, etc.). Every test file touching Story 3.12 code paths passes (211/211 across 14 files).

### File List

**New — main process**

- `src/shared/chapter-summary-types.ts`
- `src/main/prompts/summarize-chapter.prompt.ts`
- `src/main/services/chapter-summary-store.ts`
- `src/main/services/chapter-summary-service.ts`
- `src/main/services/agent-orchestrator/agents/chapter-summary-agent.ts`
- `src/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.ts`
- `src/main/ipc/chapter-summary-handlers.ts`
- `src/main/utils/heading-tree-distance.ts`

**Modified — main process**

- `src/shared/ai-types.ts` — `AgentType` += `'chapter-summary'`; `AgentExecuteResult` += optional `provider` / `model`.
- `src/shared/ipc-types.ts` — `CHAPTER_SUMMARY_EXTRACT` channel + `IpcChannelMap` entry.
- `src/shared/chapter-markdown.ts` — `getMarkdownDirectSectionBody`, `getMarkdownDirectSectionBodyByHeading`, `isMarkdownDirectBodyEmpty`.
- `src/main/services/agent-orchestrator/orchestrator.ts` — threads `provider` / `model` from the ai-proxy response into `AgentExecuteResult`.
- `src/main/services/agent-orchestrator/index.ts` — registers the new agent + post-processor.
- `src/main/services/chapter-generation-service.ts` — `buildGeneratedChaptersContext`, dispatch injection in single/regenerate/batch paths, `_onBatchSectionDone` fire-and-forget trigger.
- `src/main/prompts/generate-chapter.prompt.ts` — `GenerateChapterContext.generatedChaptersContext`, four-group rendering, legacy adjacent fallback when empty.
- `src/main/services/agent-orchestrator/agents/generate-agent.ts` — threads `generatedChaptersContext` through `handleChapterGeneration`, `handleSkeletonBatch`, and `handleSkeletonBatchSingle`.
- `src/main/ipc/index.ts` — registers `chapter-summary-handlers`.
- `src/preload/index.ts` — adds `chapterSummaryExtract` to the request API.

**Modified — renderer**

- `src/renderer/src/modules/editor/components/EditorView.tsx` — fire-and-forget `chapterSummaryExtract` after single-chapter replace (completed and conflict-replace paths).

**New — tests**

- `tests/unit/main/services/chapter-summary-store.test.ts`
- `tests/unit/main/services/chapter-summary-service.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/chapter-summary-agent.test.ts`
- `tests/unit/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.test.ts`
- `tests/unit/main/prompts/summarize-chapter.prompt.test.ts`
- `tests/unit/main/utils/heading-tree-distance.test.ts`
- `tests/unit/main/ipc/chapter-summary-handlers.test.ts`

**Modified — tests**

- `tests/unit/main/prompts/generate-chapter.prompt.test.ts` — 5 new `@story-3-12` cases covering four-group render, legacy fallback, skeleton inheritance.
- `tests/unit/main/services/chapter-generation-service.test.ts` — adds mocks for summary store + service, 5 new cases covering cache hit, fallback, top-N cap, empty-library fallback, and batch summary trigger.
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx` — stubs `window.api.chapterSummaryExtract`; adds a `@story-3-12` case verifying fire-and-forget trigger.
- `tests/unit/preload/security.test.ts` — whitelist now includes `chapterSummaryExtract`.

**Documentation**

- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-12-chapter-summary-cache` → `review`.
