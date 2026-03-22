# HALT Signal Rules

## Applicable Rules
- HALT indicates the worker has encountered a situation it cannot resolve autonomously
- Immediate escalation to human is REQUIRED — no auto-recovery attempts
- Commander MUST issue REQUEST_HUMAN with the halt reason from the payload
- Do NOT attempt DISPATCH retry or HEALTH rebuild — the worker chose HALT deliberately
- Preserve the pane state for human inspection (do not destroy or rebuild)

## Typical HALT Reasons
- Ambiguous requirements that need human clarification
- Conflicting constraints the worker cannot resolve
- Security-sensitive decisions requiring human judgment
- Worker detected it is looping or making no meaningful progress

## Procedure
1. Extract halt reason from event payload
2. Issue REQUEST_HUMAN with reason and full context
3. Set story dispatch_state to halted_awaiting_human
4. Do NOT advance the story phase

## Authority
- L2: Requires human input — commander cannot resolve HALT autonomously
