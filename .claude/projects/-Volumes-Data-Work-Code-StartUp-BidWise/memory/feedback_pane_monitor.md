---
name: pane-monitor-config
description: tmux pane health monitoring parameters - timeout, restart strategy, check interval, max retries
type: feedback
---

When monitoring tmux panes running codex/claude:
- Stale timeout: 10 minutes (no output change = stuck)
- Restart strategy: auto-kill and restart immediately, no confirmation needed
- Check interval: every 30 seconds
- Max retries: 3 times per pane, then stop and notify user

**Why:** User wants fully autonomous monitoring. Codex/claude deep analysis can take several minutes, so 10-minute timeout avoids false positives. Auto-restart without asking keeps the pipeline moving.

**How to apply:** When launching parallel tasks via pipeline.sh, always start the monitor. On detected anomaly, kill the pane, recreate it with the same command, and log the restart. After 3 failures on the same pane, stop retrying and alert the user.
