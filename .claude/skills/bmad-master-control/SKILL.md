---
name: bmad-master-control
description: '并行开发指挥官 — 自动编排多 Story 完整生命周期（Create → Prototype → Validate → Dev → Code Review → UAT → Merge → Regression → Cleanup），通过 tmux 子窗格派发所有工作。Use when the user says "start master control", "启动指挥官", or "run parallel dev"'
disable-model-invocation: true
allowed-tools: Bash(tmux *), Bash(./scripts/worktree.sh *), Bash(.claude/skills/bmad-master-control/tmux-layout.sh *), Bash(.claude/skills/bmad-master-control/watchdog-control.sh *), Bash(.claude/skills/bmad-master-control/state-control.sh *), Read, Glob, Grep
---

Follow the instructions in ./workflow.md.
