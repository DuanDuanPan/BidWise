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

| Layer | Technology |
|-------|-----------|
| Framework | Electron 41.x + electron-vite 5.x |
| Frontend | React + TypeScript + Tailwind CSS 4.x + Ant Design 5.27.x |
| State | Zustand 5.x (per-domain stores) |
| Database | SQLite via better-sqlite3 (>=12.8.0) + Kysely 0.28.x |
| Editor | Plate/Slate + draw.io (iframe) |
| Testing | Vitest 4.x + Playwright 1.58.x + pytest |
| Package Manager | pnpm (shamefully-hoist=true) |
| AI | Claude/OpenAI dual-provider via desensitization proxy |

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

| Category | Convention | Example |
|----------|-----------|---------|
| SQLite tables | snake_case plural | `projects`, `scoring_models` |
| SQLite columns | snake_case | `project_id`, `created_at` |
| Foreign keys | `{singular_table}_id` | `project_id` |
| DB↔TS mapping | Kysely CamelCasePlugin (no manual conversion) | DB `scoring_weight` → TS `scoringWeight` |
| IPC channels | `{domain}:{action}` | `project:create`, `analysis:parse` |
| Zustand stores | camelCase + Store | `projectStore` |
| React components | PascalCase file + export | `ProjectBoard.tsx` |
| Hooks | `use` prefix, camelCase | `useProject` |
| Utility functions | camelCase | `parseRfpDocument` |
| Module directories | kebab-case | `project/`, `analysis/` |
| Prompt files | `{name}.prompt.ts` | `parse-rfp.prompt.ts` |
| Python | PEP 8 snake_case | `render_docx` |
| FastAPI endpoints | kebab-case plural | `/api/render-documents` |

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
- All concrete work is dispatched to **sub-windows** via tmux (split-pane or new-window), each running its own independent `claude` session
- Sub-windows must remain visible alongside the master control window
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

| Phase | Renderer Modules | Main Services |
|-------|-----------------|---------------|
| Alpha | project, analysis, editor, export | ai-proxy, agent-orchestrator, document-parser, docx-bridge, task-queue |
| Beta | + cost, review, asset | + git-sync, + graphiti-engine |
| RC | + admin | all |
