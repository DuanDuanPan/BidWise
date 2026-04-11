# UX Specification: Story 5-2 — Asset Recommendation & One-Click Import

## Overview

This specification defines the UX for context-driven asset recommendation in the editor sidebar and one-click import of selected text into the asset library. The design builds on the BidWise design system established in Story 1.4 and the asset infrastructure from Story 5.1.

## Target Pages & Components

| Component | Location | Purpose |
|-----------|----------|---------|
| RecommendationPanel | Right sidebar, below annotation panel | Display context-matched asset recommendations |
| RecommendationCard | Inside RecommendationPanel | Individual recommendation with actions |
| RecommendationDetailDrawer | Drawer from right edge | Full asset detail view with insert action |
| AssetImportDialog | Modal overlay | Save selected editor text to asset library |
| Toolbar Import Button | Editor toolbar | Trigger one-click import flow |

## Screen 1: Editor Workspace with Recommendation Panel

### Layout

- Full editor workspace (1440 x 900 viewport)
- Left: Document outline sidebar (240px)
- Center: Plate editor area (flexible width)
- Right: Sidebar panel (320px) containing:
  - Annotation section (existing, collapsed)
  - **Recommendation section (new, expanded)**
  - Outer shell keeps the existing annotation rail geometry/modes (`320px` expanded, compact flyout behavior unchanged)

### Recommendation Panel Specification

| Property | Value |
|----------|-------|
| Section title | "资产推荐" with count badge |
| Collapsible | Yes, default expanded |
| Max recommendations | 8 cards |
| Card border color | `#52C41A` (asset recommendation green) |
| Card background | `#f6ffed` (light green) |
| Empty state | Centered text: "当前章节暂无推荐资产" |
| Loading state | Lightweight Spin indicator |

### Recommendation Card Specification

| Element | Style |
|---------|-------|
| Title | Single-line truncation, 14px semibold, `#1F1F1F` |
| Summary | 2-line truncation, 13px regular, `#595959` |
| Match score | Percentage badge, `#52C41A` text |
| Tags | Ant Design Tag components, max 3 visible + overflow |
| Action: Insert | Primary button (green), left-aligned |
| Action: Ignore | Text button, `#8C8C8C` |
| Action: View Detail | Text button, `#1890FF` |
| Accepted state | Grey background `#F5F5F5`, "已插入" badge top-left, actions hidden |

### Interaction Mechanics

1. **Section switch**: Editor heading change -> clear recommendations -> show Spin -> load new recommendations
2. **Debounce**: Content editing pauses 2s -> refresh recommendations
3. **Insert**: Click [插入] -> content inserted at cursor -> card shows "已插入" state
4. **Ignore**: Click [忽略] -> card removed from list with fade-out
5. **View detail**: Click [查看详情] -> open RecommendationDetailDrawer
6. **Session continuity**: Within the same section session, ignored cards stay hidden and inserted cards stay in accepted state across subsequent refreshes

## Screen 2: One-Click Import Dialog (AssetImportDialog)

### Trigger

- Editor toolbar button "一键入库" (ImportOutlined icon)
- Enabled only when text is selected inside the editor content surface
- Tooltip: "将选中片段保存到资产库"

### Modal Specification

| Property | Value |
|----------|-------|
| Title | "一键入库" |
| Width | 520px |
| Mask closable | Yes |

### Form Fields

| Field | Component | Default Value | Required |
|-------|-----------|--------------|----------|
| 标题 | Input | Section title or first 50 chars of selection (no newlines) | Yes |
| 内容预览 | Input.TextArea (6 rows) | Selected text | Yes |
| 资产类型 | Select | `text` | Yes |
| 标签 | TagEditor (reuse from 5.1) | Empty | No |

Hidden fields: `sourceProject` (auto from projectStore), `sourceSection` (auto from current heading)

### Asset Type Options

| Value | Label |
|-------|-------|
| text | 文字片段 |
| diagram | 架构图 |
| table | 表格 |
| case | 案例 |

### Actions

- Primary: "入库" (validate then submit)
- Secondary: "取消" (close dialog)
- Success: `message.success('资产已入库')` toast + close

## Screen 3: Recommendation Detail Drawer

### Drawer Specification

| Property | Value |
|----------|-------|
| Placement | Right |
| Width | 480px |
| Title | Asset title |

### Content Layout (top to bottom)

1. **Header**: Asset title (20px semibold) + asset type tag
2. **Metadata**: Source project, source section (if available)
3. **Tags**: Full tag list with Ant Design Tag components
4. **Content**: Full body text, rendered as markdown-like blocks
5. **Actions bar** (bottom-fixed):
   - Primary: "插入到编辑器" (green button)
   - Secondary: "关闭"

## Visual & Layout Constraints

- All colors from BidWise design system (Story 1.4)
- Recommendation green: `#52C41A` border, `#f6ffed` background
- Font: PingFang SC for Chinese content, Inter for labels/numbers
- 8px spacing grid (xs=4, sm=8, md=16, lg=24, xl=32)
- Card corner radius: 8px
- Modal corner radius: 12px
- Drawer has no corner radius (edge-attached)

## Acceptance Criteria Mapping

| AC | Screen | Key Visual Element |
|----|--------|--------------------|
| AC1 | Screen 1 | Green recommendation cards in sidebar |
| AC2 | Screen 2 | Import dialog with pre-filled form |
| AC3 | Screen 1 | "已插入" state on card after insert |
| AC4 | Screen 1 | Card removal on ignore |
| AC5 | Screen 1 | Loading spinner during section switch |
| AC6 | Screen 1 | Non-blocking spinner, debounce indicator |

## Prototype Screens

1. `Screen 1 — 编辑器 + 资产推荐面板`: Editor workspace with recommendation panel showing 3 sample cards (normal, accepted, loading states)
2. `Screen 2 — 一键入库对话框`: Modal overlay with pre-filled import form
3. `Screen 3 — 推荐资产详情 Drawer`: Right drawer with full asset detail and insert action
