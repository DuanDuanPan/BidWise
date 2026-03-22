# UAT Result Processing Rules

## Applicable Rules
- UAT (User Acceptance Testing) results come from human input
- The human tests the story manually and reports pass/fail
- This is always L2 authority — the result is the human's judgment

## UAT Pass
- Verify: UAT result file exists at expected path (`.bidwise/master-control/uat/{story_id}.yaml`)
- Action: TRANSITION {story_id} uat_pass
- Effect: Begins pre-merge flow (story enters merge queue)
- The story's merge_priority determines its position in the merge queue

## UAT Fail
- Verify: UAT result file exists with failure details
- Action: TRANSITION {story_id} uat_fail
- Effect: Story returns to fixing phase
- Review cycle counter resets (fresh review after fix)
- Fix cycle increments from where it left off

## Validation Before Transition
- MUST verify the UAT result file exists before issuing TRANSITION
- If no result file: REQUEST_HUMAN to confirm result (may be a manual verbal report)
- If result file is malformed: REQUEST_HUMAN with parse error details

## UAT Result File Format
```yaml
story_id: "3-2"
result: pass | fail
tested_by: "human"
timestamp: "2026-03-22T10:30:00Z"
notes: "Optional human notes"
failures:  # only present on fail
  - description: "What failed"
    severity: critical | major | minor
```

## Authority
- L2: UAT results are always human-sourced
- Commander processes the result but does not judge it
