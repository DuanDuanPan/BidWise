---
name: user-dev-workflow
description: User's dual-LLM development workflow - Claude Code for creation/dev, Codex for validation/review, with Pencil for UI/UX
type: user
---

User uses a dual-LLM workflow for story development:
1. Claude Code: create-story (interactive)
2. Pencil MCP: UI/UX design for stories needing UI
3. Codex: validate-create-story
4. Claude Code (new session): dev-story
5. Codex (new session): code-review
6. User: review findings, accept/reject
7. Claude Code: fix accepted items
8. Codex: second round code-review
9. Loop until only low-priority items remain
10. Manual UAT by user
11. If UAT issues: Codex fixes
12. Commit code

User prefers parallel development using git worktrees to work on multiple stories simultaneously.
Parallel workflow documented in docs/parallel-dev-workflow.md with helper script at scripts/worktree.sh.
