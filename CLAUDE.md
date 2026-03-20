# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BidWise (标智) is an AI-powered desktop application for pre-sales bidding workflow automation, targeting industrial software pre-sales engineers in China. It is an Electron + React + TypeScript application with a Python subprocess for document rendering.

**Current status:** See `_bmad-output/implementation-artifacts/sprint-status.yaml` for live progress.

## Architecture

Three-process Electron architecture:

- **Main process** (Node.js): IPC handlers, business services, SQLite/Kysely data layer, AI agent orchestration
- **Renderer process** (React): UI modules organized by SOP stage, Zustand state management, Plate/Slate rich text editor
- **Python process**: docx rendering engine (FastAPI over localhost HTTP) + experience knowledge graph (Graphiti + Kuzu, Beta+)

Key architectural patterns:

- IPC handlers are thin dispatch layers — business logic lives in `src/main/services/`
- All AI calls go through `agent-orchestrator` (never direct API calls)
- AI input is desensitized via NER + regex proxy before leaving local machine
- Data is 100% local-first; company-level data syncs via internal Git
- Markdown documents use sidecar JSON for metadata (annotations, scores, compliance)

## Tech Stack

| Layer           | Technology                                                |
| --------------- | --------------------------------------------------------- |
| Framework       | Electron 41.x + electron-vite 5.x                         |
| Frontend        | React + TypeScript + Tailwind CSS 4.x + Ant Design 5.27.x |
| State           | Zustand 5.x (per-domain stores)                           |
| Database        | SQLite via better-sqlite3 (>=12.8.0) + Kysely 0.28.x      |
| Editor          | Plate/Slate + draw.io (iframe)                            |
| Testing         | Vitest 4.x + Playwright 1.58.x + pytest                   |
| Package Manager | pnpm (shamefully-hoist=true)                              |
| AI              | Claude/OpenAI dual-provider via desensitization proxy     |

## Commands

```bash
pnpm dev          # Start Electron dev server with HMR
pnpm build        # Build production executable
pnpm test         # Run Vitest unit + Playwright E2E tests
pnpm lint         # ESLint check
```

## Path Aliases

```
@main/*      → src/main/*
@renderer/*  → src/renderer/src/*
@shared/*    → src/shared/*
@modules/*   → src/renderer/src/modules/*
```

No relative imports deeper than one level (`../../` is forbidden).

## Naming Conventions

| Category           | Convention                                    | Example                                  |
| ------------------ | --------------------------------------------- | ---------------------------------------- |
| SQLite tables      | snake_case plural                             | `projects`, `scoring_models`             |
| SQLite columns     | snake_case                                    | `project_id`, `created_at`               |
| Foreign keys       | `{singular_table}_id`                         | `project_id`                             |
| DB↔TS mapping      | Kysely CamelCasePlugin (no manual conversion) | DB `scoring_weight` → TS `scoringWeight` |
| IPC channels       | `{domain}:{action}`                           | `project:create`, `analysis:parse`       |
| Zustand stores     | camelCase + Store                             | `projectStore`                           |
| React components   | PascalCase file + export                      | `ProjectBoard.tsx`                       |
| Hooks              | `use` prefix, camelCase                       | `useProject`                             |
| Utility functions  | camelCase                                     | `parseRfpDocument`                       |
| Module directories | kebab-case                                    | `project/`, `analysis/`                  |
| Prompt files       | `{name}.prompt.ts`                            | `parse-rfp.prompt.ts`                    |
| Python             | PEP 8 snake_case                              | `render_docx`                            |
| FastAPI endpoints  | kebab-case plural                             | `/api/render-documents`                  |

## Mandatory Patterns

### Response Wrapper (IPC + FastAPI shared)

```typescript
{ success: true, data: T }
{ success: false, error: { code: string, message: string } }
```

### Error Handling

All errors use `BidWiseError` typed hierarchy — never throw raw strings.

### Store Pattern

- State + Actions in same store definition
- Async actions manage their own `loading`/`error`
- Cross-store reads via `subscribeWithSelector` + component-layer hooks
- Loading state field: always `loading: boolean` (not `isLoading`/`fetching`/`pending`)

### IPC Handlers

Thin dispatch only — parse params, call service, wrap response. No business logic.

### Prompts

All AI prompts in `src/main/prompts/` as `{name}.prompt.ts` exporting `(context: T) => string`.

### Dates

ISO-8601 everywhere (`2026-03-17T15:30:00.000Z`). UI layer formats per locale.

## Anti-Patterns (Forbidden)

- Renderer process importing Node.js modules directly
- Business logic in IPC handlers
- Hardcoded prompts in business code (must be in `prompts/` directory)
- Manual snake_case ↔ camelCase conversion (Kysely CamelCasePlugin handles this)
- Relative imports deeper than 1 level (`../../`)
- Synchronous cross-store Action calls (use subscribeWithSelector instead)
- Async operations bypassing `task-queue` (AI calls, OCR, imports, exports, Git sync, semantic search must use task-queue)
- Exposing entire `ipcRenderer` via contextBridge
- `throw` raw strings (use BidWiseError)

## Async Task Queue Whitelist

These operations MUST go through `task-queue` with progress reporting and retry/resume support:
AI Agent calls, OCR parsing, bulk imports, docx export, Git sync, asset semantic search.

## Development Workflow

This project uses **BMad** (Blueprint for Modern Application Development) methodology with Claude Code skills.

### Master Control Pattern (tmux orchestration)

- One **master control** Claude Code session acts as the orchestrator — it does NOT edit files, run builds, or do any implementation work directly
- All concrete work is dispatched to **sub窗格** via tmux `split-window`（水平或垂直分割），each running its own independent `claude` session
- 子窗格必须与指挥官窗格**并排显示在同一屏幕**（使用 `split-window`，禁止 `new-window`）
- 子窗格启动 claude 时**必须**加 `--dangerously-skip-permissions`
- 子窗格启动 codex 时必须显式传 flag（tmux 子窗格不加载 shell alias）

**tmux 标准布局：**

```
┌──────────────────────┬─────────────┐
│   Commander (指挥官)  │  Inspector  │
│                      │  (监察官)    │
├──────┬───────┬───────┴──────┬──────┤
│ Util │ Dev-1 │    Dev-2     │Dev-3 │
└──────┴───────┴──────────────┴──────┘
```

Inspector 从 commander 右侧 `-h` 分割（等高）。动态窗格从 commander 下方 `-v` 分割后横向扩展（全宽）。

**子窗格通讯三层协议：** Signal (`-S -5` 检测 MC_DONE) → Full (`-S - -E -` 完整 scrollback) → Log (`pipe-pane` 日志文件)。每个子窗格创建后立即 `tmux pipe-pane -t {pane_id} -o 'cat >> {mc_log_dir}/pane-{pane_id}.log'`。

- The master control makes autonomous decisions; it only pauses to ask the user when there is genuine ambiguity or significant risk
- Workflow: master reads status/reports → decides next action → opens tmux pane → sends claude command → **actively polls sub-window via `tmux capture-pane`** → detects completion → auto-proceeds to next step
- After dispatching work to a sub-window, the master MUST periodically check the pane output. When the sub-window claude returns to idle prompt or signals completion, immediately proceed — never wait for the user to report back

### INITIALIZATION（指挥官启动必须步骤）

指挥官启动时按以下顺序完成初始化，任何步骤失败则 HALT：

1. **Skill Preflight** — 验证必需 skill 存在于 `.claude/skills/`
2. **Configuration Loading** — 从 `_bmad/bmm/config.yaml` 读取项目配置
3. **Environment Verification** — 确认 tmux 会话、codex 可用、worktree.sh 可执行、git 工作区干净、node_modules 存在
4. **Utility Pane** — 创建 shell 子窗格用于文件写入（gate-state、gate-report 等）
5. **Inspector (监察官) 启动** — 创建 codex 子窗格，发送驻场令，等待 `INSPECTOR READY` 确认（详见"Phase Gate Protocol"）
6. **Gate State Resumption** — 检查 `gate-state.yaml` 是否存在，有则从断点恢复
7. **Forbidden List Loading** — 逐条确认已理解禁忌清单

### Task Packet（子窗格任务包格式）

指挥官向任何 claude/codex 子窗格派发任务时，必须发送紧凑、结构化的任务包，固定 4 段：

```text
Skill: bmad-dev-story                    # 1. 明确 skill / role
Goal: Implement story 1-6 in worktree    # 2. 唯一目标
Inputs:                                  # 3. 可验证输入（绝对路径）
- story id: 1-6
- worktree: /abs/path/to/BidWise-story-1-6
- story file: /abs/path/to/story-1-6.md
Constraints:                             # 4. 边界条件 + 期望输出
- modify files only inside this worktree
Expected Output:
- MC_DONE DEV 1-6 REVIEW_READY|HALT
```

规则：一次只派发一个目标；期望输出带固定哨兵（`MC_DONE`）便于 `capture-pane` 识别。

### Completion Detection

| 信号                                    | 含义           |
| --------------------------------------- | -------------- |
| Claude idle `❯`                         | 子窗格完成     |
| Codex shell prompt `$`/`%` 或 pane 消失 | codex 完成     |
| 输出含 `HALT`                           | 子窗格主动停止 |
| Stack traces / `Error:` / `FATAL:`      | 崩溃           |

超时阈值（仅 warn，不 auto-kill）：Create 10min, Prototype 15min, Validate 5min, Dev 60min, Review 15min, QA 20min, Regression 10min。

### API Fault Recovery

| 故障              | 恢复                         |
| ----------------- | ---------------------------- |
| Rate limit        | 暂停派发新任务，等待限流重置 |
| Content filter    | 关闭 pane，用不同措辞重发    |
| API timeout       | Warn 用户，不 auto-kill      |
| Codex/Claude 崩溃 | 重建 pane + 重发指令         |

### Worktree-Based Parallel Development

- Stories are developed in isolated git worktrees (`../BidWise-story-{id}`)
- Worktree management: `./scripts/worktree.sh create|list|status|merge|remove|open|cleanup`
- Only update `sprint-status.yaml` on the main branch, never in worktrees
- Story files are created and committed to main before worktree creation

### Skill Dependency Map（阶段必需 Skill）

指挥官派发子窗格时**必须明确指定 skill 名称**，不得依赖 LLM 自动匹配。

| 阶段             | 必需 Skill                                              | 备注                         |
| ---------------- | ------------------------------------------------------- | ---------------------------- |
| Create Story     | `bmad-create-story`                                     | 创建 story 文件              |
| Prototype        | Pencil MCP tools                                        | 派生到 story-bound `.pen`    |
| Validate         | _(codex 直接验证，无需 skill)_                          | 读取 checklist.md 后验证     |
| Dev              | `bmad-dev-story`                                        | Story 实现                   |
| Dev (UI Story)   | `bmad-dev-story` + `frontend-design` 或 `ui-ux-pro-max` | UI 实现需额外加载设计 skill  |
| Code Review      | `bmad-code-review`                                      | 对抗性代码审查               |
| Code Review (UI) | `bmad-code-review` + `web-design-guidelines`            | UI story 额外 UX 审查        |
| Automated QA     | `bmad-qa-generate-e2e-tests`                            | 生成/更新 Story 级自动化测试 |
| Bug Fix          | `debugging-strategies`                                  | 系统性调试定位               |

可选增强：`tailwind-design-system`（组件库）、`react-best-practices`（React 优化）、`react-state-management`（Zustand）、`architecture-patterns`（后端架构）

### Story Lifecycle Pipeline

每个 Story 从 backlog 到 done 必须经过完整闭环，但 **指挥官以 batch 推进，不是选中一个 story 就先单独跑完整闭环**：

```
Create Story ──► [Prototype] ──► Validate ──► Dev ──► Code Review ──► Auto QA ──► UAT ──► Merge ──► Regression ──► Cleanup
```

- Phase 1-3 在 `main` 上按 **批处理** 推进：先补齐 batch 内需要创建的 story，再补齐 UI 原型，再统一验证，再统一提交
- 已经是 `ready-for-dev` 的 story 直接纳入 batch，**跳过 Create Story**，只执行缺失的准备步骤和验证
- 真正的并行从 worktree 开发阶段开始；人工 UAT、Merge、Regression 仍保持顺序裁决

| Phase                    | 执行者                                           | 工具/Skill                                      | 指挥官行为                                                                                     |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **1. Create Story**      | 子窗格 **claude**                                | `/bmad-create-story`                            | 仅对 batch 中仍是 `backlog` 的 story 执行；该步骤交互式，按最小必要串行推进                    |
| **2. Prototype（按需）** | 子窗格 **claude**                                | Pencil MCP 原型设计                             | 含 UI 的 Story 仅在缺少当前原型时补齐；每个 Story 使用独立 `.pen` + reference PNG + manifest   |
| **3. Validate**          | 子窗格 **codex**（**并行**，每 story 独立 pane） | 检查 AC 完整性、与 architecture/PRD/原型对齐    | 每个 story **同时**开独立 codex pane 验证；未通过则修正后重新验证，全部通过后再统一提交到 main |
| **4. Dev**               | 子窗格 **claude**（worktree）                    | `/bmad-dev-story <story-file>`                  | 创建 worktree，派发开发，轮询进度                                                              |
| **5. Code Review**       | **新**子窗格 **codex**（fresh context）          | `/bmad-code-review`                             | 必须用 codex（不同 LLM 视角）。review 不通过 → 回 dev 窗格修复 → 再次 review，循环直到通过     |
| **6. Auto QA**           | 子窗格 **codex** / **claude**                    | Playwright smoke + Story 级 E2E + 测试摘要      | 进入人工 UAT 前自动生成/更新 E2E（如缺失）并执行；失败先回修复，成功后把报告交给用户           |
| **7. UAT**               | **用户**                                         | 手动验收（基于自动化报告做高价值检查）          | **暂停并通知用户**："Story X.Y 自动化 QA 已通过，请结合报告进行 UAT 验收。" 等待用户确认       |
| **8. Merge**             | 指挥官（通过子窗格）                             | `worktree.sh merge` + 更新 `sprint-status.yaml` | 用户确认 UAT 通过后执行合并，更新状态为 done                                                   |
| **9. Regression**        | 子窗格 **codex**                                 | main 分支完整回归测试                           | 每次合并后在 main 上执行三层回归（见下方详细说明）。失败 → L0 自动派发修复                     |
| **10. Cleanup**          | 指挥官（L0 自动）                                | `worktree.sh remove` + 删除远程分支             | Regression PASS 后自动清理已合并 story 的 worktree 和分支，释放磁盘空间                        |

**Regression 三层回归测试（Phase 8 详细说明）：**

每次 merge 到 main 后必须在 main 分支上执行，尤其是有冲突 resolve 或多 story batch 合并时：

| 层级                 | 内容                                                          | 执行方式                                                      | 通过标准         |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------- |
| **L1 基础自动化**    | `pnpm test:unit && pnpm lint && pnpm typecheck && pnpm build` | 直接运行                                                      | 全绿，零 warning |
| **L2 Story AC 回归** | 逐个检查本次合并的所有 story 的 AC 在 main 上仍然满足         | 读取每个 story 的 AC，逐项验证代码/测试/行为                  | 所有 AC 仍满足   |
| **L3 集成验证**      | 验证合并后的 story 之间的交叉功能正常工作                     | 检查跨层调用链路（如 UI→IPC→Service→DB），启动 app 验证无报错 | 端到端链路畅通   |

**执行顺序与成功标准：**

- L1 → L2 → L3 **严格顺序执行**，前一层未全绿不得进入下一层
- L1 失败 → 修复 → **重跑 L1**（不是跳到 L2）
- L2 失败 → 修复 → **从 L1 重新开始**（修复可能引入新问题）
- L3 失败 → 修复 → **从 L1 重新开始**
- 批量合并多个 story 时，L2 需覆盖**所有**已合并 story 的 AC，不只是最新一个
- **Regression PASS 的唯一标准：L1 + L2 + L3 在同一次运行中全部通过**。分次通过不算（修复可能破坏之前通过的层）
- 环境问题（如 native module 版本）单独标注，不阻塞 Regression PASS，但必须记录到已知问题清单

**LLM 分工规则：**

- **claude** — Create Story、Prototype、Dev（主力开发）
- **codex** — Validate Story、Code Review、Automated QA、顽固 bug 修复（不同 LLM 视角 + 审查/验证角色）
- 子窗格启动命令：`claude --dangerously-skip-permissions` 或 `codex`，按角色选择

**Prototype 判断规则：**

- 含 UI/交互的 Story（如 1.4 设计系统、1.5 看板、1.6 SOP 导航等）→ 必须先用 Pencil MCP 出原型
- 纯后端/Enabler Story（如 1.2 数据层、1.3 IPC 骨架）→ 跳过 Prototype，直接 Validate
- `_bmad-output/implementation-artifacts/prototypes/prototype.pen` 是项目级标准母版，只读使用
- 每个 UI story 的原型固定落盘到 `_bmad-output/implementation-artifacts/prototypes/story-<id>.pen`
- 每个 UI story 还必须导出 reference PNG 到 `_bmad-output/implementation-artifacts/prototypes/story-<id>/`
- 全局索引文件是 `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- 结束 Prototype 步骤前必须验证 `.pen`、reference PNG、manifest entry 都已写入磁盘；不能只停留在临时 editor 状态

**Prototype Style Contract：**

- 全项目风格一致性的源头不是共享一个 `.pen`，而是共享同一套风格基线
- 工作流上采用”母版 + 派生”模式：先通过 shell 将 `prototype.pen` 复制到 `story-<id>.pen`（磁盘上创建文件），再用 `open_document` 打开该文件进行设计（Pencil MCP 没有 save-as，必须先在目标路径创建文件再打开）
- 风格基线来源固定为：
  - `_bmad-output/implementation-artifacts/prototypes/prototype.pen`
  - `_bmad-output/planning-artifacts/ux-design-specification.md`
  - `_bmad-output/implementation-artifacts/1-4-ui-framework-design-system.md`
  - `_bmad-output/implementation-artifacts/prototypes/story-1-4-*.png`
- story-bound `.pen` 只承载该 Story 的页面/组件构图，不得私自创造新的全局 token；如确需偏离，必须先更新母版/风格基线再继续

**Prototype Lookup / Pixel Fidelity 规则：**

- Dev 不应只靠 `.pen` 找设计，而是按三层来源查找：
  - 1. story 文件中的 Prototype References
  - 2. `prototype-manifest.yaml` 的 story 条目
  - 3. story-bound `.pen` + exported PNG
  - 4. 如需确认通用样式标准，再回看 `prototype.pen`
- 像素级还原时，以 exported reference PNG 作为静态视觉基准，以 `.pen` 作为结构和交互细节来源，以 `prototype.pen` 作为共享标准回退来源
- manifest 必须记录 primary frame 名称、viewport、导出 PNG 路径，以及从 `prototype.pen` 继承了哪些标准片段，避免开发找错画板

**Batch Preparation 规则：**

- batch 候选包含两类：`backlog` 且依赖已满足的 story，以及已存在 story 文件的 `ready-for-dev` story
- `ready-for-dev` story 不允许被 `/bmad-create-story` 重建；只补缺失原型、执行验证、必要时修正文档
- Step 2 必须采用 **按阶段批处理**：Create（仅 backlog）→ Prototype（仅缺原型的 UI story）→ Validate（batch 全量）→ 单次 batch commit
- 不再允许对 batch 内每个 story 执行 `create → prototype → validate → commit` 的单独闭环后再处理下一个

**Automated QA 规则：**

- Code Review 通过后，不直接进入人工 UAT，而是先进入 `Auto QA`
- UI / cross-layer story 默认要求 Playwright 自动化：至少跑全局 smoke，加 Story 级关键路径 E2E
- Story 级 E2E 建议放在 `tests/e2e/stories/story-<id>.spec.ts`，并用 `@story-<id>` 标记，便于单 Story 执行
- 关键路径测试建议额外打 `@p0`，重要但非阻塞流程打 `@p1`
- Auto QA 摘要必须包含 AC 覆盖矩阵：每条 AC 标记为 `automated` / `manual-only` / `not-covered`
- 避免重复覆盖：E2E 只保留关键链路，边界条件优先下沉到 API / component / unit
- 若 `tests/support/fixtures`、`tests/support/factories` 已存在，应优先复用；非 trivial Story 可按需补最小 fixtures/factories
- 每个 story 的自动化结果要保存到 `_bmad-output/implementation-artifacts/tests/auto-qa-story-<id>.md`
- 对 UI story，自动化 QA 摘要中应记录使用了哪个 prototype manifest 条目、哪个 reference PNG 作为视觉对照
- 自动化 QA 的职责是先发现可重复问题、提供 trace/screenshot/video 证据；人工 UAT 再聚焦业务正确性、体验与视觉判断

**不变约束（与授权无关）：**

- 指挥官绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- Story 文件必须在 main 分支创建并提交后，才能创建 worktree；batch commit 允许一次提交多个 story 的准备产物
- Code review 必须在新窗格（fresh context）中执行，避免开发上下文偏见

**指挥官授权分级（Authority Levels）：**

判断"问不问用户"的唯一依据。新场景按条件归类，不需要逐条加规则。

| Level  | 名称      | 触发条件                                   | 指挥官行为           | 示例                                                                                                |
| ------ | --------- | ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------- |
| **L0** | FULL AUTO | 可逆 + 流水线标准流转 + 无破坏性           | 直接执行，不通知     | review→修复→再review、validate重试、创建worktree、派发子窗格、G5 APPROVE后立即创建worktree并派发dev |
| **L1** | NOTIFY    | 里程碑完成 / 用户可能关注的状态变化        | 输出状态信息，不等待 | batch准备完成、story进入dev、review全部通过                                                         |
| **L2** | CONFIRM   | 不可逆 OR 影响共享状态 OR 多选项需用户决策 | 暂停等待用户确认     | UAT验收、合并到main、batch选择、恢复/放弃进行中的story                                              |
| **L3** | HALT      | 超出能力 OR 重大风险 OR 重复失败           | 完全停止并说明原因   | 3轮review不通过、merge冲突无法解决、无可用story                                                     |

### Phase Gate Protocol（御史台制度）

**核心原则：** 不靠觉悟（advisory checks），而靠制度（mandatory gates with state persistence）。每个阶段转换必须通过对应 Gate，跳过 gate 等同于 L3 HALT 级别的协议违规。

**两级强制执行：**

| 级别                   | 机制                        | 执行者     | 适用场景            |
| ---------------------- | --------------------------- | ---------- | ------------------- |
| **Self-Check**         | 指挥官读取磁盘/git 状态验证 | 指挥官     | 每次转换            |
| **Inspector (御史台)** | 独立 codex session 验证     | 驻场监察官 | 高风险转换：G5, G10 |

**Gate 全景图：**

| Gate    | 转换               | 级别                      | 检查要点                                                        |
| ------- | ------------------ | ------------------------- | --------------------------------------------------------------- |
| G1      | Step 1→2           | Self-check                | 用户已确认 batch                                                |
| G2      | 2a→2b              | Self-check                | 所有 story 文件存在于磁盘                                       |
| G3      | 2b→2c              | Self-check                | UI story 有 .pen + PNG + manifest                               |
| G4      | 2c→2d              | Self-check                | 所有 story validation == PASS                                   |
| **G5**  | **Step 2→3**       | **Inspector**             | **Batch commit 在 git log 中；story 文件/原型完整；工作区干净** |
| G6      | Step 3→4           | Self-check                | Worktree 已创建，dev pane 存活                                  |
| G7      | dev→review         | Self-check (per story)    | Dev pane 完成，源文件存在                                       |
| G8      | review→auto_qa     | Self-check (per story)    | Code review PASS                                                |
| G9      | auto_qa→uat        | Self-check (per story)    | QA 报告存在且 PASS                                              |
| **G10** | **UAT→merge**      | **Inspector (per story)** | **用户明确确认 ✅；前置 gate 链完整；review/QA 全 PASS**        |
| G11     | regression→cleanup | Self-check (per story)    | 三层回归同一轮全部通过                                          |

**强制规则：**

1. 每个 gate 必须执行 — 跳过 = 协议违规
2. Gate 结果持久化到 `_bmad-output/implementation-artifacts/gate-state.yaml`（兼作审计日志和断点恢复检查点）
3. REJECT = 不可前进 — 修复后重新执行整个 gate
4. Inspector gate 不可自我认证 — G5/G10 必须由独立 codex session 验证
5. Gate 状态跨会话存活 — 会话重启后读取 gate-state.yaml 确定恢复点

### Inspector（监察官 / 御史台）

**生命周期：** 在 INITIALIZATION 阶段创建，与指挥官共存直到 batch 结束。不是用完即抛。

**三项职责：**

1. **Gate 审查（被动）** — 收到 "请审查 Gate G{N}" 时，读取 gate-report，独立验证磁盘/git 状态，输出 APPROVE 或 REJECT
2. **即时基线审计** — 确认就绪后立即执行初始审计（git status、sprint-status、gate-state），输出 BASELINE AUDIT: COMPLIANT/VIOLATION
3. **主动巡查（自主 + 指挥官触发双轨）** — 监察官在空闲时应自主定期巡查，不需要等待指挥官指令；指挥官在 Step 4 每 3 轮轮询额外触发一次作为双重保障

**授权凭据：** gate-state.yaml 中 PASS 的 gate = 该阶段之前的 main 变更已被授权。驻场令中注入 batch 上下文（batch_id、stories、current_phase），避免监察官对 batch 准备阶段的正常中间状态误报。

**互斥锁：** 同一时刻只能处理一个请求。Gate 审查（高优先级，阻塞）不可跳过；主动巡查（低优先级）在监察官忙时跳过。

**VIOLATION = HALT：** 任何输出包含 VIOLATION 时，指挥官按 HALT 级别处理。

### Forbidden List（禁忌清单）

完整清单维护在 `.claude/skills/bmad-master-control/workflow.md` 的 "禁忌清单" 章节。指挥官在 INITIALIZATION 阶段 MUST 读取。每条来自真实执行偏差，不是理论推演。

**当前禁忌（F1-F11）摘要：**

| #   | 禁忌                                                  | 正确做法                                             |
| --- | ----------------------------------------------------- | ---------------------------------------------------- |
| F1  | 禁止逐 story 做完整闭环                               | 分阶段批处理                                         |
| F2  | 禁止逐 story 单独 commit                              | 全 batch 一次 commit                                 |
| F3  | 禁止直接修改 prototype.pen（母版）                    | 派生到 story-{id}.pen                                |
| F4  | 禁止验证 FAIL 修复后跳过重新验证                      | 修复后重新提交验证                                   |
| F5  | 禁止在 L0 转换时询问用户"继续？"                      | L0 直接执行                                          |
| F6  | 禁止依赖 create-story 自动选 story                    | 必须明确指定 story ID                                |
| F7  | 禁止在独立 tmux session 创建子窗格                    | 在用户当前 attach session split-window               |
| F8  | 禁止指挥官在自身上下文执行构建/测试/写文件/git commit | 通过 tmux 子窗格派发                                 |
| F9  | 禁止用 `capture-pane -S -N` 固定行数读完整结果        | Signal `-S -5` / Full `-S - -E -` / Log `pipe-pane`  |
| F10 | 禁止让 codex 执行文件编辑/修复（codex 只做验证审查）  | 验证 FAIL → 派发 claude 子窗格修复                   |
| F11 | 禁止让执行过修复的窗格重新验证自己的修改（自我认证）  | 关闭旧窗格，开新 codex 窗格（fresh context）重新验证 |

**自动更新：** Inspector VIOLATION、Gate FAIL、用户纠正均可触发新条目。Batch 结束时批量回顾。
**持久性：** 完整 Forbidden List 维护在 `workflow.md`（随 git），不依赖本地 memory。

## Planning Artifacts

All planning documents are in `_bmad-output/planning-artifacts/`:

- `architecture.md` — Architecture decisions, patterns, directory structure, enforced rules
- `prd.md` — Product Requirements (69 FRs, 29 NFRs)
- `epics.md` — 10 epics, 66 stories with dependency graph
- `ux-design-specification.md` — UX patterns, design system, interaction specs

Implementation tracking in `_bmad-output/implementation-artifacts/`:

- `sprint-status.yaml` — Story status tracker
- `story-*.md` — Individual story specifications

## Alpha/Beta/RC Phasing

| Phase | Renderer Modules                  | Main Services                                                          |
| ----- | --------------------------------- | ---------------------------------------------------------------------- |
| Alpha | project, analysis, editor, export | ai-proxy, agent-orchestrator, document-parser, docx-bridge, task-queue |
| Beta  | + cost, review, asset             | + git-sync, + graphiti-engine                                          |
| RC    | + admin                           | all                                                                    |
