# Master Control Watchdog / Inspector / Resume 设计改造

## 背景

当前 `bmad-master-control` 已经具备三个核心角色：

- `watchdog.sh` 负责结构化巡检
- `inspector` 负责独立复核与 gate 审查
- `gate-state.yaml` / `session-journal.yaml` 负责 checkpoint 与恢复

但从 2026-03-21 的实际运行看，仍存在以下缺口：

1. watchdog 只在初始化阶段尝试启动一次，后续没有 liveness 检查。
2. 若 watchdog 启动失败，当前流程不会自动发现。
3. watchdog 的 phase 规则与 workflow 状态机不完全一致，例如检查了 `validating`，而主状态机未定义该持久 phase。
4. Step 2 批准备阶段缺少持续健康检查，watchdog 即使失效也不会被发现。
5. `watchdog` 只负责“发现”，但缺少可验证的 heartbeat / pid / generation 机制，恢复链路不够稳。

本设计借鉴 Redis Sentinel 的思想，但不照搬其分布式选主机制。目标是把当前系统升级为：

- `watchdog = subjective down detector`
- `inspector = objective down confirmer`
- `gate-state = durable failover state`
- `restart-eligible = delayed failover trigger at safe boundary`

## 设计目标

### 功能目标

1. commander 启动后，必须可验证 watchdog 已成功运行。
2. watchdog 运行期间，必须持续暴露可读心跳与进程元数据。
3. 任意阶段都能检测 watchdog 丢失，而不是只在 Step 4 才检查。
4. restart 只能在安全 gate 边界发生，不能在任意中间状态切换。
5. 恢复必须具备 epoch / generation，避免旧 commander 与新 commander 并发写状态。

### 非功能目标

1. 不引入真正的分布式共识。
2. 不让 watchdog 直接 kill pane。
3. 仍然保持 `watchdog -> inspector -> commander` 的职责分层。

## 借鉴 Redis Sentinel 的部分

### 1. 主观下线 / 客观下线

Redis Sentinel 的核心思想是：

- 一个 Sentinel 先判断 `SDOWN`
- 多个 Sentinel 确认后才进入 `ODOWN`

在本系统中映射为：

- `watchdog` 负责 `subjective_down`
- `inspector` 负责 `objective_down`

#### 映射规则

- `watchdog` 发现：
  - watchdog 自身 heartbeat 停止
  - phase / llm 不匹配
  - dispatch gap
  - session timeout
  - pane / story 状态不一致
  - 都只写 alert，不直接做 failover

- `inspector` 收到 `WATCHDOG ALERT` 后：
  - 读取 `watchdog-alerts.yaml`
  - 读取 `gate-state.yaml`
  - 读取 `session-journal.yaml`
  - 复核 pane 实际状态
  - 输出：
    - `FALSE POSITIVE`
    - `VIOLATION CONFIRMED`
    - `RESTART APPROVED AT NEXT GATE`

## 核心状态文件

### 1. gate-state.yaml

在现有基础上新增以下字段：

```yaml
session_generation: 3
failover_epoch: 2
watchdog:
  pid: 12345
  status: alive
  started_at: '2026-03-21T12:00:00Z'
  last_heartbeat: '2026-03-21T12:03:00Z'
  unhealthy_count: 0
  restart_count: 1
```

#### 语义

- `session_generation`
  - 当前 commander 写状态的代数
  - 每次 SESSION-RESTART 成功后递增
- `failover_epoch`
  - 每次批准正式 failover 时递增
- `watchdog.*`
  - 当前 watchdog 的外部可验证状态

### 2. session-journal.yaml

保留现有结构，新增两类 entry：

```yaml
- seq: 99
  timestamp: '...'
  type: correction
  trigger: self
  description: 'watchdog missing, restarted automatically'
  violated_rule: 'watchdog_liveness'
  correct_action: 'restart watchdog and re-verify heartbeat'
  step: 'step-04'

- seq: 100
  timestamp: '...'
  type: failover
  trigger: inspector
  description: 'SESSION-RESTART approved after watchdog timeout'
  generation_from: 3
  generation_to: 4
```

### 3. watchdog-heartbeat.yaml

新增文件：`_bmad-output/implementation-artifacts/watchdog-heartbeat.yaml`

```yaml
pid: 12345
session_name: '0'
commander_pane: '%0'
inspector_pane: '%6'
session_generation: 3
last_check: '2026-03-21T12:03:00Z'
sentinel_written: false
alerts_count: 0
```

### 4. watchdog.pid

新增文件：`_bmad-output/implementation-artifacts/watchdog.pid`

```text
12345
```

## 健康检查分层方案

### 第一层：初始化启动校验

位置：`workflow.md` 中 watchdog 启动之后。

#### 新规则

启动命令执行后：

1. 等待 1-2 秒
2. 校验 `watchdog.pid` 已创建
3. 校验 `watchdog-heartbeat.yaml` 已创建
4. 校验 heartbeat 中的：
   - `session_name`
   - `commander_pane`
   - `inspector_pane`
   - `session_generation`
5. 校验进程存在：`ps` / `pgrep`

#### 失败策略

- 第一次失败：自动重试一次
- 第二次失败：HALT，不进入 Step 2

### 第二层：批准备 / 长任务阶段校验

位置：

- `step-02-batch-prep.md`
- `step-06-auto-qa-uat.md`
- `step-08-regression.md`

#### 触发点

- 每个子阶段切换前
- 每次大批量 dispatch 前
- 每次大批量结果汇总前

#### 检查内容

1. watchdog 进程仍存在
2. `watchdog-heartbeat.yaml.last_check` 不超过 `2 * CHECK_INTERVAL`
3. heartbeat 的 `session_generation` 等于 `gate-state.session_generation`

#### 失败策略

- 若首次失败：
  - 自动重启 watchdog
  - 写 `correction` entry
  - 通知 inspector
- 若 10 分钟内再次失败：
  - L2 暂停，等待用户确认

### 第三层：Step 4 持续健康检查

位置：`step-04-monitoring.md`

建议新增一节，紧跟 `Inspector health check`：

```markdown
4. **Watchdog health check**
   - verify watchdog process alive
   - verify heartbeat freshness
   - verify watchdog generation == gate-state generation
   - if unhealthy: auto-restart once + write correction
   - if repeated unhealthy: HALT
```

#### 频率

- 每轮 poll 执行轻量检查
- 每 3 轮执行一次完整检查

## Failover 设计

### 触发路径

1. `watchdog` 发现异常，写入 `watchdog-alerts.yaml`
2. `inspector` 复核，确认是否为客观故障
3. 若确认需要 failover：
   - 不立即重启
   - 写入 `restart-eligible.yaml`
4. 在下一个 inspector gate（G5 / G10）执行 SESSION-RESTART

### SESSION-RESTART 改造

在现有协议基础上增加 generation fencing。

#### 新顺序

1. inspector 确认 gate PASS
2. `gate-state.failover_epoch += 1`
3. `gate-state.session_generation += 1`
4. 写 gate PASS
5. 写 `failover` journal entry
6. 删除 `restart-eligible.yaml`
7. 退出旧 commander
8. 启动新 commander
9. 新 commander 以新 generation 恢复

## Fencing 机制

### 问题

如果旧 commander 未完全退出，新 commander 已启动，则二者可能同时写：

- `gate-state.yaml`
- `session-journal.yaml`

### 方案

所有通过 utility pane 的状态写入动作，统一附带 `session_generation` 预期值。

#### 写入前校验

每次写状态前：

1. 读取 `gate-state.yaml.session_generation`
2. 与当前 commander 内存 generation 比较
3. 若不一致：
   - 拒绝写入
   - 输出 `STALE COMMANDER`
   - 立即 HALT

这相当于 Sentinel 风格的 fencing token。

## 对 watchdog.sh 的改造

### 当前问题

1. 无 pid / heartbeat 文件
2. `validating` 与主状态机不一致
3. 对 Step 2 的感知不足

### 建议改造

#### 新增启动时写入

```bash
echo "$$" > "$WATCHDOG_PID_FILE"
cat > "$HEARTBEAT_FILE" <<EOF
pid: $$
session_name: "$SESSION_NAME"
commander_pane: "$COMMANDER_PANE"
inspector_pane: "$INSPECTOR_PANE"
session_generation: "$SESSION_GENERATION"
last_check: "$ts"
sentinel_written: false
alerts_count: 0
EOF
```

#### 每轮循环更新 heartbeat

```bash
last_check: "{now}"
sentinel_written: {true|false}
alerts_count: {count}
```

#### phase 规则修正

移除 `validating`，改为两类：

- batch validation 阶段不靠 `story_states.phase` 判定
- story review / fixing / qa / merge / regression 仍靠 `story_states`

也就是说：

- Step 2 的 validation 应通过 `session-journal` 最近 `dispatch_audit.phase == validate`
- Step 4 之后的 runtime 状态才通过 `story_states.phase`

## 对 inspector 的改造

### 当前职责保留

- gate 审查
- 行为监察
- 定期审计

### 增加 watchdog 客观确认逻辑

当收到 `WATCHDOG ALERT`：

1. 判断是：
   - `watchdog missing`
   - `heartbeat stale`
   - `dispatch gap`
   - `llm mismatch`
2. 结合：
   - `watchdog-heartbeat.yaml`
   - `gate-state.yaml`
   - `session-journal.yaml`
   - tmux pane 几何 / 存活状态
3. 给出：
   - `FALSE POSITIVE`
   - `VIOLATION CONFIRMED`
   - `FAILOVER RECOMMENDED`

## 实施顺序

### Phase 1

1. 给 watchdog 增加 pid / heartbeat 文件
2. 在初始化后加启动校验
3. 在 Step 04 增加 watchdog health check

### Phase 2

4. 在 Step 02 / 06 / 08 增加轻量 liveness check
5. 修复 `watchdog.sh` 中 phase 规则
6. 增加 `restart_count` / `unhealthy_count`

### Phase 3

7. 增加 `session_generation`
8. 增加 `failover_epoch`
9. 对所有状态写入增加 generation fencing

## 验收标准

### 启动链路

- watchdog 未成功启动时，master-control 不进入 Step 2
- watchdog 成功启动后，heartbeat 文件在 2 秒内出现

### 运行时链路

- watchdog 被 kill 后，Step 02 / 04 / 06 / 08 能在一个检查周期内发现
- 首次丢失会自动重启并记录 correction
- 多次丢失会升级到 L2 / HALT

### Failover 链路

- session 超时后生成 `restart-eligible.yaml`
- 在 G5 / G10 审查通过时，inspector 能执行 SESSION-RESTART
- restart 后新 commander 能从正确 step 恢复
- 旧 commander 再尝试写状态时会被 generation fencing 拒绝

## 不做的事

本设计明确不做：

1. 多节点 quorum
2. leader election
3. 跨机器 failover
4. 分布式网络分区处理

因为当前系统是单机 tmux orchestration，不是 Redis 集群。

## 结论

Redis Sentinel 对本系统最有参考价值的不是“选主”，而是：

- 主观异常与客观确认分离
- failover 延迟到安全边界
- 先持久化状态再切换
- 用 epoch / generation 做 fencing

按本设计改造后，`watchdog` 不再是“可能存在的后台脚本”，而会成为一个可验证、可恢复、可审计的系统组件。
