---
current_merge_story_id: ''
merged_story_files_list: []
regression_cycle: 0
current_session: ''
utility_pane: ''
bottom_anchor: ''
---

# Step 8: Three-Layer Regression on Main

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L0** — regression 是标准流转
- **LLM:** Regression = codex
- **ROLE:** 指挥官派发到 codex 子窗格

## RULES
1. **三层回归 PASS 的唯一标准: L1 + L2 + L3 在同一轮全部通过**
2. 任何层失败 → 修复 → 从 L1 重新开始（不是从失败层重跑）
3. 分次通过不算 PASS（修复可能破坏之前通过的层）
4. 最多 3 轮 (regression_cycle)，超出则 HALT
5. 修复 = codex（已在 regression 上下文中）

## INSTRUCTIONS

### Preflight
1. Read gate-state.yaml → 确认 story G10 PASS for current_merge_story_id
2. Execute pre-dispatch: LLM = codex, AUTH = L0, PANE = new
3. Verify watchdog is healthy before regression:
   - Derive current generation from `gate-state.yaml.session_generation`（if missing, use `0`）
   - Run:
     `"{WATCHDOG_CONTROL_HELPER}" ensure-running "{CLAUDE_SKILL_DIR}" "{commander_pane}" "{inspector_pane}" "{project_root}" "{current_session}" "${current_generation}" 8 120`

### Launch Regression Pane
4. Open codex sub-pane on main (from bottom_anchor):
   `work_pane_id="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "mc-story-{current_merge_story_id}-regression" "{project_root}" "codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox")"`
   Enable pipe-pane: `tmux pipe-pane -t {work_pane_id} -o 'cat >> {mc_log_dir}/pane-{work_pane_id}.log'`
   Record: panes.stories[current_merge_story_id].regression = work_pane_id
   Set story.phase = "regression" (durable — enables resume if session restarts mid-regression)
   Update gate-state.yaml through generation-guarded helper writes
5. Set regression_cycle = 0

### Regression Loop (max 3 cycles)
6. Increment regression_cycle
7. If regression_cycle > 3 → HALT: "Regression failed after 3 full cycles"
8. Re-check watchdog health at the start of each regression cycle:
   `"{WATCHDOG_CONTROL_HELPER}" ensure-running "{CLAUDE_SKILL_DIR}" "{commander_pane}" "{inspector_pane}" "{project_root}" "{current_session}" "${current_generation}" 8 120`

#### L1: 基础自动化
9. Send: "请在 main 执行 L1 基础自动化回归（第 {cycle} 轮）: `pnpm test:unit && pnpm lint && pnpm typecheck && pnpm build`。全绿零 warning = PASS。"
10. Poll until L1 completes
11. If L1 FAIL:
   - Send: "L1 失败，请修复。修复后不要自行重跑 — 等待指挥官重新发起。"
   - Poll until fix completes
   - **Go to step 6** (restart full cycle)

#### L2: Story AC 回归
12. Re-check watchdog health before L2:
    `"{WATCHDOG_CONTROL_HELPER}" ensure-running "{CLAUDE_SKILL_DIR}" "{commander_pane}" "{inspector_pane}" "{project_root}" "{current_session}" "${current_generation}" 8 120`
13. Send: "L1 通过。请执行 L2 Story AC 回归：读取以下 story 文件的 AC，逐项验证每个 AC 在 main 上仍然满足。Story 文件: {merged_story_files_list}。报告每个 AC 的 PASS/FAIL。"
14. Poll until L2 completes
15. If L2 FAIL:
    - Send: "L2 AC 回归失败: {failed_ACs}。请修复。修复后等待指挥官重新发起（从 L1 开始）。"
    - Poll until fix completes
    - **Go to step 6** (restart full cycle)

#### L3: 集成验证
16. Re-check watchdog health before L3:
    `"{WATCHDOG_CONTROL_HELPER}" ensure-running "{CLAUDE_SKILL_DIR}" "{commander_pane}" "{inspector_pane}" "{project_root}" "{current_session}" "${current_generation}" 8 120`
17. Send: "L2 通过。请执行 L3 集成验证：检查合并后各 story 之间的交叉功能，验证跨层调用链路（UI→IPC→Service→DB），启动 app (`pnpm dev`) 验证无报错。PASS 或 FAIL。"
18. Poll until L3 completes
19. If L3 FAIL:
    - Send: "L3 集成验证失败。请修复。修复后等待指挥官重新发起（从 L1 开始）。"
    - Poll until fix completes
    - **Go to step 6** (restart full cycle)

### All Three Layers Passed in Same Cycle

### GATE G11 (per story): regression → cleanup
- **Assert:** L1 + L2 + L3 在同一 regression_cycle 中全部通过
- **On pass:** 通过 helper 记录 story gate：
  `current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"; tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" record-story-gate \"{project_root}\" \"${current_generation}\" \"{current_merge_story_id}\" \"G11\" \"commander\" \"all regression layers passed in same cycle\"" Enter`

20. Set story_states[current_merge_story_id].phase = "done"
21. Update gate-state.yaml: move current_merge_story_id from merge_state.current_story to merge_state.completed（generation-guarded helper path）
22. Close codex pane
23. Output (L1): "✅ Story {current_merge_story_id} 三层回归全部通过（第 {cycle} 轮）"

## CHECKPOINT
- Story: {current_merge_story_id}
- Regression cycle: {regression_cycle}
- L1/L2/L3 results: {results}

## NEXT
Return to `./step-07-merge.md` to merge next story in queue, or immediately read `./step-09-cleanup.md` if queue empty.
- `queue empty -> step-09` is an L0 auto-transition.
- Do not ask the user whether to cleanup, finish the batch, or stop here.
