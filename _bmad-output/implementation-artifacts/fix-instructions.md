# Story 1.1 Fix Instructions

Read the validation report at `_bmad-output/implementation-artifacts/story-1-1-validation.md` and fix ALL issues in `_bmad-output/implementation-artifacts/story-1-1.md`.

Also read `_bmad-output/planning-artifacts/architecture.md` to verify directory structure and anti-patterns against the source of truth.

## Fix 1: AC Testability
- AC-3: Add measurement method (console.time in main process, threshold assertion)
- AC-5: Specify commit-time enforcement via husky + lint-staged
- AC-6: Specify what smoke tests assert, how pnpm test orchestrates Vitest + Playwright

## Fix 2: Missing Tasks
Add tasks for:
- package.json scripts wiring (pnpm test / lint / format)
- husky + lint-staged for commit-time enforcement (AC-5)
- @testing-library/react + @testing-library/jest-dom for renderer component tests
- Playwright Electron launch harness setup

## Fix 3: Preload Snippet
Replace the generic `invoke(channel, ...args)` with a typed per-channel API. Each IPC channel gets its own method (e.g. `api.projectCreate()`, `api.projectList()`). Update both `index.ts` and `index.d.ts` snippets.

## Fix 4: Pin Ant Design Versions
Change Task 4.2 install command to: `pnpm add antd@5.27.6 @ant-design/icons@^5.6.1 @ant-design/cssinjs@^1.23.0`

## Fix 5: Directory Structure
Add missing directories from architecture.md: `resources/`, `tests/integration/docx-bridge/`, fixture subfolders. Note that `python/` and `company-data/` are NOT part of Story 1.1 scope - add a comment saying they belong to later stories.

## Fix 6: Anti-Patterns
Add these 3 missing architecture-mandated anti-patterns:
- Hardcoded prompts in business code
- Synchronous Action-to-Action calls across stores
- Whitelisted async operations bypassing task-queue

## Final Step
Update the Change Log section at the bottom of the story file with today's date and a summary of fixes applied.
