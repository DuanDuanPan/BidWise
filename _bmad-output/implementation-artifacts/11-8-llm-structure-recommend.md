# Story 11.8: LLM 招标驱动结构推荐

Status: ready-for-dev

## Story

As a 售前工程师,
I want 系统基于已解析的招标要求（评分项、必响应项、需求矩阵）智能推荐一份方案结构,
So that 我无需对照招标书逐条搭骨架，每个推荐章节都标注对应招标依据。

## Acceptance Criteria

### AC1: 主动触发

- **Given** 项目已完成招标文件解析（Story 2.5 评分模型 / 2.6 必响应项 / 2.8 追溯矩阵 数据就绪）
- **When** 用户在 Story 11.6 三路径入口选择"AI 推荐"
- **Then** 主动触发（**不**自动后台跑），调用 `agent-orchestrator` 启动 LLM 推荐流程
- [Source: epics.md Story 11.8 AC1]

### AC2: 脱敏强制

- **Given** Prompt 构造
- **When** 输入招标解析结果给 LLM
- **Then** 输入必先经 `desensitization-proxy`（NER + regex 抹甲方公司名 / 项目名 / 人名）
- **And** 符合 CLAUDE.md 强制脱敏要求（"AI 输入必须经 NER + regex 代理脱敏"）
- [Source: epics.md Story 11.8 AC2 + CLAUDE.md#Architecture]

### AC3: 流式输出 + Locked 态

- **Given** LLM 输出
- **When** 流式 SSE 返回结构节点
- **Then** 节点逐个流式渲染到 UI，正在生成的节点切到 Story 11.2 的 Locked 态
- **And** 每个节点为：
  ```typescript
  {
    title: string,
    children: Node[],
    rationale: string,         // LLM 推荐理由
    sourceRequirement: string  // 对应招标依据，如 "响应招标书第 4.2 条评分项"
  }
  ```
- [Source: epics.md Story 11.8 AC3]

### AC4: sourceRequirement Tooltip

- **Given** 推荐结果
- **When** 用户 hover 节点
- **Then** 显示 Tooltip 含 `sourceRequirement` 内容，让用户能验证 LLM 不是瞎编
- [Source: epics.md Story 11.8 AC4]

### AC5: 进入 diff 视图

- **Given** 推荐生成结束
- **When** 进入 Story 11.6 的 diff 合并 UI
- **Then** 复用现有合并视图，所有 AI 节点默认未勾选
- [Source: epics.md Story 11.8 AC5]

### AC6: 缓存

- **Given** 同一招标重复点"AI 推荐"
- **When** 触发
- **Then** 命中缓存返回（参考 Story 3.12 chapter-summary cache 模式），避免无谓 token 花费
- **And** 缓存 key = hash(projectId + tenderDocVersion + scoringModelVersion)
- [Source: epics.md Story 11.8 AC6]

### AC7: 失败显式重试

- **Given** LLM 调用失败 / 超时 / 限流
- **When** 错误发生
- **Then** 显式失败 + 重试按钮 + 引导降级到其他两路径（**不**自动通用模板兜底）
- [Source: epics.md Story 11.8 AC7]

### AC8: 输出约束校验

- **Given** Prompt 输出违反约束（深度 >6、节点数 >50）
- **When** 主进程解析返回 JSON
- **Then** 拒绝接受、记录日志、返回 `BidWiseError(STRUCTURE_VIOLATES_CONSTRAINTS)` 供 UI 重试
- [Source: epics.md Story 11.8 AC8 + Story 11.5 AC3]

## Tasks / Subtasks

- [ ] Task 1: Prompt 文件 (AC: 2, 8)
  - [ ] 1.1 创建 `src/main/prompts/recommend-structure.prompt.ts`：
    ```typescript
    export const recommendStructurePrompt = (ctx: {
      scoringModel: ScoringModel
      mandatoryItems: MandatoryItem[]
      requirements: Requirement[]
    }) => `...`
    ```
  - [ ] 1.2 system 段含约束："深度 ≤6 层、节点数 ≤50、必须输出 JSON、每节点必含 sourceRequirement"
  - [ ] 1.3 user 段注入脱敏后的招标解析结果
  - [ ] 1.4 输出 schema 定义（JSON Schema）

- [ ] Task 2: structure-recommend service (AC: 1, 2, 6, 7, 8)
  - [ ] 2.1 创建 `src/main/services/structure-recommend-service.ts`
  - [ ] 2.2 入口 `recommend(projectId): AsyncIterable<RecommendedNode>`：
    - 加载招标解析数据（scoringModel + mandatoryItems + requirements）
    - 通过 `desensitization-proxy` 脱敏
    - 构造 prompt 调 `agent-orchestrator`（流式 SSE）
    - 流式 yield 节点
    - 收尾时 `validateStructure(tree)` 校验深度 / 节点数
  - [ ] 2.3 缓存层（参考 `chapter-summary-service` 的 SQLite 缓存表）
  - [ ] 2.4 失败错误码：`LLM_TIMEOUT` / `LLM_RATE_LIMITED` / `STRUCTURE_VIOLATES_CONSTRAINTS`

- [ ] Task 3: agent-orchestrator 集成 (AC: 1, 2)
  - [ ] 3.1 注册新 agent task type `recommend-structure`
  - [ ] 3.2 走 task-queue（CLAUDE.md 强制：AI 调用必须走 task-queue）
  - [ ] 3.3 任务进度上报支持流式 SSE 转 IPC event

- [ ] Task 4: IPC + 流式事件 (AC: 3)
  - [ ] 4.1 IPC 通道 `structure:recommend-start`（启动）+ `structure:recommend-stream`（事件 push）
  - [ ] 4.2 主进程 push 事件 `node-generated` / `complete` / `error`
  - [ ] 4.3 渲染端订阅 stream + 累积构造树

- [ ] Task 5: 类型定义 (AC: 3, 4)
  - [ ] 5.1 `src/shared/structure-recommend-types.ts`：
    ```typescript
    export interface RecommendedNode {
      id: string                    // UUID（依赖 11-1）
      title: string
      level: number
      rationale: string
      sourceRequirement: string
      children: RecommendedNode[]
    }
    export type RecommendStreamEvent =
      | { type: 'node-generated'; node: RecommendedNode; parentId: string | null }
      | { type: 'complete'; totalCount: number }
      | { type: 'error'; code: string; message: string }
    ```

- [ ] Task 6: 渲染端 UI (AC: 3, 4, 7)
  - [ ] 6.1 创建 `src/renderer/src/modules/editor/components/AIRecommendStreamView.tsx`
  - [ ] 6.2 流式渲染节点：每收到 `node-generated` 调 Story 11.2 的 `markLocked` → 节点出现 → 100ms 后 `unmarkLocked`
  - [ ] 6.3 hover 节点 → Ant Design `Tooltip` 显示 sourceRequirement
  - [ ] 6.4 完成后调 Story 11.6 的 `DiffMergeView`
  - [ ] 6.5 失败显示 `PathFailureFallback`（Story 11.6 提供）

- [ ] Task 7: 测试 (AC: 全部)
  - [ ] 7.1 `tests/unit/main/services/structure-recommend-service.test.ts`：
    - 输入脱敏后调 LLM
    - 流式输出累积
    - 缓存命中跳过 LLM
    - 校验失败抛 STRUCTURE_VIOLATES_CONSTRAINTS
    - LLM 超时返回 LLM_TIMEOUT
  - [ ] 7.2 `tests/unit/main/prompts/recommend-structure.prompt.test.ts`：
    - Prompt 含约束语句
    - 招标数据正确注入
  - [ ] 7.3 `tests/unit/renderer/modules/editor/components/AIRecommendStreamView.test.tsx`：
    - 节点流式渲染
    - hover Tooltip 显示
    - 失败降级渲染
  - [ ] 7.4 集成：完整流程从触发 → 流式生成 → 进入 diff → 合并应用

## Dev Notes

### 关键决策（来自 Party Mode）

- **主动触发不自动** — 避免无谓 token 花费
- **单版输出** — 不做保守 / 标准 / 激进多版（用户裁决简化）
- **sourceRequirement 是信任基础** — 用户 hover 即可验证 LLM 不是瞎编
- **失败不静默兜底** — 显式失败 + 引导用户主动选其他路径
- **经验图谱反馈暂缓** — Beta+ Graphiti 学习用户接受 / 拒绝模式（暂不实现）
- **强制走 agent-orchestrator + task-queue** — CLAUDE.md 硬规定

### 已有代码资产

| 已有文件 | 操作 |
|---|---|
| `src/main/services/agent-orchestrator/` | 复用，注册新 task type |
| `src/main/services/task-queue/` | 复用 |
| `src/main/services/desensitization-proxy/` | 复用 |
| `src/main/services/chapter-summary-service.ts` | 缓存模式参考（commit 407e577） |
| `src/main/prompts/` | 新增 recommend-structure.prompt.ts |
| Story 2.5 / 2.6 / 2.8 数据 | 输入源 |

### 依赖

- 阻塞前置：Story 11.1（UUID）、11.2（Locked 视觉）、11.5（Prompt 约束 + 校验）、11.6（diff 入口 + 合并视图）
- 数据依赖：Story 2.5（评分模型）、2.6（必响应项）、2.8（追溯矩阵）

### 禁止事项

- 禁止绕过 desensitization-proxy（合规硬规定）
- 禁止绕过 agent-orchestrator + task-queue
- 禁止失败时静默兜底通用模板
- 禁止节点级 prompt 硬编码（必须在 `prompts/` 目录）
- 禁止跳过深度 / 节点数校验

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.8]
- [Source: _bmad-output/planning-artifacts/epics.md#FR71]
- [Source: CLAUDE.md#Mandatory Patterns] — Prompts 在 prompts/ 目录、AI 经 agent-orchestrator
- [Source: CLAUDE.md#Async Task Queue Whitelist] — AI 调用必须走 task-queue
- [Source: src/main/services/chapter-summary-service.ts] — 缓存模式参考
- [Source: _bmad-output/implementation-artifacts/3-12-chapter-summary-cache.md] — Cache 设计先例

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
