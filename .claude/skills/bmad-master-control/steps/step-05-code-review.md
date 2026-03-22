---
story_id: ''
story_states: {}
story_registry: {}
current_session: ''
utility_pane: ''
bottom_anchor: ''
---

# Step 5: Code Review & Fix Cycle

## GUARDS
- Read `../constitution.md` before proceeding

- Read `../forbidden-list.md`
- **AUTH: L0** — review 启动和 fix 循环是标准流转
- **LLM:** Review = codex (always) | Fix = claude (default) | Fix = codex (review_cycle >= 2, 升级)
- **ROLE:** 指挥官通过 command-gateway 派发，不自己修复

## RULES
1. **C2:** Code review 必须使用 codex（不同 LLM 视角）
2. **C2 不变量:** 审查 pane ≠ 修复 pane — 即使都用 codex 也必须新开 pane
3. Review 必须在 fresh context 中执行（新 pane），不复用 dev pane
4. Max 3 review cycles per story, exceed → L3 HALT

## INSTRUCTIONS

### 5a: Launch Code Review

1. Read gate-state.yaml → 恢复 story_states, 确认 G7 PASS for this story
2. Check review_cycle:
   - `review_cycle >= 3` → HALT: "Story {story_id} failed code review after 3 cycles"
3. Increment review_cycle
4. Dispatch review via command-gateway:
   `command-gateway.sh <project_root> <gen> DISPATCH <story_id> review --trigger-seq <N>`
   (transition-engine opens fresh codex pane, sends task packet, records dispatch)
5. Task packet sent by transition-engine:
   ```
   Skill: bmad-code-review
   Goal: Review story implementation against main in fresh context
   Inputs:
   - story id: {story_id}
   - worktree: {worktree_path}
   - automation: non-interactive
   - review mode: branch diff vs main
   - base branch: main
   - spec file: {story_file_worktree}
   Constraints:
   - fresh context
   - do not modify files
   - ask only if a path or diff baseline is invalid
   Expected Output:
   - MC_DONE REVIEW {story_id} PASS|FAIL
   - findings grouped as must-fix / should-fix / optional
   ```
6. If UI Story, append UX audit request
7. State is persisted automatically by transition-engine (phase=review, current_llm=codex)

**Return to step-04 event-driven work loop.**

---

### 5b: Handle Review Failure → Fix Cycle

**Entry:** step-04 detects review FAIL for this story.

1. Read gate-state.yaml → 恢复 story_states
2. Extract review findings from `panes.stories[story_id].review` via capture-pane
3. Write findings file (通过 utility_pane):
   `../BidWise-story-{story_id}/review-findings-cycle-{N}.md`
4. Review pane is closed by transition-engine after REVIEW_FAIL event

#### Normal Fix (review_cycle < 2): Claude
5. `command-gateway.sh <project_root> <gen> DISPATCH <story_id> fixing --trigger-seq <N>`
   (transition-engine handles: LLM=claude, reuses dev pane if alive, opens new if not)
6. Fix task packet:
     ```
     Skill: debugging-strategies
     Goal: Fix all must-fix review findings
     Inputs:
     - story id: {story_id}
     - worktree: {worktree_path}
     - findings file: review-findings-cycle-{N}.md
     Constraints:
     - fix only this worktree
     Expected Output:
     - MC_DONE FIXING {story_id} FIX_COMPLETE|HALT
     ```
7. State is persisted automatically by transition-engine (phase=fixing, current_llm=claude)

#### Escalated Fix (review_cycle >= 2): Codex
8. `command-gateway.sh <project_root> <gen> DISPATCH <story_id> fixing --trigger-seq <N> --override-llm codex --override-reason "review_cycle>=2"`
   (transition-engine handles: fresh codex pane, closes old dev pane)
9. Escalated fix task packet:
    ```
    Skill: debugging-strategies
    Goal: Solve stubborn review failures with fresh model perspective
    Inputs:
    - story id: {story_id}
    - worktree: {worktree_path}
    - findings file: review-findings-cycle-{N}.md
    Constraints:
    - analyze root cause before editing
    - fix only must-fix items first
    Expected Output:
    - MC_DONE FIXING {story_id} FIX_COMPLETE|HALT
    ```
10. State is persisted automatically by transition-engine (phase=fixing, current_llm=codex)

**Return to step-04 event-driven work loop.**
