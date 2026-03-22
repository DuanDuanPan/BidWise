# HEALTH_ALERT Rules

## Applicable Rules
- Health alerts come from the watchdog subsystem detecting anomalies
- Each alert type requires a different response strategy

## Alert Types

### C2 Violation (command-and-control integrity)
- A worker or process violated the expected control flow
- Evidence: unauthorized state change, bypassed gate, direct file mutation
- Action: CORRECTION event to restore proper state, then investigate
- May need HEALTH rebuild_pane if the pane environment is compromised
- Authority: L1 (auto-correct if clear violation, escalate if ambiguous)

### Dispatch Gap
- A story is in a phase that should have an active dispatch but none exists
- Evidence: story phase is dev/review/qa/fixing but dispatch_state is null
- Action: Re-DISPATCH the story for its current phase
- Check if a previous DISPATCH failed silently
- Authority: L0 (auto-recoverable)

### State Drift
- gate-state.yaml diverges from expected filesystem state
- Evidence: worktree missing, pane exists but story shows no dispatch
- Action: Reconcile state — update gate-state to match reality
- May need HEALTH rebuild_pane or REQUEST_HUMAN if severe
- Authority: L1 (auto-reconcile minor drift, escalate major drift)

### Resource Exhaustion
- System resources (disk, memory, tmux panes) approaching limits
- Action: Clean up completed story resources, compact logs
- If critical: REQUEST_HUMAN to decide which stories to pause
- Authority: L0 for cleanup, L2 for story pausing decisions

## Procedure
1. Parse alert_type from event payload
2. Match to classification above
3. Issue appropriate HEALTH or CORRECTION command
4. If uncertain about root cause: REQUEST_HUMAN with full alert context
5. Log the alert response for watchdog audit trail
