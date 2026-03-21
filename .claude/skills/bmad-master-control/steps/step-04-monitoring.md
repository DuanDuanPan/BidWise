---
batch_stories: []
story_states: {}
poll_count: 0
current_session: ''
inspector_pane: ''
utility_pane: ''
---

# Step 4: Monitoring Loop (Core State Machine)

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L0** — monitoring 是标准流转，状态转换直接执行
- **ROLE:** 指挥官只读 pane 输出 + 驱动状态转换

## RULES
1. 每轮 poll 先从 gate-state.yaml 恢复完整 story_states（不靠记忆）
2. **每轮 poll: 强制 re-read `../constitution.md` + `session-journal.yaml`**（防止长时间运行导致上下文饱和后指令遗忘）
3. 状态转换通过 Read 对应 step 文件实现，不用 goto
4. L0 转换直接执行（C3），禁止询问用户"继续？"(F5)

## STATE MACHINE

```
dev ──(pane idle)──→ pending_review ──(G7)──→ [Read step-05]
                                                    ↓
review ←───────────────────────────────────── step-05 returns
  │
  ├──(PASS)──→ auto_qa_pending ──→ [Read step-06 when all ready]
  │
  └──(FAIL)──→ fixing ──(pane idle)──→ pending_review (loop)
```

## INSTRUCTIONS

### Each Poll Iteration

1. **Restore state:** Read gate-state.yaml → 恢复 story_states, pane registry
   - If any `phase == dev` story has `dispatch_state ∈ {pane_opened, packet_pasted}`:
     **do not** treat it as running dev; read `./step-03-launch-dev.md` and repair dispatch first
2. **每轮强制刷新:** Read `../constitution.md` + `session-journal.yaml`
3. **Inspector health check:** Verify inspector pane alive via `tmux list-panes`
   - If missing: re-initialize inspector (see `../inspector-protocol.md`)
   - Sync live pane IDs back into gate-state via helper (`sync-runtime-panes`)
4. **Watchdog health check:** Verify watchdog still healthy
   - Derive current generation:
     `current_generation="$(sed -n 's/^session_generation:[[:space:]]*//p' _bmad-output/implementation-artifacts/gate-state.yaml | head -n 1)"; [ -n "$current_generation" ] || current_generation=0`
   - Run:
     `"{WATCHDOG_CONTROL_HELPER}" ensure-running "{CLAUDE_SKILL_DIR}" "{commander_pane}" "{inspector_pane}" "{project_root}" "{current_session}" "${current_generation}" 8 120`
   - If unhealthy:
     - append `correction` entry to `session-journal.yaml`
     - If `ensure-running` still fails → HALT
   - On healthy: sync pid / heartbeat / status back into gate-state via helper (`sync-watchdog`)

5. **Poll each active story based on phase:**

#### Phase: `dev`
- Read `../completion-detection.md` if needed for detection tips
- Capture dev_pane output, check for:
  - `❯ [Pasted text #…]` or equivalent staged-input marker → treat as failed/incomplete dispatch, **not** as idle completion; return to Step 3 repair
  - Claude idle (❯) or MC_DONE DEV → set phase = "pending_review"
  - HALT → HALT and notify user
  - Error/crash → warn user

#### Phase: `pending_review`
- **GATE G7 (per story):** `ls ../BidWise-story-{story_id}/src/` → 源文件存在
- On G7 PASS → **Read `./step-05-code-review.md`** for this story
- step-05 will set phase = "review" and return here

#### Phase: `review`
- Capture review_pane output, check for:
  - MC_DONE REVIEW PASS →
    **GATE G8 (per story):** review output 包含 PASS
    On G8 PASS → set phase = "auto_qa_pending"
  - MC_DONE REVIEW FAIL → save findings, **Read `./step-05-code-review.md`** (fix cycle section)
  - Still running → continue polling

#### Phase: `fixing`
- Capture dev_pane output, check for:
  - Fix completed (Claude/Codex idle or MC_DONE FIX) → set phase = "pending_review"
  - Still running → continue polling

#### Phase: `auto_qa_pending`
- Skip — waiting for step-06

#### Phase: `uat_waiting`
- Skip — waiting for user

6. **Update gate-state.yaml** with current story_states snapshot（通过 utility_pane + generation-guarded helper path；禁止 raw YAML 编辑）

7. **Inspector 主动监察 (每 3 轮, if inspector_state == idle):**
   - Set inspector_state = busy_audit
   - Send audit request to inspector_pane (see `../inspector-protocol.md`)
   - Poll until COMPLIANT or VIOLATION
   - Set inspector_state = idle
   - If VIOLATION → HALT

### Loop Control

8. **Exit condition:** all stories in auto_qa_pending, uat_waiting, or done
   → **Read `./step-06-auto-qa-uat.md`**

9. **Continue condition:** any story still in dev, review, pending_review, or fixing
   - Increment poll_count
   - Wait interval: dev=60s, review/fixing=30s (use shortest among active)
   - Return to step 1 of this loop

## CHECKPOINT
- Active stories and phases: {story_states summary}
- Poll count: {poll_count}
- Inspector state: {inspector_state}
