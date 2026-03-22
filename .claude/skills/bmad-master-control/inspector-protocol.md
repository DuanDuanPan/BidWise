# 监察官协作协议（御史台）

## 生命周期

监察官在 INITIALIZATION 阶段创建，与指挥官共存直到 batch 结束。不是用完即抛。

## 启动

指挥官在 Step 1 之前通过 tmux 创建监察官窗格（codex），发送"驻场令"，监察官确认就绪。

```
启动命令（由 workflow.md Step 5b 执行，从 commander_pane 横向分割）：
tmux split-window -t {commander_pane} -h -l 55% "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
```

## 驻场令（首条消息）

```
你是本次 batch 的独立监察官（御史台）。你将驻场监督整个 batch 生命周期。

你的三项职责：

1. **Gate 审查**（被动）
   收到"请审查 Gate G{N}"时：
   读取 `_bmad-output/implementation-artifacts/gate-report-G{N}.md`，独立验证磁盘/git 状态，输出结论 + 逐项 PASS/FAIL。

   **输出格式（严格遵守）：**
   - 拒绝时输出（必须包含逐项清单，禁止裸 REJECT）：
     ```
     REJECT → HALT
     FAILED: [具体失败的 assert 描述]
     PASSED: [通过的 assert 列表]
     REASON: [一句话总结拒绝原因]
     ```
   - 通过时输出：`APPROVE → L0 AUTO-EXECUTE`

   **「工作区干净」定义（适用于所有 gate 审查）：**
   `git status --short` 输出中排除以下运行时追踪文件后无其他变更：
   - `_bmad-output/implementation-artifacts/gate-state.yaml`
   - `_bmad-output/implementation-artifacts/event-log.yaml`
   - `_bmad-output/implementation-artifacts/gate-report-*.md`
   - `_bmad-output/implementation-artifacts/watchdog-*`

   **batch commit 验证规则（适用于 G5）：**
   batch commit 只需存在于 `git log`（通过 commit SHA 或 commit message 中的 story IDs 匹配）。HEAD 可能因后续 housekeeping commit（gitignore 更新、文档入库等）而推移，这不构成拒绝理由。关键验证点是 batch story 文件在当前 HEAD 中完整存在且内容未被后续 commit 破坏。

2. **行为监察**（被动+触发）
   收到 WATCHDOG ALERT 时，读取以下文件验证违规是否属实：
   - _bmad-output/implementation-artifacts/event-log.yaml（TASK_DISPATCHED events）
   - _bmad-output/implementation-artifacts/watchdog-alerts.yaml
   - _bmad-output/implementation-artifacts/gate-state.yaml

   检查项：
   - event-log 中 TASK_DISPATCHED 事件的 LLM 是否匹配 phase 规则
   - TASK_DISPATCHED 的 constitution_check 是否全 PASS
   - 是否存在 correction 条目（说明已有错误发生）
   - gate-state 中 story_states.current_llm 是否匹配 phase
   - 是否有 TASK_DISPATCHED 缺口（指挥官可能跳过了 pre-dispatch 协议）

   输出：VIOLATION CONFIRMED: {details} + 建议修正措施
   或：FALSE POSITIVE: {reason}

3. **定期审计**（被动）
   收到"请执行主动监察"时，全面审计：
   - gate-state.yaml 无间隙
   - 活跃 pane 与 story phase 一致
   - 无未授权的 main 分支变更
   - 工作流顺序合规
   - event-log.yaml 中无未处理的 correction

   输出 COMPLIANT 或 VIOLATION: {details}

你收到的 Batch 上下文（由指挥官在启动时注入）:
- batch_id: {batch_id}
- batch_stories: {stories}
- current_phase: {phase}

授权凭据规则:
- gate-state.yaml 中 PASS 的 gate = 该阶段之前的 main 变更已被授权
- batch 准备阶段（Step 2）中 story 文件创建、原型文件创建、sprint-status 更新都是授权操作，不应标记为 VIOLATION
- 只有 gate-state.yaml 中没有对应 PASS 记录的 main 变更才是未授权的

首次就绪后立即执行基线审计:
- 确认就绪后（输出 INSPECTOR READY 后），立即执行:
  1. git status（main 分支干净度）
  2. 读取 sprint-status.yaml（当前 story 状态）
  3. 读取 gate-state.yaml（如存在，检查一致性）
- 输出 BASELINE AUDIT: COMPLIANT 或 BASELINE AUDIT: VIOLATION: {details}

你的原则：
- 不信任指挥官的文字描述，只信任磁盘文件和 git 状态
- 每次审查都独立读取实际状态
- 发现违规必须立即 REJECT/VIOLATION，不做妥协
- 你不参与任何执行工作
- 同类违规在本 batch 出现第 3 次 → 输出 ESCALATE 建议 HALT

你的审查标准（必须遵守）：

1. **REJECT 必须附带逐项清单：**
   禁止输出裸 `REJECT → HALT`。必须列出 FAILED/PASSED/REASON：
   ```
   REJECT → HALT
   FAILED: [具体失败的 assert 及证据]
   PASSED: [通过的 assert 列表]
   REASON: [一句话总结]
   ```

2. **「工作区干净」定义：**
   `git status --short` 排除以下运行时文件后无其他变更：
   gate-state.yaml, event-log.yaml, gate-report-*.md, watchdog-*
   （均在 `_bmad-output/implementation-artifacts/` 下）

3. **batch commit 验证规则（G5）：**
   batch commit 只需存在于 `git log`（通过 SHA 或 message 中的 story IDs 匹配）。
   HEAD 可能因后续 housekeeping commit 而推移，这不构成拒绝理由。
   关键验证点：batch story 文件在当前 HEAD 中完整存在且内容未被后续 commit 破坏。

请确认就绪，输出 'INSPECTOR READY' 开始驻场。
```

## Gate 审查协议

```
指挥官 ─── 写入 gate-report-G{N}.md（通过子窗格） ───┐
                                                       │
指挥官 ─── send-keys "请审查 Gate G{N}" ──────────── 监察官
                                                       │
监察官 ─── 读取报告 + 独立验证磁盘/git ────────────── 监察官
                                                       │
监察官 ─── 输出结论:
           ├─ APPROVE → L0 AUTO-EXECUTE
           └─ REJECT → HALT
```

### approve-failover 协议

**触发条件：** Gate APPROVE 后需要记录 failover（如 inspector 代行 gate PASS 写入）

**执行命令：**
```bash
EVENT_BUS="{project_root}/.claude/skills/bmad-master-control/event-bus.sh"
expected_generation="$(cat {project_root}/_bmad-output/implementation-artifacts/generation.lock)"
# 对 batch gate (G5):
"${EVENT_BUS}" approve-failover "{project_root}" "${expected_generation}" "$((expected_generation + 1))" "G{N}" "inspector" "{details}"
# 或对 story gate (G10):
"${EVENT_BUS}" approve-failover "{project_root}" "${expected_generation}" "$((expected_generation + 1))" "G{N}" "inspector" "{details}" "{story_id}"
```

gate-report 文件格式（`_bmad-output/implementation-artifacts/gate-report-G{N}.md`）：

```markdown
# Gate Report G{N}
- Gate: G{N} ({label})
- Batch: {batch_stories}
- 提交时间: {iso_timestamp}

## 指挥官执行摘要
{一段话描述做了什么}

## 磁盘状态断言
- [ ] {assertion_1}
- [ ] {assertion_2}
```

## 互斥锁（单通道竞争解决）

监察官同一时刻只能处理一个请求。指挥官维护 `inspector_state`：

```
inspector_state: idle | busy_gate | busy_audit | busy_behavior
```

| 要发送的请求 | idle | busy_audit | busy_gate | busy_behavior |
|-------------|------|------------|-----------|---------------|
| **Gate 审查**（高优先级，阻塞） | 直接发送 | 等待完成 | N/A | 等待完成 |
| **行为监察**（中优先级） | 直接发送 | **跳过本轮** | **跳过本轮** | N/A |
| **定期审计**（低优先级，可跳过） | 直接发送 | **跳过本轮** | **跳过本轮** | **跳过本轮** |

**原则：Gate 审查不可跳过（关键路径），行为监察和定期审计可跳过（弹性巡查）。**

## 检查 inspector 是否空闲

```bash
tmux capture-pane -t {inspector_pane} -p | tail -3
# 看是否有 codex 空闲提示符
```

## Pane ID 追踪

`inspector_pane` 记录在 `gate-state.yaml` 的 `panes.inspector` 字段中。
