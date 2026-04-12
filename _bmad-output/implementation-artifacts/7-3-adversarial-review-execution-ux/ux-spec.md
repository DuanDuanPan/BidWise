# UX Specification: Story 7-3 — 对抗评审执行与结果展示

## Overview

This specification defines the UX for adversarial review execution, result presentation, finding handling, partial failure recovery, and session persistence/restoration. The feature extends the existing Stage 5 adversarial lineup flow (Story 7-2) by adding execution controls and a right-side review panel for findings display and user decision-making.

Key architectural constraint: **results are rendered in batch after all roles complete** (never streamed one-by-one). The UI transitions from running → completed/partial/failed as a single state change.

## Entry Points

| Entry | Behavior |
|------|----------|
| Lineup Drawer confirmed state | Bottom `启动对抗评审` trigger button |
| Review completed notification | Toast click opens ReviewPanel |
| Stage 5 re-entry with existing review | Auto-loads last review session |

## Target Components

| Component | Location | Purpose |
|-----------|----------|---------|
| ReviewExecutionTrigger | Lineup Drawer footer (confirmed state) | Launch review with Popconfirm |
| AdversarialReviewPanel | Right-side panel (480px), replaces AnnotationPanel during `compliance-review` | Display findings + actions |
| AdversarialFindingCard | ReviewPanel body | Individual finding with 3 actions |
| FailedRoleAlert | ReviewPanel top (partial state) | Failed role warning + retry |

## Screen 1: Review Execution Trigger (in Lineup Drawer)

### Context

When the lineup is confirmed (7-2 confirmed state), the Drawer footer adds a primary execution button.

### Layout

```
+-----------------------------------------------+
| Drawer Header: 对抗角色阵容 [已确认] ✕         |
+-----------------------------------------------+
| [Role cards - read-only confirmed state]       |
|  ...                                           |
+-----------------------------------------------+
| [重新生成]  [启动对抗评审 ▶] (primary)          |
+-----------------------------------------------+
```

### Interaction

1. Click `启动对抗评审` → Popconfirm: `确认对 N 个角色启动方案评审？`
2. Confirm → button becomes disabled+loading: `评审进行中…`
3. Review completes with `completed` / `partial` → button text changes to `查看评审结果` (clickable, opens ReviewPanel)
4. Review ends with `failed` → button returns to enabled primary `重新启动评审`
5. Review running → user can close Drawer and continue editing (non-blocking)

### Popconfirm Specification

| Property | Value |
|----------|-------|
| Title | `确认对 N 个角色启动方案评审？` |
| Description | `评审将对方案进行多角色并行攻击，预计需要 3-5 分钟` |
| OK text | `确认启动` |
| Cancel text | `取消` |

## Screen 2: Adversarial Review Panel — Running State

### Layout

Right-side panel, 480px width. In Story 7.3 it **replaces** the existing AnnotationPanel during `compliance-review`; tab switching is out of scope.

```
+-----------------------------------------------+
| 对抗评审结果                            [✕]    |
+-----------------------------------------------+
| [Progress bar: 35%]                            |
|                                                |
|  ● 技术专家   攻击中… (Spin)                    |
|  ✓ 合规审查官  完成 (green check)               |
|  ● 成本分析师  攻击中… (Spin)                    |
|  ○ 用户体验官  等待中 (gray)                     |
|                                                |
|  AI 正在从多个维度审查您的方案…                   |
+-----------------------------------------------+
```

### Role Status Indicators

| Icon | Meaning | Color |
|------|---------|-------|
| Spin | Attacking | `#1677FF` |
| ✓ | Completed | `#52C41A` |
| ✕ | Failed | `#FF4D4F` |
| ○ | Waiting | `#D9D9D9` |

## Screen 3: Adversarial Review Panel — Completed State

### Layout

```
+-----------------------------------------------+
| 对抗评审结果                            [✕]    |
+-----------------------------------------------+
| 12 条攻击发现 | critical: 3 | major: 5 | minor: 4 |
+-----------------------------------------------+
| [Filter: 严重性 ▾] [角色 ▾] [状态 ▾]          |
+-----------------------------------------------+
|                                                |
| ┌─ FindingCard (critical, pending) ──────────┐ |
| │🔴 [critical] [技术专家]                     │ |
| │ 方案未提供高可用架构设计，存在单点故障风险     │ |
| │ 📍 第3章 系统架构设计                        │ |
| │ 💡 建议补充双活/主备方案和故障转移机制        │ |
| │ ⚡ 矛盾                                     │ |
| │ [接受并修改] [反驳] [请求指导]               │ |
| └────────────────────────────────────────────┘ |
|                                                |
| ┌─ FindingCard (major, accepted) ────────────┐ |
| │🟢 [major] [合规审查官]  ✓ 已接受             │ |
| │ 投标保证金条款缺少明确金额说明 (collapsed)    │ |
| └────────────────────────────────────────────┘ |
|                                                |
| ┌─ FindingCard (minor, rejected) ────────────┐ |
| │⚪ [minor] [成本分析师]  ✗ 已反驳             │ |
| │ 报价表格式建议改用横向排列 (collapsed)        │ |
| └────────────────────────────────────────────┘ |
|                                                |
+-----------------------------------------------+
```

### Statistics Bar

| Element | Specification |
|---------|--------------|
| Total count | `N 条攻击发现` |
| Severity breakdown | `critical: X | major: Y | minor: Z` |
| Background | `#FAFAFA` |
| Typography | 13px Inter medium |

### Empty Completed State

If all successful roles return zero findings, keep the panel in `completed` or `partial` terminal state and show a success empty state instead of an error:
- Title: `本轮对抗评审未发现需要处理的问题`
- Supporting copy: `您可以继续执行合规校验或重新发起一轮评审`
- Statistics remain visible with zero counts

### Filter Bar

Three dropdown filters that compose (AND logic):
- **严重性**: all / critical / major / minor
- **角色**: all / per-role options
- **状态**: all / pending / accepted / rejected / needs-decision

## Screen 4: Adversarial Review Panel — Partial Failure State

### Layout

Same as completed state but with FailedRoleAlert cards at top.

```
+-----------------------------------------------+
| 对抗评审结果                            [✕]    |
+-----------------------------------------------+
| 8 条攻击发现 | critical: 2 | major: 4 | minor: 2 |
+-----------------------------------------------+
| ⚠ 技术专家评审失败：请求超时  [重试]           |
+-----------------------------------------------+
| [Filter row]                                   |
| [Finding cards from successful roles...]       |
+-----------------------------------------------+
```

### FailedRoleAlert Specification

| Element | Style |
|---------|-------|
| Background | `#FFFBE6` |
| Border | 1px solid `#FFE58F` |
| Icon | `triangle-alert` 16px `#FAAD14` |
| Text | 13px `#8B6914`: `{roleName}评审失败：{errorSummary}` |
| Retry button | Ant Design Button size=small, default type |
| Retry loading | Spin replaces button text |

## AdversarialFindingCard Specification

### Finding Status Styles

| Status | Left Border | Background | State Label |
|--------|-------------|------------|-------------|
| pending | `#FF4D4F` 3px | `#FFFFFF` | — |
| accepted | `#52C41A` 3px | `#F6FFED` | `✓ 已接受` green |
| rejected | `#D9D9D9` 3px | `#FAFAFA` | `✗ 已反驳` gray |
| needs-decision | `#722ED1` 3px | `#F9F0FF` | `⏳ 待决策` purple, pulse animation |

### Severity Badges

| Severity | Background | Text |
|----------|------------|------|
| critical | `#FF4D4F` | white, 12px bold |
| major | `#FA8C16` | white, 12px bold |
| minor | `#D9D9D9` | `#595959`, 12px |

### Card Structure (Pending — Expanded)

| Element | Specification |
|---------|--------------|
| Role name tag | Ant Design Tag, neutral style, 12px |
| Severity badge | Pill shape, 12px, status-colored |
| Content | 14px PingFang SC regular, `#1F1F1F`, max 4 lines |
| Section reference | 13px `#1677FF`, clickable only when a stable `sectionLocator` is available; otherwise render as plain text |
| Suggestion | 13px `#595959`, prefixed with 💡 |
| Contradiction tag | ⚡ `矛盾` purple tag, visible when `contradictionGroupId` exists |
| Action row | 3 buttons, 12px gap between |

### Action Buttons

| Action | Label | Type | Result |
|--------|-------|------|--------|
| Accept | `接受并修改` | primary ghost green | status→accepted, card collapses, user navigates to chapter |
| Reject | `反驳` | default | expands TextArea for rebuttal reason |
| Needs Decision | `请求指导` | dashed purple | status→needs-decision, card pulses |

### Rebuttal Input (expanded on Reject click)

| Element | Specification |
|---------|--------------|
| TextArea | 3 rows, placeholder `请输入反驳理由…` |
| Submit | `确认反驳` small primary button |
| Cancel | `取消` small default button |

### Collapsed Card (after action taken)

Shows only: severity badge + role tag + first line of content + status label. Click to expand full details.

## Screen 5: Review Panel — Failed State

```
+-----------------------------------------------+
| 对抗评审结果                            [✕]    |
+-----------------------------------------------+
|                                                |
|  [Shield-X icon, 48px, #FF4D4F]               |
|                                                |
|  对抗评审执行失败                               |
|  所有角色均返回错误，请检查网络连接后重试         |
|                                                |
|  [重新启动评审] (primary)                       |
|                                                |
+-----------------------------------------------+
```

## Interaction Rules

1. Review execution is fully non-blocking — user can continue editing while roles attack.
2. Results appear in batch only after ALL roles complete (or fail). No incremental rendering.
3. Finding cards are sorted by severity (critical > major > minor), then by role sortOrder.
4. Contradiction-tagged findings show a visual ⚡ marker for 7-4 crossfire preparation.
5. Processed findings collapse to reduce visual noise; can re-expand on click.
6. Session persists across project close/reopen — last review auto-restores.
7. Re-executing review replaces old results entirely (upsert semantics).

## Visual Constraints

- Colors align with BidWise Story 1.4 system tokens + story-specific finding palette
- Typography: PingFang SC for Chinese body, Inter for labels/numbers/badges
- 8px spacing grid
- Panel is edge-attached (no outer corner radius), consistent with 7-2 Drawer pattern
- Ant Design component language for buttons, tags, badges, alerts, filters

## Acceptance Criteria Mapping

| AC | UX Expression |
|----|---------------|
| AC1 | ReviewExecutionTrigger in confirmed Drawer + running state with role progress |
| AC2 | Completed panel with sorted findings, statistics, filters, batch rendering |
| AC3 | Three action buttons on FindingCard with status transitions and visual feedback |
| AC4 | FailedRoleAlert cards at panel top + individual retry buttons |
| AC5 | Auto-restore on project reopen, upsert on re-execution |

## Prototype Frames

| Frame | Content | Viewport |
|-------|---------|----------|
| Screen 1 | Review Trigger in confirmed Lineup Drawer | 1440×900 |
| Screen 2 | Review Panel — Completed with findings | 1440×900 |
| Screen 3 | Review Panel — Partial failure + Finding card states | 1440×900 |

Running and failed states are specified in this UX spec but are not exported as standalone prototype frames in the current manifest/PNG set.
