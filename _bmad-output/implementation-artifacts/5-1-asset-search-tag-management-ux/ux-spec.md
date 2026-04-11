# UX Specification: Story 5-1 — Asset Search & Tag Management

## Overview

Full-page asset library module for pre-sales engineers to find reusable text snippets, architecture diagrams, tables, and cases via keyword + `#tag` mixed search, asset-type filtering, and inline tag editing.

## Target Page

`#/asset` — a standalone top-level app route under the existing `HashRouter`, typically opened from the command palette entry `搜索资产库`. This page is **not** a new SOP stage and is **not** embedded into `ProjectWorkspace`.

## Layout Structure

Desktop viewport: 1440 x 900

```
+---------------------------------------------------------------+
|                                                               |
|  [Page Header: "资产库" + description]                        |
|                                                               |
|  [Search Bar: Input.Search with #tag syntax + loading state]  |
|                                                               |
|  [Type Filter Row: 资产类型： 全部 | 文字片段 | 架构图 |      |
|   表格 | 案例 ]                                                |
|                                                               |
|  [Result Count: "找到 N 个资产"]                               |
|                                                               |
|  +--Card--+ +--Card--+ +--Card--+                             |
|  | Title  | | Title  | | Title  |                             |
|  | Summary| | Summary| | Summary|                             |
|  | Tags   | | Tags   | | Tags   |                             |
|  | Score% | | Score% | | Score% |                             |
|  | Source | | Source | | Source |                             |
|  +--------+ +--------+ +--------+                             |
|                                                               |
+---------------------------------------------------------------+
```

Selected card state keeps the same route and swaps the results area into an expanded single-card detail view matching Screen 2.

## Key Interactions

### AC1 — Keyword + Tag Mixed Search

- Search input uses `Input.Search`
- Placeholder: `输入关键词或 #标签 搜索资产...`
- 300ms debounce is implemented in `useAssetSearch`
- Search request shows loading in the search bar only; the page should remain interactive
- `#` and full-width `＃` tokens are parsed as tag filters; remaining text is the keyword query
- Result view shows `找到 N 个资产`
- Example: `微服务 #架构图` = keyword `微服务` + tag filter `架构图`

### AC2 — Asset Type Filter

- Horizontal filter row below the search bar
- Visual order matches the prototype: `全部 | 文字片段 | 架构图 | 表格 | 案例`
- Specific asset types are multi-select
- `全部` is a reset action:
  - when no specific type is selected, `全部` is the active chip
  - clicking `全部` clears all specific type filters
- Active state: blue text + blue border + light blue background
- Inactive state: gray border + white background

### AC3 — Inline Tag Edit

- Each result card is clickable
- Clicking a card opens a same-page expanded detail state, not a modal
- Expanded detail shows:
  - title
  - asset type tag
  - match score
  - source project
  - full body text
  - tag editor section
- Tag editor behavior:
  - existing tags are removable via `×`
  - input adds a tag on Enter
  - helper text: `按 Enter 添加标签，点击 × 删除标签`
- Any new search or filter change clears the current selection and returns to the results state

### AC4 — Empty State

- Centered empty state block
- Title: `未找到匹配资产`
- Description: `尝试：调整关键词 / 减少筛选条件 / 浏览全部资产`
- Icon: muted circular search-empty icon

### AC5 — Performance

- Search response target: < 3s for 2000+ assets
- Renderer shows loading feedback in the search bar while waiting
- No task-queue or blocking overlay is used for this story

## Visual Specifications

### Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | PingFang SC | 24px | 600 | #1F1F1F |
| Page description | PingFang SC | 13px | 400 | #8C8C8C |
| Card title | Inter / PingFang SC fallback | 16px | 600 | #1F1F1F |
| Card summary | Inter / PingFang SC fallback | 12px | 400 | #595959 |
| Tag label | PingFang SC | 12px | 400 | #1677FF |
| Match score | Inter | 12px | 600 | #52C41A |
| Source project | PingFang SC | 12px | 400 | #8C8C8C |
| Filter chip | PingFang SC | 13px | 400 | varies |
| Result count | PingFang SC | 13px | 400 | #8C8C8C |
| Detail body | Inter / PingFang SC fallback | 14px | 400 | #595959 |

### Spacing (8px grid)

| Element | Value |
|---------|-------|
| Page padding | 32px |
| Section gap | 16px |
| Card gap | 16px |
| Card padding | 16px |
| Detail card padding | 24px |
| Tag gap | 8px |
| Filter gap | 8px |
| Search bar height | 40px |

### Colors

| Element | Color |
|---------|-------|
| Page background | #F5F5F5 |
| Card background | #FFFFFF |
| Card border | #F0F0F0 |
| Card selected border | #1677FF |
| Card corner radius | 8px |
| Active filter bg | #E6F4FF |
| Active filter border | #1677FF |
| Active filter text | #1677FF |
| Inactive filter bg | #FFFFFF |
| Inactive filter border | #D9D9D9 |
| Inactive filter text | #595959 |
| Tag bg | #F0F5FF |
| Tag border | #ADC6FF |
| Tag text | #1677FF |
| Search icon | #BFBFBF |
| Empty icon ring | #FAFAFA |
| Empty icon | #D9D9D9 |

## Screens to Prototype

1. **Screen 1 — Search Results**
   - Page header
   - Search bar
   - Type filter row with `全部`
   - Result count
   - 3-card results grid

2. **Screen 2 — Tag Editor Detail**
   - Same route, selected-card detail state
   - Expanded card with blue border
   - Full body text
   - Tag management section

3. **Screen 3 — Empty State**
   - Search bar with unmatched query
   - `全部` active
   - Centered empty feedback

## States

- **Default List**: page just opened, showing recent / all assets through the same route
- **Searching**: loading indicator inside the search bar
- **Results**: card grid displayed with result count
- **Detail**: single expanded detail card replaces the grid while preserving the current route and query context
- **Empty**: no matches, centered empty state
