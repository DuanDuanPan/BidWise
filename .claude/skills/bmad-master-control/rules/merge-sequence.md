# Merge Sequence Rules

## Applicable Rules
- Merge is SEQUENTIAL — only one story merges at a time
- Merge order follows merge_priority (lower number = higher priority)
- After merge completes, regression testing starts immediately

## Merge Ordering
- Check gate-state for all stories in merge_ready status
- Sort by merge_priority ascending
- Only the highest-priority story may proceed with MERGE
- Other merge_ready stories MUST wait (do not issue MERGE for them)
- If two stories have equal priority: use story_id as tiebreaker (lower ID first)

## Merge Procedure
1. Verify story is highest-priority merge_ready
2. Issue MERGE {story_id}
3. After successful merge: TRANSITION {story_id} merge_complete
4. Immediately DISPATCH regression testing for the story

## Regression After Merge
- Regression runs in the merged-to-main worktree (NOT the story worktree)
- The story worktree may be cleaned up after successful merge
- Regression tests verify that the merge did not break existing functionality
- Regression pane targets the main branch checkout, not the story branch

## Regression Results
- Regression PASS → TRANSITION regression_pass → story is DONE
- Regression FAIL → stay in regression phase
  - Increment fix cycle
  - Fix happens in the same pane (main branch context needed)
  - Do NOT create a new story worktree for regression fixes
  - After fix: re-run regression (not full review cycle)

## Conflict Handling
- If merge has conflicts: REQUEST_HUMAN
- Commander does NOT auto-resolve merge conflicts
- Human resolves conflicts, then signals to retry merge

## Authority
- L0: Merge ordering is automatic (no human needed)
- L0: Post-merge regression dispatch is automatic
- L2: Merge conflict resolution requires human
