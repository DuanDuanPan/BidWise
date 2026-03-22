---
name: bmad-master-control
description: '并行开发指挥官 v2 — 事件驱动架构，自动编排多 Story 完整生命周期（Create → Prototype → Validate → Dev → Code Review → UAT → Merge → Regression → Cleanup）。所有决策通过 command-gateway 发出，转换引擎原子执行。Use when the user says "start master control", "启动指挥官", or "run parallel dev"'
disable-model-invocation: true
allowed-tools: Bash(.claude/skills/bmad-master-control/command-gateway.sh *), Bash(.claude/skills/bmad-master-control/event-bus.sh peek *), Bash(.claude/skills/bmad-master-control/event-bus.sh ack *), Bash(.claude/skills/bmad-master-control/context-assembler.sh build *), Bash(./scripts/worktree.sh list *), Bash(./scripts/worktree.sh status *), Read, Glob, Grep
---

Follow the instructions in ./workflow.md.
