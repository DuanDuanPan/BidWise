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
4. **Prepare pre-dispatch** (Read `../pre-dispatch-checklist.md`):
   - LLM = codex ✓ (C2: 审查 = codex)
   - AUTH = L0 ✓
   - PANE = new ✓ (fresh context)
5. Open NEW codex sub-pane:
   `work_pane_id="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "mc-story-{story_id}-review" "../BidWise-story-{story_id}" "codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox")"`
   Enable pipe-pane: `tmux pipe-pane -t {work_pane_id} -o 'cat >> {mc_log_dir}/pane-{work_pane_id}.log'`
6. Write `dispatch_audit` with the real `work_pane_id` (never `pane: new`)
7. Send task packet:
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
8. If UI Story, append UX audit request
9. Persist through helper writes:
   - `upsert-story-state ... "phase=review" "current_llm=codex" "review_cycle={next_review_cycle}" "dispatch_state=worker_running" "pane.review={work_pane_id}"`
   - Review pane 不写入 `story_states.dev_pane`，只写 `panes.stories[story_id].review`

**Return to step-04 monitoring loop.**

---

### 5b: Handle Review Failure → Fix Cycle

**Entry:** step-04 detects review FAIL for this story.

1. Read gate-state.yaml → 恢复 story_states
2. Extract review findings from `panes.stories[story_id].review` via capture-pane
3. Write findings file (通过 utility_pane):
   `../BidWise-story-{story_id}/review-findings-cycle-{N}.md`
4. **Close review pane** (critical: prevent pane reuse)
   - After `kill-pane`, immediately run:
     - `upsert-story-state ... "pane.review=null"`
     - `cleanup-stale-panes ... "{current_session}"`

#### Normal Fix (review_cycle < 2): Claude
5. **Execute pre-dispatch:**
   - LLM = **claude** ✓ (C2: 修复 = claude)
   - PANE = new or reuse `panes.stories[story_id].dev` (NOT review pane — C2 不变量)
6. If `panes.stories[story_id].dev` still alive:
   - Rename pane title: `tmux select-pane -t {dev_pane_id} -T "mc-story-{story_id}-fixing"`
   - Write `dispatch_audit` with the reused `dev_pane_id`
   - Send fix task packet to `dev_pane_id`
7. If `panes.stories[story_id].dev` exited:
   - Open NEW claude sub-pane in worktree:
     `work_pane_id="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "mc-story-{story_id}-fixing" "../BidWise-story-{story_id}" "claude --dangerously-skip-permissions")"`
   - Write `dispatch_audit` with the real `work_pane_id`
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
8. Record via helper:
   - `upsert-story-state ... "phase=fixing" "current_llm=claude" "dispatch_state=worker_running" "pane.dev={active_fix_pane_id}"`
9. Update gate-state.yaml through helper writes only

#### Escalated Fix (review_cycle >= 2): Codex
9. **Execute pre-dispatch:**
   - LLM = **codex** ✓ (C2 升级: claude 2次失败 → codex)
   - PANE = **new** ✓ (C2 不变量: 不能是 review pane)
10. Close existing dev pane if alive
    - Then `upsert-story-state ... "pane.dev=null"` + `cleanup-stale-panes ... "{current_session}"`
11. Open NEW codex sub-pane（from the bottom work layer, NOT the review pane）:
    `work_pane_id="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "mc-story-{story_id}-fixing" "../BidWise-story-{story_id}" "codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox")"`
    Enable pipe-pane: `tmux pipe-pane -t {work_pane_id} -o 'cat >> {mc_log_dir}/pane-{work_pane_id}.log'`
12. Write `dispatch_audit` with the real `work_pane_id`
13. Send task packet:
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
14. Record via helper:
    - `upsert-story-state ... "phase=fixing" "current_llm=codex" "dispatch_state=worker_running" "pane.dev={work_pane_id}"`
15. Update gate-state.yaml through generation-guarded helper writes

**Return to step-04 monitoring loop.**
