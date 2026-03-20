# Completion Detection

按需查阅。指挥官在 monitoring loop 中需要判断 sub-pane 是否完成时 Read 此文件。

## 三层通讯协议（F9 强制）

子窗格输出读取必须使用分层协议，**禁止** `capture-pane -S -N` 固定行数（F9）：

| 层 | 命令 | 用途 | 何时用 |
|----|------|------|--------|
| **Signal** | `tmux capture-pane -t {pane_id} -p -S -5` | 快速检测 MC_DONE 哨兵 | 每轮 poll |
| **Full** | `tmux capture-pane -t {pane_id} -p -S - -E -` | 完整 scrollback | 需要读结果详情时 |
| **Log** | `cat {mc_log_dir}/pane-{pane_id}.log` | 完整日志（不受 scrollback 限制） | scrollback 不够时 / 审计时 |

**pipe-pane 自动设置：** 每个子窗格创建后立即启用日志：
```bash
tmux pipe-pane -t {pane_id} -o 'cat >> {mc_log_dir}/pane-{pane_id}.log'
```

## 检测信号

使用 Signal 层（`-S -5`）快速检查，需要详情时升级到 Full 或 Log 层：

1. **Claude Code idle:** 提示符 `❯` 出现在末尾，无活跃进度指示
2. **Codex idle:** 显示结果后返回 shell prompt（`$` 或 `%`），或 pane 自动关闭
3. **Pane exited:** Pane 不再存在于 `tmux list-panes -t {current_session}` 输出中（sub-pane 用 `split-window "command"` 启动，退出后 pane 自动关闭）
4. **MC_DONE 哨兵:** 输出中包含 `MC_DONE` + 阶段 + story_id + 结果
5. **HALT:** 输出中包含 "HALT" 文本
6. **Error/crash:** Stack traces, "Error:", "FATAL:", disconnection消息

## 可靠检测技巧

```bash
# 捕获最后 5 行
tmux capture-pane -t {pane_id} -p | tail -5

# Strip ANSI codes
... | sed 's/\x1b\[[0-9;]*m//g'

# 检查 pane 是否还存在 + 当前进程
tmux list-panes -t {current_session} -F '#{pane_id} #{pane_current_command}'
```

## 超时阈值（warn user, DO NOT auto-kill）

| Phase | Timeout | Action |
|-------|---------|--------|
| Create story | 10 min | Warn user |
| Prototype | 15 min | Warn user |
| Validate | 5 min | Warn user |
| Dev | 60 min | Warn user |
| Code review | 15 min | Warn user |
| Automated QA | 20 min | Warn user |
| Regression | 10 min | Warn user |

## API Fault Recovery

| 故障类型 | 检测方式 | 恢复动作 |
|---------|---------|---------|
| Rate limit | "rate limit" / "resets" / usage > 95% | 暂停派发，等限流重置 |
| Content filter | "content filtering" / "blocked" | 关闭 pane，换措辞重发 |
| API timeout | 超 timeout 无输出变化 | Warn 用户，不 auto-kill |
| Codex/Claude 崩溃 | pane 从 list-panes 消失 | 重建 pane + 发送上次指令 |
