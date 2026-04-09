# UX Spec: Story 8.2 — 导出前预览

## Overview

This story adds a near-full-screen preview modal that renders the proposal's final docx output before exporting, giving users confidence that formatting is correct. The preview is triggered from the ProjectWorkspace toolbar or via Cmd/Ctrl+E, rendered asynchronously through task-queue, and supports zoom controls, a conditional page indicator when page metadata is available, and one-click confirmed export.

## Screen Inventory

| # | Screen Name | Description | Viewport |
|---|-------------|-------------|----------|
| 1 | 预览加载态 (Preview Loading) | ProjectWorkspace with loading overlay showing progress | 1440×900 |
| 2 | 预览完成态 (Preview Ready) | Full preview modal with docx rendering, zoom toolbar, action bar | 1440×900 |
| 3 | 渲染错误态 (Render Error) | Preview modal with error alert and retry button | 1440×900 |
| 4 | 导出成功 (Export Confirmed) | Workspace with success toast after export | 1440×900 |

## Screen 1: Preview Loading

### Layout
- ProjectWorkspace in background (dimmed by modal mask)
- Centered loading overlay:
  - Modal mask: rgba(0,0,0,0.45)
  - Loading card: 400px wide, white bg, centered, border-radius 8px, shadow
  - Ant Design Spin indicator (large, primary blue)
  - Text: "正在生成预览..." (14px, #595959)
  - Progress bar: Ant Progress component, indeterminate or percentage if available
  - Subtext: "方案渲染中，您可以继续编辑" (12px, #BFBFBF)
  - Cancel link: "取消" (12px, #1677FF)

### Interaction
- Loading does not block editor — user can continue editing
- If user switches away, Toast notification on completion
- Cancel stops the task-queue job and best-effort cleans up any generated `.preview-*.docx` temp file

## Screen 2: Preview Ready (Main Preview Modal)

### Layout — Modal Container
- Ant Design Modal: width 95vw, top: 20px, near full-screen
- Background: white, border-radius 8px
- Modal mask: rgba(0,0,0,0.45)

### Layout — Top Toolbar (PreviewToolbar)
- Height: 48px, bg #FFFFFF, border-bottom 1px #E8E8E8
- Left: "方案预览" title (16px, semibold, #1F1F1F) + document name tag
- Center: Page indicator area (13px, #595959)
  - When page metadata is available: show "第 3 / 42 页"
  - When page metadata is unavailable: hide the page indicator entirely rather than rendering an inaccurate counter
- Right: Zoom controls
  - Zoom out button (minus icon)
  - Zoom level display "100%" (13px, #1F1F1F)
  - Zoom in button (plus icon)
  - "适合页面" button (text button, #1677FF)
  - Zoom presets dropdown: 50%, 75%, 100%, 125%, 150%, 200%

### Layout — Preview Body
- Scrollable container, bg #F0F0F0 (paper-on-gray background)
- Rendered docx content centered, max-width based on zoom level
- Paper-like appearance: white bg, shadow, A4 proportions
- Content rendered by docx-preview library into this container
- Smooth scroll for long documents

### Layout — Bottom Action Bar
- Height: 56px, bg #FFFFFF, border-top 1px #E8E8E8
- Left: Render info — "渲染耗时: 12.3秒" (12px, #8C8C8C)
  - If page count metadata is available, append "| 预计 42 页"
- Right:
  - "返回编辑" button (default, icon: arrow-left) — closes modal
  - "确认导出" button (primary, icon: download) — triggers file save dialog

### Interaction
- Escape → close modal, return to editor
- Scroll → smooth navigation through document
- Zoom buttons → CSS transform scale
- "确认导出" → reuses temp docx, opens system file save dialog
- Save dialog cancel → keeps the preview modal open with no success toast
- "返回编辑" → closes modal, editor state fully preserved

## Screen 3: Render Error

### Layout
- Same modal container as Screen 2
- Top toolbar: title only, zoom controls hidden
- Body: Centered error display
  - Ant Design Alert type="error", icon, full width within centered card
  - Title: "渲染引擎未就绪" (16px, semibold)
  - Description: "预览渲染失败，请稍后重试。错误详情: [error message]" (13px)
  - Below alert: "重试" button (primary) + "返回编辑" button (default)
- Bottom action bar: "返回编辑" only

### Interaction
- "重试" → re-triggers preview rendering
- "返回编辑" → closes modal
- Escape → closes modal

## Screen 4: Export Confirmed

### Layout
- ProjectWorkspace in normal state (modal closed)
- Top-right Toast notification (Ant Design message.success):
  - Green check icon + "方案已导出到 /Users/.../某市智慧交通项目-方案.docx"
  - Auto-dismiss after 5 seconds
- Editor state fully restored

## Design Tokens (inherited from Story 1.4)

| Token | Value | Usage |
|-------|-------|-------|
| spacing-sm | 8px | Toolbar internal padding |
| spacing-md | 16px | Section gaps |
| spacing-lg | 24px | Modal body padding |
| spacing-xl | 32px | Paper margins |
| font-sm | 12px | Metadata, hints |
| font-base | 14px | Body text |
| font-lg | 16px | Toolbar title |
| radius-md | 6px | Buttons |
| radius-lg | 8px | Modal, cards |
| color-primary | #1677FF | Primary buttons, active states |
| color-error | #FF4D4F | Error alert |
| color-success | #52C41A | Success toast |
| color-bg-paper | #F0F0F0 | Preview body background (paper-on-gray) |
| color-bg-white | #FFFFFF | Paper, toolbar, action bar |

## Accessibility

- Modal: focus trap, Escape to close, Tab order through toolbar and action buttons
- Cmd/Ctrl+E: keyboard shortcut for power users, documented in tooltip
- Zoom: keyboard accessible (+/- buttons)
- Screen reader: Modal announces "方案预览", progress announces "正在生成预览"
- High contrast: Paper shadow distinguishes content from gray background

## Acceptance Criteria Mapping

| AC | Screen | UI Element |
|----|--------|------------|
| #1 | Screen 1→2 | Preview button/Cmd+E triggers loading → modal opens with docx |
| #2 | Screen 1 | Loading overlay with progress, non-blocking |
| #3 | Screen 2 | Full preview modal with zoom, conditional page indicator |
| #4 | Screen 2→4 | "返回编辑" closes modal, editor restored |
| #5 | Screen 2→4 | "确认导出" reuses docx, file save dialog, success toast |
| #6 | Screen 3 | Error alert with retry |
| #7 | Screen 2 | Smooth scrolling, render time display |
| #8 | Screen 2/3 | Escape closes modal |
