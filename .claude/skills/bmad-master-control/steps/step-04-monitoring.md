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
- **AUTH: L0** — monitoring 是标准流转，状态转换直接执行
- **ROLE:** 指挥官通过 PEEK_EVENTS 接收事件，通过 command-gateway 驱动状态转换

## RULES
1. 事件驱动：task-monitor daemon 检测 pane 信号并发射事件，指挥官通过 PEEK_EVENTS 消费
2. 状态转换通过 command-gateway TRANSITION 执行，不直接修改文件
3. L0 转换直接执行（C3），禁止询问用户"继续？"(F5)
4. 每轮决策前通过 context-assembler.sh build 获取完整决策包

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

### Event-Driven Work Loop (replaces polling)

This step is now driven by the Commander Work Loop defined in `../workflow.md`.
Task monitor daemon detects pane signals and emits events automatically.

1. **PEEK_EVENTS** `--priority --limit 10`
   - If empty: sleep 15s, then re-peek
   - If events: proceed to step 2

2. **For each event** (highest priority first):
   a. `context-assembler.sh build <project_root> <gen>`
      → Returns decision packet with: event, state, rules, available_commands
   b. Read applicable_rules from the decision packet
   c. Decide: pick the correct command from available_commands based on event type:

#### Event: PANE_SIGNAL_DETECTED (phase=dev, MC_DONE signal=REVIEW_READY)
- `command-gateway.sh <project_root> <gen> TRANSITION <story_id> g7_pass --trigger-seq <N>`
  (transition-engine checks G7 preconditions: source files exist)
- Then: `command-gateway.sh <project_root> <gen> DISPATCH <story_id> review --trigger-seq <N>`
  (auto-dispatches to codex pane per step-05)

#### Event: PANE_SIGNAL_DETECTED (phase=review, MC_DONE signal=PASS)
- `command-gateway.sh <project_root> <gen> TRANSITION <story_id> review_pass --trigger-seq <N>`
  (records G8, sets phase=auto_qa_pending)

#### Event: PANE_SIGNAL_DETECTED (phase=review, MC_DONE signal=FAIL)
- `command-gateway.sh <project_root> <gen> TRANSITION <story_id> review_fail --trigger-seq <N>`
  (sets phase=fixing, dispatches fix per step-05 fix cycle)

#### Event: PANE_SIGNAL_DETECTED (phase=fixing, MC_DONE signal=FIX_COMPLETE)
- `command-gateway.sh <project_root> <gen> TRANSITION <story_id> fix_complete --trigger-seq <N>`
  (returns to pending_review, then TRANSITION g7_pass → re-enters review cycle)

#### Event: TASK_HALT
- `command-gateway.sh <project_root> <gen> REQUEST_HUMAN <story_id> "worker halted" --trigger-seq <N>`

#### Event: PANE_IDLE (without MC_DONE)
- Requires positive evidence before transitioning — do NOT auto-transition on IDLE alone
- Use `context-assembler.sh build` to check pane output for MC_DONE signal

#### Event: HEALTH_ALERT
- `command-gateway.sh <project_root> <gen> HEALTH <action> --trigger-seq <N>`

3. **ACK_EVENTS** `--seq <last_processed_seq>`

4. **Exit condition:** all stories in auto_qa_pending, uat_waiting, or done
   → **Read `./step-06-auto-qa-uat.md`**

5. **Continue condition:** any story still in dev, review, pending_review, or fixing
   → Return to step 1

## CHECKPOINT
- Active stories and phases: {story_states summary}
- Poll count: {poll_count}
- Inspector state: {inspector_state}
