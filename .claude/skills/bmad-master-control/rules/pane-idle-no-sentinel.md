# PANE_IDLE_NO_SENTINEL Rules (Critical)

## Core Principle
IDLE without MC_DONE is AMBIGUOUS — do NOT auto-transition.

## Applicable Rules
- An idle pane without an MC_DONE sentinel does NOT mean the task is complete
- The worker may have crashed silently, hit a rate limit, or simply paused
- Auto-transitioning on idle alone risks advancing incomplete work

## Diagnostic Procedure

### Step 1: Check dispatch_state
- `packet_pasted` → dispatch may have failed before worker started
  - The paste may not have been accepted by the Claude instance
  - Action: Investigate pane output before deciding
- `worker_running` → worker was active but stopped without signaling
  - May have truly completed without MC_DONE (rare but possible)
  - May have hit rate limit or content filter silently
  - Action: Capture and analyze full pane output

### Step 2: Check pane log for evidence
- Look for rate limit indicators: "rate limit", "429", "please wait"
- Look for content filter: "content policy", "unable to assist"
- Look for completion indicators: "Task completed", final file writes
- Look for error indicators: stack traces, "Error:", "FATAL"

### Step 3: Decision matrix
- POSITIVE evidence of completion → record the evidence, but do NOT transition from IDLE alone
- Rate limit / content filter evidence → wait and retry (DISPATCH --retry)
- Error evidence → treat as ERROR signal path
- No clear evidence → REQUEST_HUMAN with full pane capture

## Authority
- L1 for retry / recovery actions
- L2 if ambiguous (must escalate to human)

## Warning
IDLE is a diagnostic signal only. It may justify rebuild/re-dispatch or human
escalation, but it must never advance the story phase by itself.
