# MC_DONE Signal Rules

## Applicable Rules
- MC_DONE indicates the worker has completed its task
- Match the signal phase to determine the correct TRANSITION intent
- MC_DONE CREATE → TRANSITION create_complete
- MC_DONE PROTOTYPE → TRANSITION prototype_complete
- MC_DONE VALIDATE with PASS → TRANSITION validate_pass
- MC_DONE VALIDATE with FAIL → TRANSITION validate_fail
- MC_DONE DEV → TRANSITION dev_complete
- MC_DONE REVIEW with REVIEW_PASS → TRANSITION review_pass
- MC_DONE REVIEW with REVIEW_FAIL → TRANSITION review_fail
- MC_DONE QA with QA_PASS → TRANSITION qa_pass
- MC_DONE QA with QA_FAIL → TRANSITION qa_fail
- MC_DONE FIXING → TRANSITION fix_complete
- MC_DONE REGRESSION with PASS → TRANSITION regression_pass
- MC_DONE REGRESSION with FAIL → TRANSITION regression_fail
- Always use --trigger-seq from the event seq

## Execution Rules
- Execute TRANSITIONs **one at a time (serial)** — NEVER in parallel
- ACK only AFTER all TRANSITIONs succeed (see ACK-AFTER-SUCCESS in workflow.md)
- If a TRANSITION fails: STOP, do NOT process remaining events, REQUEST_HUMAN

## Validation
- Verify the signal phase matches the story's current phase in gate-state
- If phase mismatch: log warning but still process (worker may have self-corrected)
- If result field is missing on REVIEW/QA/REGRESSION: do NOT auto-transition, REQUEST_HUMAN

## Authority
- L0: Auto-execute (no human confirmation needed)
- Commander issues the TRANSITION command immediately upon validation
