# E2E Conventions

This project uses Playwright for Electron end-to-end coverage.

## Structure

- `tests/e2e/flows/`
  - Global smoke tests that should pass for every story batch.
  - Use `@smoke` in the test title.
- `tests/e2e/stories/`
  - Story-scoped tests for critical user journeys.
  - Use `@story-<id>` in the test title, for example `@story-1-5`.
  - Add `@p0` for blocking critical paths and `@p1` for important secondary flows.

## Recommended Commands

```bash
pnpm test:e2e:smoke
pnpm exec playwright test -g @story-1-5
pnpm test:e2e:headed
pnpm test:e2e:report
```

## Artifact Paths

- HTML report: `playwright-report/`
- Raw traces, screenshots, video: `test-results/playwright/`

## Usage in UAT

Run automation first, then use the report artifacts to focus human UAT on:

- business correctness
- visual polish
- copy quality
- recovery and edge-case behavior

## Story QA Summary

Each story should produce `_bmad-output/implementation-artifacts/tests/auto-qa-story-<id>.md` with:

- executed commands
- generated test inventory
- AC coverage matrix (`automated` / `manual-only` / `not-covered`)
- prototype references used for visual comparison
