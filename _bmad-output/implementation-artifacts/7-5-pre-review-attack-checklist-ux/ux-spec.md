# UX Specification: Story 7-5 — Pre-Review Attack Checklist

## Overview

This specification defines the UX for the "先评后写" (Review Before Writing) Attack Checklist — a sidebar panel that shows AI-generated attack vectors against the proposal before writing begins. Engineers use it for defensive writing, addressing weaknesses proactively. The panel lives in the right sidebar of the project workspace, visible during SOP stage 4 (方案撰写) and during stage 5 (评审打磨) whenever the dedicated adversarial review result panel is not occupying the sidebar.

## Target Pages & Components

| Component | Location | Purpose |
|-----------|----------|---------|
| AttackChecklistPanel | Right sidebar / AnnotationPanel shell, collapsible section | Panel container with progress bar, item list, actions |
| AttackChecklistItemCard | Inside panel | Individual attack item with severity, expand/collapse, status |
| Empty State | Inside panel | Guidance when no checklist exists |
| Fallback Warning | Inside panel, top | Alert when AI generation failed |

## Screen 1: Attack Checklist Panel — Active State (Mixed Items)

### Layout Context

- Full workspace viewport (1440 x 900)
- Three-column layout: left outline (240px) + main editor (fill) + right sidebar (320px)
- TopNav (48px) + SOP progress bar (48px) at top
- Attack checklist panel is a collapsible section within the right sidebar

### Panel Header

| Element | Specification |
|---------|---------------|
| Collapse toggle | Chevron icon (right/down), 14px `$text-secondary` |
| Title | "攻击清单", 14px semibold `$text-primary` |
| Badge | "3/8 已防御", Ant Design Badge style, 12px |
| Regenerate button | "重新生成" text link, 12px `$brand` |

### Progress Bar

| Property | Value |
|----------|-------|
| Height | 6px, corner radius 3px |
| Track | `#F0F0F0` |
| Fill color | Red `$danger` (<50%) / Orange `$warning` (50-80%) / Green `$success` (>80%) |
| Label | "已防御 3 / 共 8 条", 12px `$text-secondary`, right-aligned above bar |
| Excluded | Dismissed items not counted |

### Show All Toggle

| Property | Value |
|----------|-------|
| Position | Below progress bar, right-aligned |
| Label | "显示全部", 12px `$text-secondary` |
| Component | Mini Switch, default OFF |
| Behavior | When ON, shows dismissed items in gray |

### Item Card — Unaddressed State

| Element | Specification |
|---------|---------------|
| Left border | 3px, color by severity: `$danger` (critical) / `$warning` (major) / `$info` (minor) |
| Severity badge | Pill shape, 10px uppercase label, bg matches severity color at 10% opacity |
| Category tag | Gray Tag, 11px |
| Target section link | Blue text link with link-2 icon, 11px `$brand` when `targetSectionLocator` is resolved; otherwise render as plain text label |
| Attack angle | 13px `$text-primary`, max 2 lines, ellipsis overflow |
| Actions | "已防御" ghost button (small) + "忽略" text link (small), right-aligned |
| Card background | `$bg-content` |
| Card padding | 12px |
| Card gap | 8px between cards |
| Card corner radius | 8px |
| Card border | 1px `$border` |

### Item Card — Expanded State (on click)

| Element | Specification |
|---------|---------------|
| Full attack angle | 13px `$text-primary`, no truncation |
| Defense suggestion | Highlighted box: 12px `$text-primary`, bg `#F6FFED` (success light), left border 3px `$success`, padding 12px, corner radius 6px |
| Defense label | "防御建议", 11px semibold `$success`, above suggestion text |

### Item Card — Addressed State

| Property | Value |
|----------|-------|
| Left border | 3px `$success` |
| Status label | "已防御" green tag, check-circle icon |
| Text | Strikethrough style, `$text-secondary` |
| Actions | Hidden (no buttons) |
| Background | `$bg-content` |

### Item Card — Dismissed State

| Property | Value |
|----------|-------|
| Visibility | Hidden by default, shown when "显示全部" ON |
| Opacity | 0.5 |
| Status label | "已忽略" gray tag |
| Left border | 3px `#D9D9D9` |
| Actions | Hidden |

## Screen 2: Attack Checklist Panel — Empty State

### Layout

- Same workspace context as Screen 1
- Panel section visible but with empty content area

### Empty State Content

| Element | Specification |
|---------|---------------|
| Icon | `shield-alert`, 40px, `#D9D9D9` |
| Primary text | "尚未生成攻击清单", 14px semibold `$text-primary` |
| Secondary text | "点击下方按钮，让 AI 帮您提前发现方案薄弱点。", 13px `$text-secondary`, max-width 240px, center-aligned |
| CTA button | "生成攻击清单", primary Button with `zap` icon, full-width |
| Spacing | 16px gap between elements |

## Screen 3: Attack Checklist Panel — Fallback Warning State

### Layout

- Same as Screen 1 but with fallback warning and fallback items

### Fallback Warning

| Property | Value |
|----------|-------|
| Component | Ant Design Alert, type "warning" |
| Message | "AI 生成失败，已使用通用攻击清单" |
| Icon | `alert-triangle` 16px `$warning` |
| Background | `#FFFBE6` |
| Border | 1px `#FFE58F` |
| Text | 13px `#8B6914` |
| Closable | No |
| Position | Below progress bar, above item list |

## Visual & Layout Constraints

- All colors from BidWise design system (Story 1.4)
- Severity colors: critical=`$danger` (#FF4D4F), major=`$warning` (#FAAD14), minor=`$info` (#1677FF)
- Text primary: `$text-primary` (#1F1F1F), secondary: `$text-secondary` (#8C8C8C)
- Border: `$border` (#E8E8E8)
- Background: `$bg-global` (#FAFAFA), content: `$bg-content` (#FFFFFF)
- Sidebar width: 320px fixed
- 8px spacing grid
- Card corner radius: 8px
- Font: PingFang SC for Chinese, Inter for labels/numbers

## Interaction Constraints

- Stage 4 host: panel is stacked inside the existing `AnnotationPanel` shell, above `RecommendationPanel`.
- Stage 5 host: when `AdversarialReviewPanel` is closed, the checklist remains in the right sidebar; when the review result panel opens, it temporarily takes over the sidebar and the checklist is not co-rendered.
- Target section links use resolved `targetSectionLocator` values from proposal metadata; unresolved section hints stay as non-clickable text.
- Clicking a target section from stage 5 returns the user to stage 4 (`proposal-writing`) and then scrolls to the resolved heading.

## Acceptance Criteria Mapping

| AC | Screen | Key Visual Element |
|----|--------|--------------------|
| AC1 | Screen 2 + Screen 3 | Generate button + fallback warning |
| AC2 | Screen 1 | Sidebar panel with sorted items, expand detail |
| AC3 | Screen 1 | Addressed/dismissed states on cards |
| AC4 | Screen 1 | Progress bar with color coding |
| AC5 | (Backend) | Not directly visible; data persists across sessions |

## Prototype Screens

1. `Screen 1 — 攻击清单面板（活跃态）`: Right sidebar showing panel with 5 items: 1 critical (expanded with defense suggestion), 2 major (one addressed), 1 minor, 1 dismissed (hidden). Progress bar at ~37% (red).
2. `Screen 2 — 攻击清单面板（空态）`: Right sidebar showing empty state with shield icon and generate button.
3. `Screen 3 — 攻击清单面板（回退警告）`: Right sidebar showing fallback warning alert with generic checklist items.
