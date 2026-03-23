# Master Control 有界自治架构提案

## 背景

`bmad-master-control` 的原始目标不是“让 LLM 按流程执行脚本”，而是让 LLM 作为指挥大脑，在不完全信息下做局部最优决策，同时由机制层保证：

- 流程确定性
- 状态一致性
- 副作用可审计
- 结果可验证

当前系统已经朝这个方向迈出关键一步：`command-gateway.sh`、`event-bus.sh`、`transition-engine.sh`、`runtime-manager.sh` 正在把机制从 LLM 上下文中抽离。

但本次 incident 说明我们还停留在“半微内核”状态：

- 指挥官的意图层与机制层没有完全隔离
- 机制文档暴露了 raw `tmux split-window` affordance
- repair path 和 bootstrap path 还存在语义重叠
- 某些宿主对 `allowed-tools` 的执行不是强安全边界

因此，需要一个比“纯软约束”更强、比“纯状态机”更灵活的中间方案。

## 设计目标

### 核心目标

1. 保留 LLM 的策略价值
2. 把高风险副作用从 LLM 手中剥离
3. 让正确流程由代码保证，而不是靠 prompt 自觉
4. 让结果正确通过证据和验证获得，而不是通过流程替代

### 非目标

1. 不把整个系统改成纯硬编码工作流
2. 不剥夺 LLM 的批次选择、异常解释、恢复策略选择能力
3. 不追求数据库级 ACID

## 第一性原理

### 原理一：LLM 应被视为不可靠但高价值的策略组件

LLM 的优势是：

- 在信息不完全时做启发式决策
- 在冲突目标中做权衡
- 在异常情境中提出恢复路径

LLM 的弱点是：

- 容易被局部 affordance 诱导
- 会把“文档示例”误当成“允许动作”
- 会在长会话中把规则退化成建议

结论：LLM 适合决定“下一步意图”，不适合持有“底层执行权”。

### 原理二：硬约束应该约束副作用，不应该约束思考

应该被硬约束的对象：

- 能力边界
- 状态转换
- 参数合法性
- 执行动作
- 验证与记账

不应该被硬约束的对象：

- batch 推荐策略
- 异常分类解释
- 合法动作之间的排序
- 是否请求人类介入

### 原理三：正确流程与正确结果必须分开设计

正确流程解决的是：

- 有没有越权
- 有没有跳步
- 有没有绕过 gateway
- 有没有破坏状态不变量

正确结果解决的是：

- 代码是否真的通过测试
- gate 证据是否充分
- artifact 是否真实存在
- merge / regression 是否真正成功

流程正确不等于结果正确。后者必须由独立证据验证。

## 最佳平衡点：有界自治

最佳平衡点不是在软约束和硬约束之间取平均，而是：

> 让 LLM 在封闭动作空间内自由决策。

换句话说：

- 思维空间开放
- 动作空间封闭

### 定义

有界自治 = `自由选择意图` + `受限执行机制` + `独立结果验证`

## 架构分层

### L0：真相层

唯一真相源：

- `event-log.yaml`
- `generation.lock`

派生读模型：

- `gate-state.yaml`
- runtime logs

要求：

- 一切恢复都从真相层重建
- 不允许把 LLM 记忆当状态来源

### L1：能力防火墙

指挥官可见动作必须缩减为有限 intent 集合，例如：

- `BATCH select`
- `TRANSITION`
- `DISPATCH`
- `HEALTH`
- `REQUEST_HUMAN`
- `PEEK_EVENTS`
- `ACK_EVENTS`

禁止：

- raw `tmux`
- raw `state-control.sh`
- 直接文件写入
- 直接 git 操作

### L2：策略层

LLM 负责：

- 从 event/state/context 推断当前局势
- 在允许的 intent 中选择下一步
- 给出理由、风险、置信度
- 决定是否升级到 human

LLM 不负责：

- pane 如何创建
- tmux 几何如何修复
- 状态文件如何写入
- 运行时 actor 如何拉起

### L3：命令编译层

`command-gateway.sh` 的职责应被明确为：

1. 解析意图
2. 校验前置条件
3. 校验 generation fencing
4. 执行幂等去重
5. 调度确定性 helper
6. 记录事件与审计

这里是“策略”与“机制”的主边界。

### L4：执行层

确定性 helper 负责：

- layout bootstrap
- worker pane 打开/复用
- runtime actors 启停
- state materialize
- gate 记录
- artifact 落盘与检查

所有 shell/tmux/file/git 细节都应该被封装在这一层。

### L5：验证层

验证层由 inspector、tests、artifact checks、postcondition verifiers 组成。

要求：

- 任何高价值动作都必须有 machine-checkable postconditions
- 无法机器验证的动作必须进入 human gate

## 动作模型：Intent Algebra

建议把 commander 的动作进一步收敛成 typed intent，而不是自然语言命令拼接。

示例：

```json
{
  "intent": "batch.select",
  "stories": ["2-3", "2-5"],
  "reason": "No conflict in file scope; both prerequisites satisfied",
  "risk": "low",
  "confidence": 0.84
}
```

```json
{
  "intent": "health.ensure_runtime",
  "reason": "No events for 3 cycles; monitor may be stale",
  "risk": "medium"
}
```

Gateway 把 typed intent 编译为确定性动作；如果不满足前置条件，返回结构化拒绝，而不是让 LLM 继续 improvisation。

## 风险分层自治

为了兼顾灵活性与安全性，建议把动作分为 3 级：

### A 类：只读动作

例如：

- `PEEK_EVENTS`
- `context-assembler build`
- 读取 sprint-status / architecture / gate-state

策略：

- 高自治
- 几乎无额外约束

### B 类：可逆或幂等动作

例如：

- `HEALTH check_*`
- `HEALTH ensure_runtime`
- `DISPATCH` 打开 worker pane

策略：

- 自动执行
- 必须满足 preconditions
- 必须记录审计

### C 类：不可逆或高爆炸半径动作

例如：

- merge
- gate pass with release implications
- 修改 batch 边界

策略：

- 需要独立 verifier
- 必要时需要 human approval

## 关键设计约束

### 约束一：Bootstrap 与 Repair 必须分离

这是本次 incident 直接暴露的问题。

要求：

- cold start 的 top-layer layout 只能由 `BATCH select` 触发
- `HEALTH ensure_*` 只能修复已有 batch / runtime
- 没有 batch context 时，repair path 必须拒绝，而不是“顺手建起来”

### 约束二：Mechanism 文档不能暴露给 Planner 作为执行清单

`tmux-reference.md` 这类文档可以存在，但必须带有明显的“mechanism-only”标记，且默认不应作为 planner 的执行参考。

指挥官应看到的是：

- 可以做哪些 intent
- 何时允许做
- 做完如何验证

不应看到的是：

- `split-window` 具体怎么拼
- pane title 如何设置
- helper 内部如何落盘

### 约束三：结果验证必须外置

不能依赖 commander 自报完成。必须要求：

- 测试结果
- 文件存在性
- 日志证据
- 独立 reviewer / inspector
- gate postconditions

## 迁移建议

### Phase 1：边界硬化

1. 收紧 `allowed-tools`
2. 把 raw tmux affordance 从 commander 文档中降级为 mechanism-only
3. 封死 cold-start 旁路
4. 为 repair path 增加 batch precondition

### Phase 2：动作结构化

1. 从字符串命令过渡到 typed intent
2. gateway 输出结构化失败原因
3. context-assembler 返回 `available_intents`

### Phase 3：结果验证标准化

1. 为每类 intent 定义 postconditions
2. 将 gate 通过条件结构化
3. 将 verifier 输出纳入 event-log

### Phase 4：风险分层自治

1. A 类动作默认自动执行
2. B 类动作自动执行但需审计
3. C 类动作要求 verifier 或 human gate

## 成功判据

若方案正确，系统应满足：

1. commander 再也不能通过 raw shell 组装基础设施
2. commander 仍能灵活选择 batch、恢复策略、派发顺序
3. runtime 修复与初始化不会混淆
4. 任意异常都能明确归因到：
   - 策略错误
   - 前置条件不足
   - 机制执行失败
   - 结果验证失败
5. 系统可持续运行，而不会因为 prompt 漂移而丢失边界

## 结论

对 `bmad-master-control`，最优解不是“更多 prompt”，也不是“全流程状态机硬编码”。

最优解是：

> 让 LLM 只拥有策略自治，不拥有机制自治。

也就是：

- `LLM decides intent`
- `gateway decides admissibility`
- `helpers decide execution`
- `verifiers decide correctness`

这就是软约束与硬约束之间最稳的平衡点。
