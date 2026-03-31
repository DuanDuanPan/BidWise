# UX Design Spec: Story 2.6 - Mandatory Item Detection & Highlight

**Story:** 2-6-mandatory-item-detection
**Date:** 2026-03-31
**Status:** Design

---

## 1. Overview

This story adds automatic detection and red-highlighted display of mandatory response items (*项) from tender documents. Users can review, confirm, dismiss, or manually add mandatory items. This is the first "Wow Moment" in the cold-start experience — from upload to red highlights within 5 minutes.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** Reviewing 50-100 page tender documents, identifying all mandatory items to avoid bid disqualification
- **Core Need:** Zero-miss mandatory item detection with clear visual distinction from regular requirements

---

## 2. Information Architecture

```
AnalysisView (existing from Story 2.5)
├── TenderUploadZone / ParseProgressPanel / TenderResultSummary (existing)
├── Tabs (after extraction completes)
│   ├── Tab 1: "需求清单 (N)" (existing RequirementsList)
│   │   └── Requirements with *项 red tag for linked mandatory items
│   ├── Tab 2: "评分模型" (existing ScoringModelEditor)
│   └── Tab 3: "*项检测 (M)" ← NEW TAB (this story)
│       ├── Empty State (never run): "尚未执行必响应项检测" + "开始检测"
│       ├── Progress State: inline Alert + progress percentage (non-blocking)
│       ├── Result State:
│       │   ├── SummaryBar: "共 X 项 | 已确认 Y | 已驳回 Z | 待审核 W"
│       │   ├── ActionBar: [重新检测] + [+ 添加*项]
│       │   └── MandatoryItemsList (Ant Design Table)
│       │       └── Rows with red left border, red content text
│       └── Zero Result State: "本次未识别出必响应项，请人工复核或手动添加"
└── MandatoryItemsBadge (tab label only in this story)
```

---

## 3. Screen States

### State A: Detection Not Yet Run (Empty State)

- **Trigger:** Extraction completed, user opens "*项检测" tab for the first time
- **Content:** Centered empty illustration + "尚未执行必响应项检测" message
- **CTA:** Primary button "开始检测" (blue, centered)
- **Badge:** Tab label shows "*项检测" without badge number

### State B: Detection In Progress

- **Trigger:** User clicks "开始检测" or "重新检测"
- **Content:** Blue Alert with LoadingOutlined spinner + progress percentage；渲染在 `*项检测` Tab 内，不阻塞用户切换到其他 Tab
- **Message:** "正在检测必响应项... X%" with estimated time
- **Tab label:** "*项检测" with spinning indicator
- **Interaction:** Button disabled, shows "检测中..."

### State C: Detection Complete — Items Found (Primary State)

- **Trigger:** Detection finishes with results
- **SummaryBar:** Horizontal stat row: `共 12 项 | 已确认 3 | 已驳回 1 | 待审核 8`
  - Pending count in red badge style
  - All confirmed: green checkmark icon
- **Table:** Full mandatory items list (see Section 4 for column detail)
- **ActionBar:** "重新检测" (secondary) + "+ 添加*项" (default)
- **Tab label:** "*项检测" with red Badge showing pending count

### State D: All Items Reviewed

- **Trigger:** Every item is either confirmed or dismissed
- **SummaryBar:** Shows green "全部已审核 ✓" indicator
- **Badge:** Green checkmark replaces red badge on tab label
- **Table:** All rows show confirmed (green tag) or dismissed (gray tag)

### State E: Detection Error

- **Trigger:** AI detection fails
- **Content:** Red Alert with error message + "重试" button
- **Pattern:** Matches existing extraction error UI (Alert type="error")

### State F: Detection Complete — No Items Found

- **Trigger:** Detection completed successfully but returned zero mandatory items
- **Content:** Informational empty result state: "本次未识别出必响应项，请人工复核或手动添加"
- **ActionBar:** "重新检测" + "+ 添加*项"
- **Badge:** No red badge; tab keeps plain "*项检测"

---

## 4. Component Specifications

### 4.1 MandatoryItemsList (Table)

**Framework:** Ant Design Table, `size="small"`, `pagination={false}`, scroll `y: 500`

| Column | Key | Width | Render |
|--------|-----|-------|--------|
| 序号 | index | 60 | Auto-increment number |
| 内容 | content | flex | Red text `#FF4D4F`, expandable if long |
| 原文摘录 | sourceText | 200 | Truncated with Tooltip on hover |
| 来源页码 | sourcePages | 100 | Formatted as "P.3, P.7" |
| 置信度 | confidence | 100 | Progress bar: >=0.9 green, 0.7-0.9 orange, <0.7 red |
| 状态 | status | 100 | Tag: detected=blue, confirmed=green, dismissed=gray |
| 操作 | actions | 140 | Confirm/Dismiss buttons (contextual) |

**Row Styling:**
- `border-left: 3px solid #FF4D4F` on every row
- Hover: light red background `#FFF1F0`
- Dismissed rows: reduced opacity (0.6)

**Action Column Logic:**
- `detected` → Show [确认] (green) + [驳回] (gray) buttons
- `confirmed` → Show green Tag "已确认", [撤回] link
- `dismissed` → Show gray Tag "已驳回", [恢复] link

### 4.2 MandatoryItemsBadge

- **In Tab Label:** Red Ant Badge with pending count number
- **All Reviewed State:** Green CheckCircleOutlined icon
- **Scope Note:** Status bar integration is deferred to later compliance/dashboard stories; this story only consumes the badge in the tab label

### 4.3 Add Mandatory Item Modal

- **Trigger:** Click "+ 添加*项" button
- **Fields:**
  - 内容描述 (TextArea, required, placeholder: "输入必响应项描述...")
  - 原文摘录 (TextArea, optional, placeholder: "粘贴招标文件原文...")
  - 来源页码 (Input, optional, placeholder: "如：3, 7, 15")
- **Actions:** [取消] [添加] (primary)
- **Result:** Added with status=confirmed, confidence=1.0
- **Normalization:** Renderer parses page input into `number[]` (trim, dedupe, ascending sort)

### 4.4 RequirementsList Integration

- Requirements linked to mandatory items show a red Tag "*项" after the description
- Tag is non-interactive, purely informational
- Cross-referenced via `mandatoryItems[].linkedRequirementId`

---

## 5. Interaction Patterns

### 5.1 Detection Trigger

- **Manual trigger (shipping scope):** User clicks "开始检测" in empty state or "重新检测" to re-run
- **Auto-chain (optional enhancement):** Can be added later only if it reuses the existing extraction-complete path without removing the empty-state entry point
- **Re-detection:** Clears existing items and runs fresh detection (with confirmation dialog)

### 5.2 Item Review Flow

1. User sees items sorted by confidence DESC (highest first)
2. Click [确认] → status changes to `confirmed`, row tag turns green
3. Click [驳回] → status changes to `dismissed`, row fades to 60% opacity
4. All changes are immediate (optimistic UI) with IPC persistence
5. Summary bar updates in real-time

### 5.3 Keyboard Shortcuts

- No dedicated shortcuts for Alpha (future consideration)

### 5.4 Error Recovery

- Detection failure: Show error Alert with retry button
- Network/AI timeout: Surface the error and let the user explicitly retry from the same tab
- Partial results: Not supported in Alpha; either full success or full retry

---

## 6. Visual Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Mandatory highlight | `#FF4D4F` | Text color, left border, badge |
| Mandatory hover bg | `#FFF1F0` | Table row hover |
| Status detected | `#1677FF` (blue) | Tag for unreviewed items |
| Status confirmed | `#52C41A` (green) | Tag for confirmed items |
| Status dismissed | `#D9D9D9` (gray) | Tag for dismissed items |
| Confidence high | `#52C41A` | Progress >=0.9 |
| Confidence medium | `#FAAD14` | Progress 0.7-0.9 |
| Confidence low | `#FF4D4F` | Progress <0.7 |
| Font family | PingFang SC | All Chinese text |
| Table row border-left | 3px solid `#FF4D4F` | Row emphasis |

---

## 7. Responsive Behavior

- Minimum content width: 600px (same as existing AnalysisView)
- Table columns: content column fills remaining space
- On narrow viewport: sourceText column hides, content truncates
- Modal: 520px fixed width, centered

---

## 8. Accessibility

- Red text meets WCAG AA contrast on white background (4.63:1)
- Status communicated via both color AND text labels (Tag text)
- Confidence communicated via both color AND percentage number
- Screen reader: aria-label on action buttons ("确认此必响应项", "驳回此必响应项")

---

## 9. Prototype Screens

Screens to be created in prototype.pen:

1. **Screen A:** *项检测 — Empty State (before detection)
2. **Screen B:** *项检测 — Detection Complete with Items (primary state)
3. **Screen C:** *项检测 — All Items Reviewed (green checkmark state)

Notes:
- Current PNG/`.pen` exports cover State A / C / D. State B (in progress), State E (error), and State F (zero results) are implementation states not separately exported in this prototype batch.
