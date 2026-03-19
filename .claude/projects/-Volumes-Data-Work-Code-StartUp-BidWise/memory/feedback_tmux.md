---
name: tmux-pane-preference
description: User prefers tmux split-window (side-by-side panes) over new-window (tab switching) for parallel tasks
type: feedback
---

Use `tmux split-window -h` (side-by-side panes) instead of `tmux new-window` when launching parallel tasks like codex validation or code review.

**Why:** User wants to see all running sessions simultaneously without switching windows. Separate windows require manual switching which breaks visibility.

**How to apply:** Whenever spawning a parallel process (codex, second claude session, etc.) in tmux, always use `split-window` with `-h` (horizontal/side-by-side) for wide screens. Use `-l 50%` to give equal space.
