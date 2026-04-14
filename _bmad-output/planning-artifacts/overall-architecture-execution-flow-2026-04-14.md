# 总体架构设计执行流程分析（2026-04-14）

## 结论

- 本次“总体架构设计”相关链路，能够明确分成两段：
  - 章节生成链路：`chapter:regenerate/generate -> agent generate -> ai-proxy -> LLM -> 图表子调用 -> coherence`
  - 章节后处理链路：`编辑器替换章节 -> source attribution -> baseline validation`
- LLM 调用日志是持久化的，路径为：
  - `~/Library/Application Support/bidwise/data/logs/ai-trace/2026-04-14.jsonl`
- 程序本身没有独立写盘的通用运行日志文件；可审计的“程序日志”主要来自：
  - SQLite `tasks` 表
  - `proposal.md` / `proposal.meta.json` 的落盘时间
  - 前端/主进程代码中的状态机与 IPC 链路
- 当前项目 `bf72846b-2562-447e-8709-26256dabe8b8` 的 `总体架构设计` 在 `15:15-15:16` 明确执行了：
  - 来源归因任务
  - 基线校验任务（因无 baseline 文件被跳过）
- 同日 `15:14-15:15` 还存在一组“总体架构设计”章节生成 LLM trace：
  - 1 次正文生成
  - 6 次 Mermaid 图生成/修复调用
  - 1 次 text/diagram coherence 校验
  - 这组 trace 的章节内容与当前项目 `proposal.md` 高度一致，但数据库里未检索到同项目对应的 `generate` 任务记录，因此只能视为“高概率相关”而非 100% 已证明同任务。

## 关键证据

### 当前项目

- 项目 ID：`bf72846b-2562-447e-8709-26256dabe8b8`
- 项目名：`9owCap`
- 项目目录：
  - `~/Library/Application Support/bidwise/data/projects/bf72846b-2562-447e-8709-26256dabe8b8`
- 文件时间：
  - `proposal.md`：`2026-04-14 15:15`
  - `proposal.meta.json`：`2026-04-14 15:16`

### 当前项目任务库记录

- `2026-04-14 15:15:40`：`semantic-search` 任务完成
  - 输出：`{"baselineValidations":[],"skipped":true,"reason":"no-baseline-file"}`
- `2026-04-14 15:15:40 -> 15:16:38`：`attribute-sources` 内层 AI 任务完成
- `2026-04-14 15:15:40 -> 15:16:38`：对应外层 `semantic-search` 任务完成，并把来源归因写入 `proposal.meta.json`

### 章节生成相关 LLM trace（高概率为同一章节最近一次生成）

- `2026-04-14 15:14:02`：`generate-agent:text`
- `2026-04-14 15:14:08`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:14:23`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:14:33`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:14:48`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:15:07`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:15:09`：`generate-agent:diagram:mermaid`
- `2026-04-14 15:15:34`：`generate-agent:coherence`
- `2026-04-14 15:16:38`：`attribute-sources-agent`

## 代码级完整执行流程

### 1. 前端触发

1. 用户在编辑器标题上点击“重新生成”。
2. `RegenerateDialog` 收集补充说明。
3. `OutlineHeadingElement` 调用 `chapterGen.startRegeneration(locator, additionalContext)`。

对应代码：

- `src/renderer/src/modules/editor/components/RegenerateDialog.tsx`
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
- `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`

### 2. Renderer 状态初始化

1. `useChapterGeneration.startRegeneration()` 先读取当前章节内容。
2. 生成 `baselineDigest` 和 `baselineSectionContent`，用于冲突检测。
3. 本地状态先标记为 `queued`。
4. 通过 preload 调用 `window.api.chapterRegenerate(...)`。

对应代码：

- `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
- `src/preload/index.ts`

### 3. IPC 进入主进程

1. preload 调用 IPC channel：`chapter:regenerate`
2. `chapter-handlers.ts` 把请求转给 `chapterGenerationService.regenerateChapter(...)`

对应代码：

- `src/main/ipc/chapter-handlers.ts`
- `src/main/ipc/create-handler.ts`

### 4. 主进程构造生成上下文

`chapterGenerationService.regenerateChapter()` / `_dispatchGeneration()` 会做这些事：

1. 读取 `proposal.md`
2. 解析 Markdown headings，定位 `总体架构设计`
3. 切出当前章节正文
4. 读取：
   - requirements
   - scoring model
   - mandatory items
   - writing style
   - strategy seed
   - 相邻章节摘要
   - 文档大纲
5. 判断 `shouldSuggestDiagrams('总体架构设计') === true`
6. 调 `agentOrchestrator.execute({ agentType: 'generate', ... })`

对应代码：

- `src/main/services/chapter-generation-service.ts`
- `src/main/prompts/generate-chapter.prompt.ts`

### 5. 任务入队与执行

1. `AgentOrchestrator.execute()` 创建一条 `tasks` 记录
2. 任务类别：`ai-agent`
3. `agentType`：`generate`
4. `taskQueue.execute()` 将任务状态改成 `running`
5. 通过 progress emitter 持续向 renderer 发送阶段进度

对应代码：

- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/task-queue/queue.ts`
- `src/main/db/repositories/task-repo.ts`

### 6. Generate Agent 正文生成

`generateAgentHandler` 在普通章节模式下进入 `handleChapterGeneration()`：

1. 进度置为 `analyzing`
2. 组装最终 prompt
3. 因为 `总体架构设计` 属于图表重章节，走增强链路而不是简单单次返回
4. 发起第一条 LLM 调用：
   - caller: `generate-agent:text`

对应代码：

- `src/main/services/agent-orchestrator/agents/generate-agent.ts`

### 7. AI Proxy 调用链

每次 LLM 调用统一经过 `aiProxy.call()`：

1. 读取 AI 配置
2. 必要时执行脱敏
3. 调用 provider SDK
4. 在恢复明文前，先把 desensitized input / output 写入 `ai-trace` JSONL
5. 恢复内容并返回

对应代码：

- `src/main/services/ai-proxy/index.ts`
- `src/main/services/ai-proxy/ai-trace-logger.ts`

## 本次观察到的 LLM 子流程

### A. 正文生成

- `15:14:02` 的 `generate-agent:text` 返回正文，并包含 2 个 Mermaid 占位符：
  - `系统总体架构图`
  - `自动生成模块流程图`

### B. 图表生成

系统随后解析占位符，并对每个图表发起 Mermaid 子调用。

本次共观察到 6 次 Mermaid 调用，符合“2 个图表 * 每图最多 3 轮生成/修复”的模式：

- `系统总体架构图`：3 次
- `自动生成模块流程图`：3 次

### C. 一致性校验

- `15:15:34` 发起 `generate-agent:coherence`
- coherence 返回 `pass=false`
- 主要问题是：`图表摘要为空`，并指出缺少完整的架构图、流程图等可视化支撑

这说明：

- 虽然图表子调用发生了
- 但这轮没有形成被系统认定为“成功”的最终图表摘要
- 最终落地章节更接近“纯正文结果”，而不是“正文 + 成功图表”

### D. 来源归因

章节替换成功后，前端会立刻触发：

1. `source:attribute`
2. `source:validate-baseline`

实际结果：

- baseline 校验因无 baseline 文件被跳过
- source attribution 在 `15:16:38` 完成，并写入 `proposal.meta.json`

对应代码：

- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/hooks/useSourceAttribution.ts`
- `src/main/services/source-attribution-service.ts`
- `src/main/services/agent-orchestrator/agents/attribute-sources-agent.ts`

## 当前项目的落地结果

- `proposal.md` 中的 `总体架构设计` 当前是纯文本结构：
  - `设计原则`
  - `架构设计`
  - `技术选型`
  - `自动生成模块设计`
  - `系统集成架构`
  - `性能保障设计`
  - `安全架构设计`
- `proposal.meta.json` 中已存在该章节的 62 条来源归因记录
- baseline validation 为空

## 风险与异常点

### 1. 图表链路实际未闭环

从 trace 看，正文阶段已经产出 2 个图表占位符，系统也实际调用了图表生成；但 coherence 阶段仍然认为图表摘要为空。这通常意味着：

- Mermaid 结果未通过校验
- 或通过了子调用但没有进入“success summary”集合
- 或替换到了失败标记而非最终图

### 2. Mermaid 校验环境曾出现基础设施错误

同日较早一轮 `总体架构设计` trace 中，图表修复 prompt 里出现过：

- `DOMPurify.addHook is not a function`

这说明 Mermaid 校验/运行环境至少在某一轮出现过基础设施问题。对应代码里也专门把这类错误标记为 `failureKind: 'infrastructure'`。

### 3. 当前项目未检索到匹配的 generate 任务行

当前项目 `bf72846b-...` 的任务库里，`15:15` 这轮明确能看到的是：

- source attribution
- baseline validation skip

但没有检索到同项目 `总体架构设计` 的 `agent_type='generate'` 任务行。因此：

- LLM trace 可以证明“有一次总体架构设计生成链路发生过”
- 当前项目文件内容与该 trace 高度一致
- 但数据库层面无法 100% 证明它就是当前项目这一次按钮触发产生的任务

## 建议排查点

1. 在 `generate-agent:text` 完成后，把 `parsed.placeholders.length`、每个 placeholder title、每轮 diagram validation error 持久化到普通程序日志。
2. 在 `generateDiagramWithRepair()` 中，把 `success/failure`、`failureKind`、最终插入 markdown 也落盘。
3. 在 `coherence` 前后记录 `diagramSummaries.length`，这样能直接确认“图表是否真正成功”。
4. 给 `source-attribution` 外层任务补充 `message=skipped/completed` 的持久化字段，便于后续审计。
5. 如果要完整还原用户点击链路，需要把 `chapter:generate/regenerate` 的 IPC 入参也单独记一份结构化审计日志；当前仅靠 `tasks` 和 `ai-trace` 还存在项目归属模糊区间。
