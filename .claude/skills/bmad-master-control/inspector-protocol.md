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
   **第一步（必须最先执行）：** 检查 `_bmad-output/implementation-artifacts/restart-eligible.yaml` 是否存在，记住结果。
   然后读取 `_bmad-output/implementation-artifacts/gate-report-G{N}.md`，独立验证磁盘/git 状态，输出结论 + 逐项 PASS/FAIL。

   **输出格式（严格遵守）：**
   - 拒绝时输出：`REJECT → HALT` + 拒绝原因（不重启，问题优先）
   - 通过且 restart-eligible.yaml **不存在**时输出：`APPROVE → L0 AUTO-EXECUTE`
   - 通过且 restart-eligible.yaml **存在**时输出：`APPROVE → SESSION-RESTART`，然后执行下方 SESSION-RESTART 协议

2. **行为监察**（被动+触发）
   收到 WATCHDOG ALERT 时，读取以下文件验证违规是否属实：
   - _bmad-output/implementation-artifacts/session-journal.yaml
   - _bmad-output/implementation-artifacts/watchdog-alerts.yaml
   - _bmad-output/implementation-artifacts/gate-state.yaml

   检查项：
   - session-journal 中 dispatch_audit 的 LLM 是否匹配 phase 规则
   - dispatch_audit 的 constitution_check 是否全 PASS
   - 是否存在 correction 条目（说明已有错误发生）
   - gate-state 中 story_states.current_llm 是否匹配 phase
   - 是否有 dispatch_audit 缺口（指挥官可能跳过了 pre-dispatch 协议）

   输出：VIOLATION CONFIRMED: {details} + 建议修正措施
   或：FALSE POSITIVE: {reason}

3. **定期审计**（被动）
   收到"请执行主动监察"时，全面审计：
   - gate-state.yaml 无间隙
   - 活跃 pane 与 story phase 一致
   - 无未授权的 main 分支变更
   - 工作流顺序合规
   - session-journal 中无未处理的 correction

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

请确认就绪，输出 'INSPECTOR READY' 开始驻场。
```

## Gate 审查协议

```
指挥官 ─── 写入 gate-report-G{N}.md（通过子窗格） ───┐
                                                       │
指挥官 ─── send-keys "请审查 Gate G{N}" ──────────── 监察官
                                                       │
监察官 ─── 【第一步】检查 restart-eligible.yaml ──── 监察官
           （文件不存在 → 跳过，继续正常审查）
           （文件存在 → 审查完成后执行 SESSION-RESTART）
                                                       │
监察官 ─── 读取报告 + 独立验证磁盘/git ────────────── 监察官
                                                       │
监察官 ─── 输出结论:
           ├─ REJECT → HALT（不重启，先修问题）
           ├─ APPROVE → L0 AUTO-EXECUTE（无需重启）
           └─ APPROVE → SESSION-RESTART（需要重启，执行下方协议）
```

### SESSION-RESTART 协议

**触发条件：** Gate APPROVE + `_bmad-output/implementation-artifacts/restart-eligible.yaml` 存在

**执行步骤（由监察官在自己的 pane 中执行，顺序不可变）：**

1. 输出 `APPROVE → SESSION-RESTART`
2. **先落盘 gate PASS（在杀 commander 之前，消除竞态）：**
   通过 shell 更新 gate-state.yaml，写入 gate PASS：
   ```bash
   python3 -c "
   import yaml
   with open('_bmad-output/implementation-artifacts/gate-state.yaml') as f:
       state = yaml.safe_load(f)
   # 对 batch gate (G5):
   state['gates']['G{N}'] = {'status': 'PASS', 'timestamp': '...', 'verified_by': 'inspector'}
   # 或对 story gate (G10):
   state.setdefault('story_gates', {}).setdefault('{story_id}', {})['G{N}'] = {'status': 'PASS', ...}
   import datetime
   state['last_updated'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
   with open('_bmad-output/implementation-artifacts/gate-state.yaml', 'w') as f:
       yaml.dump(state, f, allow_unicode=True)
   "
   ```
3. 验证写入成功：检查 `last_updated` 已更新
4. 删除 sentinel 文件：`rm -f _bmad-output/implementation-artifacts/restart-eligible.yaml`
5. 记录 commander pane ID（从 restart-eligible.yaml 的 `commander_pane` 字段读取，在删除前已记录）
6. 向 commander pane 发送退出命令：
   ```bash
   tmux send-keys -t {commander_pane} '/exit' Enter
   ```
7. 等待 commander pane 回到 shell prompt（轮询 `tmux capture-pane`，检测 `$` 或 `❯` 提示符，最多等 30 秒）
8. 向同一 pane 启动新 claude 并发送恢复指令：
   ```bash
   tmux send-keys -t {commander_pane} 'claude' Enter
   ```
   等待 claude 就绪后发送：
   ```bash
   tmux send-keys -t {commander_pane} '请从 gate-state.yaml 恢复指挥官会话。执行 /bmad-master-control' Enter
   ```

**关键顺序：** 先写 gate PASS → 再删 sentinel → 再杀 commander。即使杀进程失败，状态已安全落盘。
**注意：** REJECT 时不执行重启 — 问题优先于上下文刷新。Watchdog 检测到 sentinel 文件被删除后自动重置计时器。

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
