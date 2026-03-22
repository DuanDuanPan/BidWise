# PANE_EXIT Signal Rules

## Applicable Rules
- PANE_EXIT means the tmux pane has disappeared (process ended or was killed)
- Must distinguish normal exit from crash

## Classification

### Normal Exit (task completed without MC_DONE)
- dispatch_state is null or idle → pane may have been cleaned up normally
- Check if the story phase was already advanced by another mechanism
- Action: Log and monitor — no immediate action needed

### Crash Exit (unexpected termination)
- dispatch_state was worker_running → worker was active when pane died
- This is likely a crash, OOM kill, or terminal error
- Action: HEALTH rebuild_pane to restore the worker environment
- After rebuild: re-DISPATCH the current phase task

### Stale Exit (old pane cleanup)
- dispatch_state was packet_pasted but pane exited before worker started
- Dispatch may have failed silently
- Action: HEALTH rebuild_pane then re-DISPATCH

## Procedure
1. Read dispatch_state from state_snapshot
2. If worker_running → crash path: HEALTH rebuild_pane, then DISPATCH --retry
3. If packet_pasted → stale path: HEALTH rebuild_pane, then DISPATCH --retry
4. If null/idle → normal path: log only, no action
5. If uncertain: REQUEST_HUMAN with pane exit context

## Authority
- L0 for crash recovery (rebuild + retry)
- L2 if cause is ambiguous (escalate to human)
