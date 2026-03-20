# Code Review Findings — Story 1-6 — Cycle 3

## Review Context

- Story: 1-6 SOP Navigation
- Review Cycle: 3 (FINAL, user authorized cycle 4 override)
- Cycle-2 findings status: BOTH FIXED (hardcoded colors + aria-label)

## Must-Fix Items

### [Medium] Backward stage changes are not persisted

- Location: src/renderer/src/modules/project/hooks/useSopNavigation.ts:73
- Issue: The navigation hook only writes to DB when targetIdx > currentIdx (forward movement). When user navigates backward to an earlier SOP stage, the change is not persisted. After page refresh, the DB restores the later stage instead of the actual active stage.
- Breaks: AC5 (stage persistence across sessions)
- Fix: Remove the forward-only guard in useSopNavigation.ts:73. Persist stage changes in both directions (forward and backward). Update the corresponding test in useSopNavigation.test.ts:68 that codifies the forward-only behavior.

## Should-Fix Items

### [Low] Lint issues in test files

- SopProgressBar.test.tsx:1 has unused beforeEach import
- useSopNavigation.test.ts:84 has a Prettier warning
- Fix: Remove unused import, fix formatting

## Optional Items

None.
