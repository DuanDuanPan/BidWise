# Code Review Findings — Story 2-2 — Cycle 2

## Review Context

- Story: 2-2 Agent Orchestrator & Task Queue
- Review Cycle: 2
- Remaining from R1: 2 items (3/5 fixed in cycle 1)

## Must-Fix Items

### [High] Executor ignores AbortSignal (cooperative cancel limitation)

- Issue: Task executor functions do not check AbortSignal during execution. When a task is cancelled, the signal is set but the executor continues running to completion since it never checks signal.aborted.
- Root Cause: The AbortController pattern requires cooperative cancellation — executors must periodically check the signal.
- Fix:
  1. Pass AbortSignal to executor functions as a parameter
  2. Add signal.aborted checks at key iteration points within long-running executors
  3. Throw an AbortError when signal is detected as aborted
  4. Ensure the task queue properly handles AbortError (mark task as cancelled, not failed)

### [Medium] recoverPendingTasks has no executor map on restart

- Issue: When the application restarts, recoverPendingTasks finds tasks that were in-progress but has no way to re-execute them because the executor map (taskType → executorFunction) is not yet populated.
- Fix:
  1. Ensure executor registration happens before recoverPendingTasks is called
  2. Or: mark recovered tasks as "pending_retry" and process them when executors register
  3. Add a guard that logs a warning if an executor is not found for a recovered task type

## Should-Fix Items

None.

## Optional Items

None.
