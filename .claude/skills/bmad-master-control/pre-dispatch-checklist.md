# Pre-Dispatch Protocol

**定位：审计 trail 生成器，不是防线。** 每次向 sub-pane 派发任务前，写一条 dispatch_audit entry 到 session-journal。watchdog 和 inspector 通过审计 trail 发现违规。

## 步骤

1. 确认 dispatch 参数（内部决策，不需要打印 checklist）：
   - LLM: claude or codex — 符合 C2?（修复=claude，审查=codex，升级例外 cycle>=2）
   - AUTH: step 标注的 level
   - PANE: 新建 or 复用 — 如 review→fix 转换，必须新 pane（C2 不变量）

2. 通过 utility_pane 写入 dispatch_audit entry：

```yaml
- seq: {next_seq}
  timestamp: "{iso}"
  type: dispatch_audit
  story_id: "{story_id}"
  phase: "{phase}"
  llm: "{claude|codex}"
  auth: "{L0|L1|L2|L3}"
  pane: "{new|reuse}"
  pane_reuse_reason: ""
```

3. 执行 dispatch

**注意：** 如果 session-journal 中存在与当前 story/phase 相关的 correction entry，应在决策时考虑。但不要求每次都物理 Read journal（step 转换时 GUARDS 已经 Read 过）。
