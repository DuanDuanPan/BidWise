# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BidWise (标智) is an AI-powered desktop application for pre-sales bidding workflow automation, targeting industrial software pre-sales engineers in China. It is an Electron + React + TypeScript application with a Python subprocess for document rendering.

**Current status:** Planning complete, implementation starting. Story 1.1 (project initialization) is the first development task.

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
- 子窗格必须与指挥官窗格**并排显示在同一屏幕**（使用 `split-window`，禁止 `new-window` 创建独立标签页）——指挥官需要随时目视子窗格状态
- 子窗格启动 claude 时**必须**加 `--dangerously-skip-permissions` 标志，避免权限确认弹窗阻塞自动化流程。命令格式：`tmux split-window -h "cd /project/path && claude --dangerously-skip-permissions"`
- The master control makes autonomous decisions; it only pauses to ask the user when there is genuine ambiguity or significant risk
- Workflow: master reads status/reports → decides next action → opens tmux pane → sends claude command → **actively polls sub-window via `tmux capture-pane`** → detects completion → auto-proceeds to next step
- After dispatching work to a sub-window, the master MUST periodically check the pane output. When the sub-window claude returns to idle prompt or signals completion, immediately proceed — never wait for the user to report back

### Worktree-Based Parallel Development

- Stories are developed in isolated git worktrees (`../BidWise-story-{id}`)
- Worktree management: `./scripts/worktree.sh create|list|status|merge|remove|open|cleanup`
- Only update `sprint-status.yaml` on the main branch, never in worktrees
- Story files are created and committed to main before worktree creation

### Key BMad Skills

- `/bmad-create-story` — Create story file with full context
- `/bmad-dev-story <story-file>` — Implement a story
- `/bmad-code-review` — Adversarial code review
- `/bmad-sprint-status` — Check sprint status

### Story Lifecycle Pipeline

每个 Story 从 backlog 到 done 必须经过完整闭环，指挥官（master control）在每个节点有明确行为：

```
Create Story ──► [Prototype] ──► Validate ──► Dev ──► Code Review ──► UAT ──► Merge ──► Regression ──► Cleanup
```

| Phase                    | 执行者                                  | 工具/Skill                                      | 指挥官行为                                                                                   |
| ------------------------ | --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **1. Create Story**      | 子窗格 **claude**                       | `/bmad-create-story`                            | 派发子窗格，轮询完成                                                                         |
| **2. Prototype（按需）** | 子窗格 **claude**                       | Pencil MCP 原型设计                             | 含 UI 的 Story 必须先出原型；纯后端/Enabler Story 可跳过。指挥官判断是否需要，派发子窗格执行 |
| **3. Validate**          | 子窗格 **codex**                        | 检查 AC 完整性、与 architecture/PRD/原型对齐    | 派发 codex 子窗格验证，轮询结果，未通过则要求修正后重新验证                                  |
| **4. Dev**               | 子窗格 **claude**（worktree）           | `/bmad-dev-story <story-file>`                  | 创建 worktree，派发开发，轮询进度                                                            |
| **5. Code Review**       | **新**子窗格 **codex**（fresh context） | `/bmad-code-review`                             | 必须用 codex（不同 LLM 视角）。review 不通过 → 回 dev 窗格修复 → 再次 review，循环直到通过   |
| **6. UAT**               | **用户**                                | 手动验收（启动 app、跑测试、检查代码）          | **暂停并通知用户**："Story X.Y 开发完成，code review 已通过，请进行 UAT 验收。" 等待用户确认 |
| **7. Merge**             | 指挥官（通过子窗格）                    | `worktree.sh merge` + 更新 `sprint-status.yaml` | 用户确认 UAT 通过后执行合并，更新状态为 done                                                 |
| **8. Regression**        | 子窗格 **codex**                        | main 分支完整回归测试                           | 每次合并后在 main 上执行三层回归（见下方详细说明）。失败 → L0 自动派发修复                   |
| **9. Cleanup**           | 指挥官（L0 自动）                       | `worktree.sh remove` + 删除远程分支             | Regression PASS 后自动清理已合并 story 的 worktree 和分支，释放磁盘空间                      |

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
- **codex** — Validate Story、Code Review、顽固 bug 修复（不同 LLM 视角 + 审查/验证角色）
- 子窗格启动命令：`claude --dangerously-skip-permissions` 或 `codex`，按角色选择

**Prototype 判断规则：**

- 含 UI/交互的 Story（如 1.4 设计系统、1.5 看板、1.6 SOP 导航等）→ 必须先用 Pencil MCP 出原型
- 纯后端/Enabler Story（如 1.2 数据层、1.3 IPC 骨架）→ 跳过 Prototype，直接 Validate

**不变约束（与授权无关）：**

- 指挥官绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- Story 文件必须在 main 分支创建并提交后，才能创建 worktree
- Code review 必须在新窗格（fresh context）中执行，避免开发上下文偏见

**指挥官授权分级（Authority Levels）：**

判断"问不问用户"的唯一依据。新场景按条件归类，不需要逐条加规则。

| Level  | 名称      | 触发条件                                   | 指挥官行为           | 示例                                                         |
| ------ | --------- | ------------------------------------------ | -------------------- | ------------------------------------------------------------ |
| **L0** | FULL AUTO | 可逆 + 流水线标准流转 + 无破坏性           | 直接执行，不通知     | review→修复→再review、validate重试、创建worktree、派发子窗格 |
| **L1** | NOTIFY    | 里程碑完成 / 用户可能关注的状态变化        | 输出状态信息，不等待 | batch准备完成、story进入dev、review全部通过                  |
| **L2** | CONFIRM   | 不可逆 OR 影响共享状态 OR 多选项需用户决策 | 暂停等待用户确认     | UAT验收、合并到main、batch选择、恢复/放弃进行中的story       |
| **L3** | HALT      | 超出能力 OR 重大风险 OR 重复失败           | 完全停止并说明原因   | 3轮review不通过、merge冲突无法解决、无可用story              |

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
