---
story_id: ''
story_states: {}
story_registry: {}
current_session: ''
utility_pane: ''
---

# Step 5: Code Review & Fix Cycle

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- Read `../forbidden-list.md`
- **AUTH: L0** — review 启动和 fix 循环是标准流转
- **LLM:** Review = codex (always) | Fix = claude (default) | Fix = codex (review_cycle >= 2, 升级)
- **ROLE:** 指挥官派发到子窗格，不自己修复

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
4. **Execute pre-dispatch** (Read `../pre-dispatch-checklist.md`):
   - LLM = codex ✓ (C2: 审查 = codex)
   - AUTH = L0 ✓
   - PANE = new ✓ (fresh context)
5. Open NEW codex sub-pane:
   `tmux split-window -t {current_session} -h "cd ../BidWise-story-{story_id} && codex ..."`
6. Send task packet:
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
7. If UI Story, append UX audit request
8. Record: story.review_pane = new pane_id, story.phase = "review", story.current_llm = "codex"
9. Update gate-state.yaml

**Return to step-04 monitoring loop.**

---

### 5b: Handle Review Failure → Fix Cycle

**Entry:** step-04 detects review FAIL for this story.

1. Read gate-state.yaml → 恢复 story_states
2. Extract review findings from review_pane via capture-pane
3. Write findings file (通过 utility_pane):
   `../BidWise-story-{story_id}/review-findings-cycle-{N}.md`
4. **Close review pane** (critical: prevent pane reuse)

#### Normal Fix (review_cycle < 2): Claude
5. **Execute pre-dispatch:**
   - LLM = **claude** ✓ (C2: 修复 = claude)
   - PANE = new or reuse dev_pane (NOT review pane — C2 不变量)
6. If dev_pane still alive:
   - Send fix task packet to dev_pane
7. If dev_pane exited:
   - Open NEW claude sub-pane in worktree
   - Send fix task packet:
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
     - MC_DONE FIX {story_id} REVIEW_READY|HALT
     ```
8. Record: story.phase = "fixing", story.current_llm = "claude"

#### Escalated Fix (review_cycle >= 2): Codex
9. **Execute pre-dispatch:**
   - LLM = **codex** ✓ (C2 升级: claude 2次失败 → codex)
   - PANE = **new** ✓ (C2 不变量: 不能是 review pane)
10. Close existing dev pane if alive
11. Open NEW codex sub-pane (NOT the review pane):
    `tmux split-window -t {current_session} -h "cd ../BidWise-story-{story_id} && codex ..."`
12. Send task packet:
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
    - MC_DONE FIX {story_id} REVIEW_READY|HALT
    ```
13. Record: story.phase = "fixing", story.current_llm = "codex", story.dev_pane = new pane_id
14. Update gate-state.yaml

**Return to step-04 monitoring loop.**
