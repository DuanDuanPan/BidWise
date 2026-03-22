# ERROR Signal Rules

## Applicable Rules
- ERROR signals indicate the worker encountered an error or crash
- Evaluate severity before choosing a response — not all errors require escalation

## Error Classification

### Rate Limit / Throttling
- Evidence: "rate limit", "429", "too many requests" in payload
- Action: Wait and retry — DISPATCH with --retry after backoff delay
- Authority: L0 (auto-recoverable)

### Content Filter / Safety
- Evidence: "content filter", "safety", "blocked" in payload
- Action: Adjust prompt context — DISPATCH with --adjust-prompt
- If repeated (2+ times): REQUEST_HUMAN with filter details
- Authority: L1 (first attempt auto, escalate on repeat)

### Stack Trace / Runtime Error
- Evidence: stack trace, exception, segfault in payload
- Action: Check if recoverable (transient vs structural)
- Transient (network, timeout): DISPATCH with --retry
- Structural (missing file, bad config): HEALTH rebuild_pane
- Unknown: REQUEST_HUMAN with full error context
- Authority: L1 (judgment required)

### Out of Memory / Resource Exhaustion
- Evidence: "OOM", "memory", "killed" in payload
- Action: HEALTH rebuild_pane with --fresh-pane
- Authority: L0 (auto-recoverable)

## Procedure
1. Parse error payload for classification signals
2. Check fix_cycle count — if cycle 3+, escalate regardless
3. Issue the appropriate command based on classification
4. Log the error classification decision for audit trail
