# UX Design Spec: Story 2.8 - 需求-方案双向追溯矩阵

**Story:** 2-8-traceability-matrix
**Date:** 2026-04-03
**Status:** Design

---

## 1. Overview

This story adds a bidirectional traceability matrix between tender requirements (Story 2.5) and proposal sections (Story 3.3). The matrix visualizes coverage status using a cross-reference grid with color-coded cells, enables manual link management, supports addendum/change notice import, highlights impacted sections after change intake, and provides a satisfying all-green animation when full compliance is achieved.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** After extracting requirements (2.5), scoring models (2.6), and strategy seeds (2.7), the user needs to verify that every tender requirement is addressed in the proposal
- **Core Need:** Visual confirmation that no requirement is missed; precise impact analysis when addenda arrive
- **Emotional Design Goal:** "一目了然，滴水不漏" — instant clarity, nothing slips through

---

## 2. Information Architecture

```
AnalysisView (existing)
├── Tabs (after extraction completes)
│   ├── Tab 1: "需求清单 (N)" (existing)
│   ├── Tab 2: "评分模型" (existing)
│   ├── Tab 3: "*项检测 (M)" (Story 2.6)
│   ├── Tab 4: "策略种子 (S)" (Story 2.7)
│   └── Tab 5: "追溯矩阵" ← NEW TAB (this story)
│       ├── TraceabilityMatrixView (container)
│       │   ├── Empty State (never generated): CTA "生成追溯矩阵"
│       │   ├── Prerequisite Missing State: "请先完成需求抽取"
│       │   ├── Progress State: Progress bar + stage message
│       │   ├── Error State: Alert + retry
│       │   ├── Result State:
│       │   │   ├── TopActionBar
│       │   │   │   ├── [重新生成] button (secondary)
│       │   │   │   ├── [导入补遗] button (default)
│       │   │   │   └── StatsBadges: "已覆盖 X | 部分覆盖 Y | 未覆盖 Z | 覆盖率 N%"
│       │   │   └── ComplianceCoverageMatrix (cross-reference grid)
│       │   │       ├── Fixed row headers (requirements)
│       │   │       ├── Fixed column headers (proposal sections)
│       │   │       └── Scrollable cell grid with color-coded status
│       │   └── AddendumImportModal (overlay)
│       └── Tab Badge: uncovered count (red) / coverage rate% / all-green ✓
```

---

## 3. Screen States

### State A: Prerequisites Not Met

- **Trigger:** User opens "追溯矩阵" tab, `requirements` is empty
- **Content:** Centered info icon + heading "请先完成需求抽取（步骤 2.5）"
- **Subtext:** "追溯矩阵需要已抽取的招标需求作为输入。"
- **CTA:** None (tab is informational only; guide user back to requirements tab)
- **Tab:** "追溯矩阵" label remains selectable, but uses muted/disabled visual treatment with tooltip so this info state can render

### State B: Matrix Not Yet Generated (Empty State)

- **Trigger:** User opens tab, `requirements` exist but `matrix === null`
- **Content:** Centered grid/matrix illustration + heading "尚未生成追溯矩阵"
- **Subtext:** "追溯矩阵将招标需求与方案章节进行交叉映射，确保每条需求都被覆盖。"
- **CTA:** Primary button "生成追溯矩阵" (blue #1677FF, centered)
- **Secondary note:** "需要方案骨架（步骤 3.3）以获得最佳结果；无骨架时将从 proposal.md 标题解析章节"
- **Badge:** Tab label shows "追溯矩阵" without badge

### State C: Generation In Progress

- **Trigger:** User clicks "生成追溯矩阵" or "重新生成"
- **Content:** Blue Progress bar with percentage + message "正在生成追溯矩阵... X%"
- **Stages:** "加载需求清单..." → "读取方案章节..." → "AI 分析映射关系..." → "构建矩阵..."
- **Tab label:** "追溯矩阵" with spinning indicator
- **Generate button:** Disabled, shows "生成中..."

### State D: Matrix Generated — Primary View

- **Trigger:** Generation completes with results
- **TopActionBar:**
  - Left: "重新生成" (secondary) + "导入补遗" (default)
  - Right: StatsBadges row — `已覆盖 32 | 部分覆盖 5 | 未覆盖 3 | 覆盖率 80%`
    - Covered count: green `#52C41A` background
    - Partial count: orange `#FAAD14` background
    - Uncovered count: red `#FF4D4F` background
    - Coverage rate: bold, color matches dominant status
- **Matrix:** ComplianceCoverageMatrix renders below action bar
- **Tab Badge:** Red badge with uncovered count; or coverage rate percentage

### State E: All Requirements Covered (Full Green)

- **Trigger:** Every requirement effective status is `covered` (`uncoveredCount === 0 && partialCount === 0`)
- **Animation:** Cells flip to green sequentially (200ms per cell, 50ms stagger delay), then brief pulse glow on entire matrix (UX-DR14)
- **StatsBadges:** "全部覆盖 ✓ 覆盖率 100%" in green
- **Tab Badge:** Green CheckCircleOutlined replaces count badge
- **Emotional moment:** Achievement celebration — the matrix "lights up"

### State F: Generation Error

- **Trigger:** AI generation fails or times out
- **Content:** Red Alert with error message + "重试" button
- **Pattern:** Matches existing extraction error UI

### State G: Addendum Import In Progress

- **Trigger:** User submits addendum text via AddendumImportModal
- **Content:** Inline progress indicator below action bar: "正在解析补遗... X%"
- **Matrix:** Remains visible with existing data (not replaced during import)

### State H: Addendum Imported — Impact Highlight

- **Trigger:** Addendum import completes and at least one requirement/section is newly affected
- **Content:** Existing matrix remains in place; newly added rows and impacted columns/cells receive blue highlight ring or pulse
- **Inline message:** "已新增 X 条需求，Y 个章节受影响"
- **Duration:** highlight persists until user manually dismisses message or refreshes matrix

---

## 4. Component Specifications

### 4.1 ComplianceCoverageMatrix

**Framework:** Custom React component with Ant Design Tooltip/Popover, Tailwind CSS

**Layout:**
```
┌──────────┬─────────┬─────────┬─────────┬─────────┬───┐
│          │ 1.公司  │ 2.技术  │ 3.实施  │ 4.售后  │...│
│          │ 概况    │ 方案    │ 计划    │ 服务    │   │
├──────────┼─────────┼─────────┼─────────┼─────────┼───┤
│ R1 系统性 │  ■ 绿   │  □ 灰   │  □ 灰   │  □ 灰   │   │
│ 能需求   │ covered │ n/a     │ n/a     │ n/a     │   │
├──────────┼─────────┼─────────┼─────────┼─────────┼───┤
│ R2 数据库 │  □ 灰   │  ■ 绿   │  ◧ 橙   │  □ 灰   │   │
│ 要求     │ n/a     │ covered │ partial │ n/a     │   │
├──────────┼─────────┼─────────┼─────────┼─────────┼───┤
│ R3 资质  │  ■ 绿   │  □ 灰   │  □ 灰   │  □ 灰   │   │
│ 证书要求 │ covered │ n/a     │ n/a     │ n/a     │   │
├──────────┼─────────┼─────────┼─────────┼─────────┼───┤
│ R4 培训  │  □ 灰   │  □ 灰   │  □ 灰   │  ■ 红   │   │
│ 需求     │ n/a     │ n/a     │ n/a     │uncovered│   │
└──────────┴─────────┴─────────┴─────────┴─────────┴───┘
```

**Dimensions:**
- Fixed left column: 200px, requirement description (truncated with ellipsis)
- Column headers: min 100px each, section title (truncated), Tooltip for full text
- Cell size: 48×36px minimum
- Overall: horizontally and vertically scrollable when matrix exceeds viewport

**Cell Color Mapping (UX-DR14):**
| Status | Background | Border | Icon |
|--------|-----------|--------|------|
| Covered | `#F6FFED` | `#B7EB8F` | CheckCircleFilled `#52C41A` |
| Partial | `#FFFBE6` | `#FFE58F` | ExclamationCircleFilled `#FAAD14` |
| Uncovered | `#FFF1F0` | `#FFA39E` | CloseCircleFilled `#FF4D4F` |
| No link (N/A) | `#FAFAFA` | `#F0F0F0` | — (empty) |

**Cell Click Behavior:**
- **Covered cell:** Popover showing confidence score, source (auto/manual), match reason
- **Partial cell:** Same Popover + "标记为已覆盖" action button + "跳转到章节"
- **Uncovered cell:** Popover with "跳转到章节" (navigate to editor when locator exists) + "创建链接" / "标记为已覆盖"
- **N/A cell:** Click to "创建链接" (manual mapping)
- **Missing locator fallback:** if section locator is unavailable, keep current matrix focus/highlight and show non-blocking notice instead of navigating

**Cell Right-Click Context Menu:**
- "创建链接" (if no link exists)
- "删除链接" (manual link only)
- "修改为已覆盖 / 部分覆盖 / 未覆盖" (if link exists)
- "标记为未覆盖（转为手动映射）" (auto link only)
- "跳转到方案章节" (when locator exists)

**Row Headers:**
- Format: `R{sequence}` prefix + description (truncated to ~20 chars)
- Tooltip: full requirement description
- Uncovered rows: left border 3px `#FF4D4F` (red highlight)

**Column Headers:**
- Format: section number + title (truncated)
- Level 1 sections: bold, `#262626`
- Level 2+ sections: normal weight, `#595959`
- Tooltip: full section title + weight percentage (if available)

**Performance:**
- Alpha 阶段不要求引入新虚拟滚动依赖
- Fixed header row and fixed left column via CSS sticky positioning
- Matrix body uses existing overflow container for horizontal/vertical scrolling
- If the matrix later proves too large, virtualization can be a follow-up optimization rather than a story-level prerequisite

**Impact Highlight:**
- Newly added requirements: row header gets blue left accent
- Impacted sections: column header gets blue top accent
- Impacted cells: subtle blue pulse outline layered above status color

**All-Green Animation (UX-DR14, UX-DR23):**
- Trigger: when stats transition to 100% coverage
- Sequence: cells flip to green one-by-one, left-to-right then top-to-bottom
- Timing: 200ms per cell flip, 50ms stagger between cells
- Effect: brief scale(1.05) + opacity pulse on each cell
- Completion: entire matrix brief green glow border (300ms ease-out)
- Implementation: CSS `@keyframes cellFlipGreen` with `animation-delay` calculated per cell index

**Test IDs:** `coverage-matrix`, `matrix-cell`, `matrix-row-header`, `matrix-col-header`

### 4.2 TraceabilityMatrixView

**Framework:** Ant Design layout components + Tailwind CSS

**TopActionBar:**
- Left group: "重新生成" (Button, default) + "导入补遗" (Button, default)
- Right group: StatsBadges — inline flex with 4 items
- Spacing: 16px gap between elements
- Sticky positioning at top when scrolling matrix
- When addendum import finishes with changes, show one inline success/info banner under the action bar before the matrix grid

**Stats Badges:**
```
[✓ 已覆盖 32] [⚠ 部分覆盖 5] [✗ 未覆盖 3] [覆盖率 80%]
```
- Each badge: Ant Design Tag with colored background
- Covered: green Tag `#52C41A` text on `#F6FFED` bg
- Partial: orange Tag `#FAAD14` text on `#FFFBE6` bg
- Uncovered: red Tag `#FF4D4F` text on `#FFF1F0` bg
- Coverage rate: bold text, color by rate (green ≥90%, orange 60-89%, red <60%)

**Empty State (State B):**
- Centered vertically in tab content area
- Icon: TableOutlined or similar grid icon, 64px, `#BFBFBF`
- Heading: "尚未生成追溯矩阵" (20px, `#262626`)
- Subtext: (14px, `#8C8C8C`, max-width 400px)
- Button: "生成追溯矩阵" (primary, large)

**Progress State (State C):**
- Ant Design Progress bar (blue), animated
- Message text below: 14px, `#595959`

**Error State (State F):**
- Ant Design Alert type="error"
- "重试" button inline

**Test IDs:** `traceability-view`, `traceability-generate`, `traceability-import-addendum`, `traceability-stats`

### 4.3 AddendumImportModal

**Framework:** Ant Design Modal, width 640px

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  导入招标补遗/变更通知                     [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  粘贴补遗/变更通知内容，或上传文件。            │
│  系统将自动解析新增需求并更新追溯矩阵。        │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  │  (TextArea: 粘贴补遗文本内容...)        │    │
│  │                                         │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│  │  📎 点击或拖拽上传文件                   │    │
│  │  支持 .pdf / .docx / .doc / .txt        │    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                                 │
├─────────────────────────────────────────────────┤
│                      [取消]   [开始解析]        │
└─────────────────────────────────────────────────┘
```

**Content:**
- Title: "导入招标补遗/变更通知"
- Helper text: secondary color `#8C8C8C`, 14px
- TextArea: autoSize, minRows=8, maxRows=20, placeholder "粘贴补遗/变更通知文本内容..."
- Upload.Dragger: accept=".pdf,.docx,.doc,.txt", single file, height 80px
- File reading: `.txt` via HTML5 FileReader; `.pdf/.docx/.doc` keep Electron `File.path` and `fileName`, then pass to main process for extraction

**Actions:**
- "取消" (default) + "开始解析" (primary)
- "开始解析" disabled when TextArea is empty and no file selected

**Test IDs:** `addendum-modal`, `addendum-textarea`, `addendum-upload`, `addendum-submit`

---

## 5. Interaction Patterns

### 5.1 Matrix Generation Flow

1. User clicks "生成追溯矩阵" → State C (progress)
2. Backend loads requirements + proposal sections → calls traceability agent
3. Progress updates stream to UI via task-queue polling
4. On completion: matrix renders (State D), stats update, tab badge shows coverage
5. If all covered: celebration animation (State E)

### 5.2 Manual Link Management

1. **Create link:** Right-click N/A cell → "创建链接" → Popover with status selector → confirm
2. **Delete link:** Right-click manual linked cell → "删除链接" → Popconfirm
3. **Update status:** Right-click linked cell → select new status → immediate update; editing an auto link converts it to manual
4. All changes: optimistic UI update + IPC persistence + stats recalculation

### 5.3 Addendum Import Flow

1. User clicks "导入补遗" → AddendumImportModal opens
2. Paste text or upload file → click "开始解析"
3. Modal closes, inline progress shows below action bar (State G)
4. Backend: extract new/changed requirements → insert → full auto mapping regeneration with manual links preserved
5. On completion: requirements list refreshes, matrix rebuilds with new rows and impacted section highlights (State H)

### 5.4 Cross-Navigation

- Click uncovered/partial cell → "跳转到章节"
- Workspace switches from `requirements-analysis` to `proposal-writing`
- After editor mounts, use heading locator + `scrollToHeading()` to position the viewport
- If locator is missing, remain on matrix and keep the cell/column highlighted with a non-blocking message

### 5.5 Regeneration

- "重新生成" → confirmation "重新生成将覆盖自动映射（手动映射保留），是否继续？"
- Preserves `source='manual'` links; only replaces `source='auto'` links
- Any user-edited auto link must first convert to manual, so it survives future regenerations

---

## 6. Visual Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Cell covered bg | `#F6FFED` | Green cell background |
| Cell covered border | `#B7EB8F` | Green cell border |
| Cell covered icon | `#52C41A` | CheckCircleFilled |
| Cell partial bg | `#FFFBE6` | Orange cell background |
| Cell partial border | `#FFE58F` | Orange cell border |
| Cell partial icon | `#FAAD14` | ExclamationCircleFilled |
| Cell uncovered bg | `#FFF1F0` | Red cell background |
| Cell uncovered border | `#FFA39E` | Red cell border |
| Cell uncovered icon | `#FF4D4F` | CloseCircleFilled |
| Cell n/a bg | `#FAFAFA` | Empty cell background |
| Cell n/a border | `#F0F0F0` | Empty cell border |
| Row header width | 200px | Fixed left column |
| Cell min size | 48×36px | Minimum cell dimensions |
| Header font level-1 | 14px / 600 | Top-level section headers |
| Header font level-2 | 13px / 400 | Sub-section headers |
| Row font | 13px / 400 | Requirement description |
| Stats badge gap | 8px | Between stat badges |
| Action bar gap | 16px | Between action bar elements |
| Animation cell flip | 200ms ease-out | Per-cell green flip |
| Animation stagger | 50ms | Delay between cell animations |
| Animation glow | 300ms ease-out | Final matrix border glow |
| Font family | PingFang SC | All Chinese text |
| Modal width | 640px | AddendumImportModal |

---

## 7. Responsive Behavior

- Minimum content width: 600px (same as AnalysisView)
- Matrix scrollable both horizontally and vertically
- Row headers fixed (CSS sticky) during horizontal scroll
- Column headers fixed during vertical scroll
- On narrow viewport: fewer columns visible, horizontal scroll more prominent
- Modal: 640px fixed width, centered, responsive height with max-height scroll

---

## 8. Accessibility

- Coverage status communicated via both color AND icon shape (check/exclamation/close)
- Tooltip text on every cell describes status in words
- Screen reader: aria-label on cells ("需求 R1 在章节 2.技术方案 中已覆盖，置信度 95%")
- Focus management: Tab through cells, Enter to open popover
- Keyboard navigation: arrow keys to move between cells in matrix
- High contrast: cell borders provide secondary visual channel beyond fill color

---

## 9. Prototype Screens

Screens to be created in prototype.pen:

1. **Screen A:** 追溯矩阵 — Empty State (before generation)
2. **Screen B:** 追溯矩阵 — Primary View with mixed coverage (State D)
3. **Screen C:** 导入补遗 — AddendumImportModal with sample text

Notes:
- State C (generation in progress), State E (all-green animation), State F (error), State H (impact highlight) are implementation states not separately prototyped.
- Cell popover interactions are implementation details, not separately prototyped.
