# Fix Cycle Pane Strategy Rules

## Applicable Rules
- When a review or QA fails, the story enters the fixing phase
- The commander must decide whether to reuse the existing dev pane or create a fresh one
- This decision depends on the fix cycle number and the nature of the defect

## Decision Matrix

### Cycle 1 + Local Defect
- Defect types: naming convention, missing null check, off-by-one, formatting
- Strategy: Reuse dev pane (DISPATCH without --fresh-pane)
- Rationale: Worker has full context already loaded; small fix is faster in-place

### Cycle 1 + Systemic Issue
- Defect types: architecture violation, data flow error, wrong abstraction, missing service
- Strategy: New pane (DISPATCH with --fresh-pane)
- Rationale: Systemic issues need fresh perspective; old context may reinforce the mistake

### Cycle 2 + Same Class of Issue
- The same category of defect recurred after first fix attempt
- Strategy: New pane recommended (DISPATCH with --fresh-pane)
- Rationale: The worker's context is likely biased; fresh start avoids loops

### Cycle 2 + Different Issue
- A new defect class appeared (not the same as cycle 1)
- Strategy: Reuse pane is acceptable (DISPATCH without --fresh-pane)
- Rationale: Different issue means the first fix worked; pane context is still useful

### Cycle 3+
- Engine forces new pane with codex (commander does not choose)
- The transition engine automatically sets --fresh-pane --with-codex
- Commander should NOT override this — it is a safety mechanism
- If cycle 3 also fails: REQUEST_HUMAN (likely a systemic design issue)

## Defect Classification Hints
```yaml
local_defects:
  - naming_convention
  - missing_check
  - formatting
  - typo
  - import_order
  - test_assertion_value

systemic_defects:
  - architecture_violation
  - data_flow_error
  - wrong_abstraction
  - missing_service_layer
  - incorrect_state_management
  - security_pattern_violation
```

## Authority
- L0: Commander decides pane strategy for cycles 1-2
- Automatic: Engine decides for cycle 3+ (no commander input)
