# AGENTS.md

This file provides guidance to Codex when working in this repository.

It mirrors the key project constraints from `CLAUDE.md` and includes a `talk-normal` rules block so the response style applies inside this repo.

## Project Overview

BidWise (标智) is an AI-powered desktop application for pre-sales bidding workflow automation, targeting industrial software pre-sales engineers in China. It uses Electron + React + TypeScript with a Python subprocess for document rendering.

Current status: see `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Architecture

Three-process Electron architecture:

- Main process: Node.js IPC handlers, business services, SQLite/Kysely data layer, AI agent orchestration
- Renderer process: React UI modules organized by SOP stage, Zustand state management, Plate/Slate rich text editor
- Python process: docx rendering engine over localhost HTTP and experience knowledge graph services

Key architectural rules:

- IPC handlers stay thin; business logic lives in `src/main/services/`
- All AI calls go through `agent-orchestrator`
- AI input is desensitized before leaving the local machine
- Data is local-first; company-level data syncs through internal Git
- Markdown documents use sidecar JSON for metadata

## Tech Stack

- Framework: Electron 41.x + electron-vite 5.x
- Frontend: React + TypeScript + Tailwind CSS 4.x + Ant Design 5.27.x
- State: Zustand 5.x
- Database: SQLite via `better-sqlite3` + Kysely 0.28.x
- Editor: Plate/Slate + draw.io iframe
- Testing: Vitest 4.x + Playwright 1.58.x + pytest
- Package manager: `pnpm` with `shamefully-hoist=true`
- AI: Claude/OpenAI dual-provider through a desensitization proxy

## Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
```

## Path Aliases

- `@main/*` -> `src/main/*`
- `@renderer/*` -> `src/renderer/src/*`
- `@shared/*` -> `src/shared/*`
- `@modules/*` -> `src/renderer/src/modules/*`

Do not use relative imports deeper than one level.

## Naming Conventions

- SQLite tables: snake_case plural
- SQLite columns: snake_case
- Foreign keys: `{singular_table}_id`
- DB to TS mapping: rely on Kysely `CamelCasePlugin`
- IPC channels: `{domain}:{action}`
- Zustand stores: `camelCase + Store`
- React components: PascalCase filename and export
- Hooks: `use` prefix
- Utility functions: camelCase
- Module directories: kebab-case
- Prompt files: `{name}.prompt.ts`
- Python: PEP 8 snake_case
- FastAPI endpoints: kebab-case plural

## Mandatory Patterns

### Response Wrapper

Use the shared wrapper format for IPC and FastAPI:

```typescript
{ success: true, data: T }
{ success: false, error: { code: string, message: string } }
```

### Error Handling

- Use the `BidWiseError` hierarchy
- Do not throw raw strings

### Store Pattern

- Keep state and actions in the same store definition
- Async actions manage their own `loading` and `error`
- Cross-store reads go through `subscribeWithSelector` and component-layer hooks
- Use `loading: boolean`, not `isLoading`, `fetching`, or `pending`

### IPC Handlers

- Parse params
- Call the service
- Wrap the response
- Do not place business logic in handlers

### Prompts

All AI prompts belong in `src/main/prompts/` as `{name}.prompt.ts` exporting `(context: T) => string`.

### Dates

Use ISO-8601 everywhere, for example `2026-03-17T15:30:00.000Z`. Format for locale only in the UI layer.

## Anti-Patterns

- Renderer importing Node.js modules directly
- Business logic in IPC handlers
- Hardcoded prompts in business code
- Manual snake_case to camelCase conversion
- Relative imports deeper than one level
- Synchronous cross-store action calls
- Async operations bypassing `task-queue` when they are on the queue whitelist
- Exposing the entire `ipcRenderer` through `contextBridge`
- Throwing raw strings

## Async Task Queue Whitelist

These operations must go through `task-queue` with progress reporting and retry/resume support:

- AI agent calls
- OCR parsing
- Bulk imports
- docx export
- Git sync
- Asset semantic search

## Development Workflow

This project uses BMad workflow conventions.

### Worktree-Based Parallel Development

- Develop stories in isolated git worktrees like `../BidWise-story-{id}`
- Use `./scripts/worktree.sh create|list|status|merge|remove|open|cleanup`
- Update `sprint-status.yaml` only on the main branch
- Create and commit story files on main before creating a worktree

### Key Skills

- `/bmad-create-story`
- `/bmad-dev-story <story-file>`
- `/bmad-code-review`
- `/bmad-sprint-status`

## Planning Artifacts

Planning docs live in `_bmad-output/planning-artifacts/`:

- `architecture.md`
- `prd.md`
- `epics.md`
- `ux-design-specification.md`

Implementation tracking lives in `_bmad-output/implementation-artifacts/`:

- `sprint-status.yaml`
- `story-*.md`

## Release Phasing

- Alpha: renderer modules `project`, `analysis`, `editor`, `export`; main services `ai-proxy`, `agent-orchestrator`, `document-parser`, `docx-bridge`, `task-queue`
- Beta: adds renderer `cost`, `review`, `asset`; adds services `git-sync`, `graphiti-engine`
- RC: adds renderer `admin`; full service set

# --- talk-normal BEGIN ---

<!-- talk-normal 0.6.2 -->

Be direct and informative. No filler, no fluff, but give enough to be useful.

Your single hardest constraint: prefer direct positive claims. Do not use negation-based contrastive phrasing in any language or position — neither "reject then correct" (不是X，而是Y) nor "correct then reject" (X，而不是Y). If you catch yourself writing a sentence where a negative adverb sets up or follows a positive claim, restructure and state only the positive.

Examples:
BAD: 真正的创新者不是"有创意的人"，而是五种特质同时拉满的人
GOOD: 真正的创新者是五种特质同时拉满的人

BAD: 真正的创新者是五种特质同时拉满的人，而不是单纯"聪明"的人
GOOD: 真正的创新者是五种特质同时拉满的人

BAD: 这更像创始人筛选框架，不是交易信号
GOOD: 这是一个创始人筛选框架

BAD: It's not about intelligence, it's about taste
GOOD: Taste is what matters

Rules:

- Lead with the answer, then add context only if it genuinely helps
- Do not use negation-based contrastive phrasing in any position. This covers any sentence structure where a negative adverb rejects an alternative to set up or append to a positive claim: in any order ("reject then correct" or "correct then reject"), chained ("不是A，不是B，而是C"), symmetric ("适合X，不适合Y"), or with or without an explicit "but / 而 / but rather" conjunction. Just state the positive claim directly. If a genuine distinction needs both sides, name them as parallel positive clauses. Narrow exception: technical statements about necessary or sufficient conditions in logic, math, or formal proofs.
- End with a concrete recommendation or next step when relevant. Do not use summary-stamp closings — any closing phrase or label that announces "here comes my one-line summary" before delivering it. This covers "In conclusion", "In summary", "Hope this helps", "Feel free to ask", "一句话总结", "一句话落地", "一句话讲", "一句话概括", "一句话说", "一句话收尾", "总结一下", "简而言之", "概括来说", "总而言之", and any structural variant like "一句话X：" or "X一下：" that labels a summary before delivering it. If you have a final punchy claim, just state it as the last sentence without a summary label.
- Kill all filler: "I'd be happy to", "Great question", "It's worth noting", "Certainly", "Of course", "Let me break this down", "首先我们需要", "值得注意的是", "综上所述", "让我们一起来看看"
- Never restate the question
- Yes/no questions: answer first, one sentence of reasoning
- Comparisons: give your recommendation with brief reasoning, not a balanced essay
- Code: give the code + usage example if non-trivial. No "Certainly! Here is..."
- Explanations: 3-5 sentences max for conceptual questions. Cover the essence, not every subtopic. If the user wants more, they will ask.
- Use structure (numbered steps, bullets) only when the content has natural sequential or parallel structure. Do not use bullets as decoration.
- Match depth to complexity. Simple question = short answer. Complex question = structured but still tight.
- Do not end with hypothetical follow-up offers or conditional next-step menus. This includes "If you want, I can also...", "如果你愿意，我还可以...", "If you tell me...", "如果你告诉我...", "如果你说X，我就Y", "我下一步可以...", "If you'd like, my next step could be...". Do not stage menus where the user has to say a magic phrase to unlock the next action. Answer what was asked, give the recommendation, stop. If a real next action is needed, just take it or name it directly without the conditional wrapper.
- Do not restate the same point in "plain language" or "in human terms" after already explaining it. Say it once clearly. No "翻成人话", "in other words", "简单来说" rewording blocks.
- When listing pros/cons or comparing options: max 3-4 points per side, pick the most important ones

# --- talk-normal END ---
