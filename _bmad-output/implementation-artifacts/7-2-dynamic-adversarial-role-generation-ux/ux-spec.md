# UX Specification: Story 7-2 — Dynamic Adversarial Role Generation

## Overview

This specification defines the UX for stage-5 adversarial lineup generation, editing, confirmation, and fallback recovery. The feature is intentionally layered on top of the existing `ProjectWorkspace` instead of introducing a new full-page review center. Generation is asynchronous: the renderer opens a right-side Drawer, shows task progress from `task:progress`, and transitions into generated / confirmed / error states based on the outer task result.

## Entry Points

| Entry | Behavior |
|------|----------|
| Enter `compliance-review` stage with no saved lineup | Auto-open Drawer and start generation |
| Enter `compliance-review` stage with existing lineup | Load lineup; CTA opens existing Drawer |
| Command palette: `启动对抗评审` | Only available as a workspace override; opens Drawer and generates when lineup is empty |
| Stage 5 guide CTA | Label changes with state: `生成对抗阵容` or `打开对抗阵容` |

## Target Components

| Component | Location | Purpose |
|-----------|----------|---------|
| AdversarialLineupDrawer | Right-side Drawer (480px) | View/manage adversarial role lineup |
| AdversarialRoleCard | Drawer body | Role details, edit/delete affordance |
| AddRoleModal | Modal overlay | Manual creation of custom adversarial roles |

## Screen 1: Adversarial Lineup Drawer (Generated State)

### Layout

- Drawer from right edge, 480px width, full viewport height
- Background editor / workspace remains visible behind semi-transparent overlay
- Header and footer stay fixed; role list scrolls independently

### Drawer Structure

| Section | Specification |
|---------|--------------|
| Header | Title `对抗角色阵容` + close icon + bottom border `#F0F0F0` |
| Status bar | Role count badge + state hint / fallback hint region |
| Body | Vertical role card list, 12px gap |
| Footer | `确认阵容` (primary) + `重新生成` (default) + `+ 添加角色` (dashed) |

### AdversarialRoleCard

| Element | Style |
|---------|-------|
| Card border | `#FF4D4F` 1px |
| Card background | `#fff2f0` |
| Corner radius | 8px |
| Role name | 14px semibold, `#1F1F1F` |
| Intensity badge | high=`#FF4D4F`, medium=`#FAAD14`, low=`#1677FF` |
| Perspective | 13px regular, `#595959`, 1-line truncation |
| Attack focus | Ant Design `Tag`, red outline style |
| Description | 13px regular, `#8C8C8C`, max 2 lines |
| Edit button | Icon button, neutral gray |
| Delete button | Icon button, red; hidden when `isProtected=true` |
| Protected badge | Lock icon + `合规保底` green tag |

## Screen 2: Add Role Modal

### Modal Specification

| Property | Value |
|----------|-------|
| Title | `添加自定义角色` |
| Width | 480px |
| Corner radius | 12px |

### Form Fields

| Field | Component | Default | Required |
|-------|-----------|---------|----------|
| 角色名称 | Input | Empty | Yes |
| 视角描述 | Input.TextArea (3 rows) | Empty | Yes |
| 攻击焦点 | Tag input (multi-add) | Empty | Yes, min 1 |
| 攻击强度 | Radio.Group | `medium` | Yes |

### Actions

- Primary: `添加`
- Secondary: `取消`
- User-created roles are always non-protected

## Screen 3: Loading / Confirmed / Error Semantics

### Loading State

- Full drawer body replaced by centered Spinner + primary progress text
- Primary text comes from task progress message when available
- Secondary hint can summarize AI work, for example `AI 正在分析招标文件需求与评分标准`
- Header remains visible
- Footer hidden

### Confirmed State

- Same role card list as generated state
- Header shows `已确认` green badge next to title
- Role cards are read-only: no edit button, no delete button, no add-role affordance
- Footer only retains `重新生成`

### Error State

- Used only for hard failures:
  - prerequisites missing (`requirements` / `scoringModel` unavailable)
  - fallback persistence also failed
- Visual treatment:
  - error `Alert`
  - explanatory text
  - single primary retry action `重新生成`

### Fallback Success State

- LLM timeout / provider / parse failures do **not** enter error state
- System shows the normal generated Drawer populated by fallback roles
- Renderer displays warning Toast: `AI 生成失败，已加载默认阵容，您可手动调整`
- Optional non-blocking inline hint may appear in the status bar region, but fallback lineup remains editable

## Interaction Rules

1. Generated lineup is editable until user clicks `确认阵容`.
2. Confirmed lineup is locked. User must click `重新生成` to replace it.
3. Protected compliance role is always present and never deletable.
4. Entering stage 5 with no lineup should feel proactive: Drawer opens automatically instead of waiting for user to discover the feature.
5. Command palette and stage CTA should open the same Drawer flow; there must not be two different generation paths.

## Visual Constraints

- Colors must align with BidWise Story 1.4 system tokens
- Adversarial red: `#FF4D4F` border, `#fff2f0` background
- Protected compliance badge: `#52C41A`
- Typography: PingFang SC for Chinese body copy, Inter for compact labels / numbers
- 8px spacing grid
- Drawer is edge-attached; no outer corner radius

## Acceptance Criteria Mapping

| AC | UX Expression |
|----|---------------|
| AC1 | Drawer loading state with async progress, then generated role list |
| AC2 | Role edit/delete/add interactions, then confirmed read-only state |
| AC3 | Protected compliance role badge and delete-disabled behavior |
| AC4 | Fallback uses generated success UI + warning Toast; hard failures use error state |
| AC5 | Existing lineup reloads on stage entry / project reopen |

## Prototype Alignment Notes

- `Screen 1` remains the canonical visual for the editable generated state.
- `Screen 2` remains the canonical visual for adding a custom role.
- `Screen 3` is the canonical visual for loading and confirmed states, with one correction applied for implementation readiness:
  - confirmed state must not expose `+ 添加角色`; once confirmed, lineup is read-only until explicit regenerate.
