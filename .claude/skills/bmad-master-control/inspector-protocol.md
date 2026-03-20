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
   收到"请审查 Gate G{N}"时，读取 _bmad-output/implementation-artifacts/gate-report-G{N}.md，
   然后独立验证磁盘/git 状态，输出 APPROVE 或 REJECT + 逐项 PASS/FAIL。

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
监察官 ─── 读取报告 + 独立验证磁盘/git ────────────── 监察官
                                                       │
监察官 ─── 输出 APPROVE/REJECT ────────────────────── 指挥官（capture-pane 读取结论）
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
