# UX Spec: Story 4.4 — 待决策标记与跨角色批注通知

## Overview

This story adds three interconnected UI surfaces to the annotation system:
1. **AssigneePickerModal** — triggered by Alt+D or `"请求指导"`, lets users mark an annotation as `needs-decision` and assign a mentor
2. **AnnotationThread** — threaded reply UI beneath annotation cards, supporting human and AI replies
3. **NotificationBell + NotificationPanel** — global notification indicator with popover panel for decision-requested, reply, and cross-role alerts

## Screen Inventory

| # | Screen Name | Description | Viewport |
|---|-------------|-------------|----------|
| 1 | 指导人选择弹窗 (AssigneePickerModal) | Modal overlay with user selector, optional note, confirm/cancel | 1440×900 |
| 2 | 批注回复线程 (AnnotationThread) | Threaded replies below annotation card, including AI iteration reply | 1440×900 |
| 3 | 通知铃铛与面板 (NotificationBell + Panel) | Bell icon with badge in title bar, popover with notification list | 1440×900 |
| 4 | 通知空状态 (Empty Notification) | Empty state when no notifications exist | 1440×900 |

## Screen 1: AssigneePickerModal

### Layout

- Ant Design Modal, width 480px, centered overlay
- Title: `"请求指导 — 选择指导人"`
- Body:
  - **Current annotation preview**: compact card showing type icon + first 50 chars, background tinted by annotation color
  - **User selector**: input-capable Select, full width, placeholder `"选择或输入指导人"`
    - options come from renderer-local `userStore.knownUsers`
    - items show avatar placeholder + display name + role label
    - custom names are normalized into stable identities using `user:custom:<slug>` and reused on later matches
  - **Optional note**: TextArea, 3 rows, placeholder `"给指导人的补充说明（可选）"`
- Footer: Cancel + Confirm (primary, disabled until a user is selected)

### Interaction

- Alt+D on a focused pending root annotation → opens modal
- `"请求指导"` or `"标记待决策"` action intercepted from AnnotationCard → opens modal
- Confirm:
  - updates root annotation to `status='needs-decision'`
  - stores `assignee`
  - optionally creates one human child reply carrying the note
- Optional note creation **does not** trigger AI feedback iteration, even if the parent annotation is AI-originated
- Cancel / Esc → closes without changes

### Visual

- Modal mask: `rgba(0,0,0,0.45)`
- Preview card left border: 3px solid annotation type color
- Confirm button: brand blue `#1677FF`
- Section spacing: 16px

## Screen 2: AnnotationThread

### Layout

- Renders below the parent AnnotationCard when expanded
- Thread container: left-indent 16px from parent card edge, border-left 2px solid `#F0F0F0`
- Each reply card:
  - compact AnnotationCard variant
  - avatar placeholder + display name + relative time
  - content body
  - AI iteration replies use purple accent `#722ED1` with `"AI 迭代回复"` tag
- Reply input area:
  - TextArea 2 rows, placeholder `"回复此批注..."`
  - Send button on the right
- Parent card exposes `"N 条回复"` as expand/collapse link

### Interaction

- Click `"N 条回复"` → lazy-load replies via `annotation:list-replies`
- Human replies are appended in chronological order
- 4.4 Alpha keeps a **single visible thread under the root annotation**; reply composer submits against the root annotation id
- Data model may still support deeper reply nesting later, but this story does not expose a reply-to-reply UI
- Explicit thread reply on `ai-suggestion | adversarial | score-warning` parents triggers async AI feedback iteration
- AI feedback uses the same **task progress + completion reveal** pattern as Story 4.3 Ask System, not provider token streaming
- `reply-received` notification navigation auto-expands the matching parent thread

### Visual

- Thread background: `#FAFAFA`
- Reply cards: white background, radius 6px, subtle shadow
- Collapse animation: 200ms ease-in-out

## Screen 3: NotificationBell + Panel

### Layout — Bell

- Position: `ProjectWorkspace` title bar, before the settings icon
- Icon: `BellOutlined`, 20px
- Badge: unread count; counts above 9 display `9+`
- Visible across workspace stages; not tied to AnnotationPanel visibility

### Layout — Panel

- Ant Design Popover, `bottomRight`, width 360px, max-height 480px
- Header: `"通知"` + `"全部已读"`
- Body: vertical list of notification items
  - Left: type icon in a circular tinted background
  - Center: project name + summary + relative time
  - Right: unread dot for unread items
- Unread background: `#F6FFED`
- Hover state: `#F5F5F5`
- The visible list prioritizes **project name + summary + time**
- `sectionId` is retained in the notification payload and surfaced through navigation / ARIA text instead of occupying a dedicated visual row in the list

### Interaction

- Click notification:
  - mark read
  - navigate to target project
  - switch to `proposal-writing` if needed
  - expand AnnotationPanel
  - focus the target root annotation by id
  - expand thread when notification type is `reply-received`
- `"全部已读"` clears unread markers and badge
- Real-time new notifications arrive via `notification:new`

## Screen 4: Empty Notification

### Layout

- Same Popover container as Screen 3
- Center aligned:
  - `BellOutlined` / `bell-off` visual, 48px, `#D9D9D9`
  - `"暂无通知"` text, 14px, `#BFBFBF`
- No `"全部已读"` action when the list is empty

## Design Tokens (inherited from Story 1.4)

| Token | Value | Usage |
|-------|-------|-------|
| spacing-xs | 4px | Badge internal |
| spacing-sm | 8px | Compact card padding |
| spacing-md | 16px | Section gaps, thread indent |
| spacing-lg | 24px | Modal padding |
| font-sm | 12px | Metadata, timestamps |
| font-base | 14px | Body text |
| font-lg | 16px | Modal title |
| radius-sm | 4px | Notification items |
| radius-md | 6px | Reply cards |
| radius-lg | 8px | Modal / Popover |
| color-primary | #1677FF | Confirm buttons, active states |
| color-warning | #FAAD14 | Decision-requested icon |
| color-success | #52C41A | Cross-role icon |
| color-purple | #722ED1 | AI reply accent |
| color-bg-light | #FAFAFA | Thread background |
| color-border | #F0F0F0 | Thread border |
| color-unread-bg | #F6FFED | Unread notification item |

## Accessibility

- Modal: focus trap, Esc to close, predictable tab order
- Notification list: keyboard navigable, Enter to open item
- Badge announces unread count
- Notification item ARIA label should include project name + derived section label when available + summary
- Reply thread announces `"批注回复线程, [N] 条回复"`

## Acceptance Criteria Mapping

| AC | Screen | UI Element |
|----|--------|------------|
| #1 | Screen 1 | Confirm guidance request → status + assignee + card label |
| #2 | Screen 3 | Notification record shown as project name + summary + time |
| #3 | Screen 1 + 3 | Modal confirm creates decision-requested notification |
| #4 | Screen 3 + 4 | Bell/Panel list, read state, click-to-navigate |
| #5 | Screen 2 | Threaded replies under parent annotation |
| #6 | Screen 2 | AI iteration reply appears in thread with progressive reveal |
| #7 | Screen 3 | Real-time unread badge updates |
| #8 | Screen 1 | Alt+D opens guidance modal instead of direct status write |
