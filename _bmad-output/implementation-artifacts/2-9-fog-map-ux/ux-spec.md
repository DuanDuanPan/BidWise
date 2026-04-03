# UX Design Spec: Story 2.9 - 招标迷雾地图

**Story:** 2-9-fog-map
**Date:** 2026-04-03
**Status:** Design

---

## 1. Overview

This story adds an AI-powered "Fog Map" (迷雾地图) visualization that classifies each extracted requirement by certainty level — clear (green), ambiguous (yellow), or risky (red). Users can review uncertain requirements, understand why they're flagged, and confirm them one-by-one or in batch, progressively "clearing the fog" to reduce proposal blind spots.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** After uploading tender documents and extracting requirements (Story 2.5), the user wants to identify which requirements are vague or risky before writing the proposal
- **Core Need:** Quickly focus on ambiguous and risky requirements, understand *why* they're uncertain, and get actionable confirmation suggestions
- **Emotional Design Goal:** From "不确定" to "确信" — progressively clearing fog reduces proposal anxiety and blind-spot risk

---

## 2. Information Architecture

```
AnalysisView (existing from Story 2.5)
├── TenderUploadZone / ParseProgressPanel / TenderResultSummary (existing)
├── Tabs (after extraction completes)
│   ├── Tab 1: "需求清单 (N)" (existing RequirementsList)
│   ├── Tab 2: "评分模型" (existing ScoringModelEditor)
│   ├── Tab 3: "*项检测 (M)" (from Story 2.6)
│   ├── Tab 4: "策略种子 (S)" (from Story 2.7)
│   └── Tab 5: "迷雾地图" ← NEW TAB (this story)
│       ├── Empty State A: Requirements not extracted → redirect CTA
│       ├── Empty State B: Requirements exist, fog map not generated → generate CTA
│       ├── Progress State: Progress bar + stage message
│       ├── Result State:
│       │   ├── FogClearingProgressBar (top): gradient progress + 3-color stats
│       │   ├── ActionBar: [重新生成]
│       │   ├── Collapse Panels (3 groups):
│       │   │   ├── "风险需求 (N)" — red header, expanded by default
│       │   │   ├── "模糊需求 (N)" — yellow header, expanded by default
│       │   │   └── "明确需求 (N)" — green header, collapsed by default
│       │   │       └── FogMapCard × N (expandable requirement cards)
│       │   └── BottomBar: "全部确认 (N 项待确认)" button
│       ├── Error State: Alert + retry
│       └── First-time Tour: 3-color meaning explanation
└── Tab Badge: <FogMapBadge /> — pending count (red) / all clear (green ✓)
```

---

## 3. Screen States

### State A: Requirements Not Extracted (Prerequisite Empty State)

- **Trigger:** User opens "迷雾地图" tab, `requirements === null` (Story 2.5 not executed)
- **Content:** Centered illustration (fog/cloud icon) + heading "请先完成需求结构化抽取"
- **Subtext:** "迷雾地图基于已抽取的需求清单进行确定性分析，请先在"需求清单"Tab 中完成抽取。"
- **CTA:** Primary button "前往需求清单" → switches to Tab 1
- **Badge:** No badge on tab label
- **data-testid:** `fog-map-empty-no-requirements`

### State B: Fog Map Not Generated (Generation CTA)

- **Trigger:** User opens "迷雾地图" tab, requirements exist but `fogMap === null`
- **Content:** Centered illustration (fog clearing icon) + heading "点击生成迷雾地图"
- **Subtext:** "AI 将对每条需求进行确定性分级，帮助你聚焦模糊和风险区域，减少方案盲区。"
- **CTA:** Primary button "生成迷雾地图" (centered, blue #1677FF)
- **Badge:** No badge
- **data-testid:** `fog-map-empty-not-generated`

### State C: Generation In Progress

- **Trigger:** User clicks "生成迷雾地图" or "重新生成"
- **Content:** Blue Progress bar with percentage + message "正在分析需求确定性... X%"
- **Tab label:** "迷雾地图" with spinning indicator
- **Generate button:** Disabled, shows "生成中..."
- **data-testid:** `fog-map-progress`

### State D: Fog Map Generated — Three-Color Groups (Primary State)

- **Trigger:** Generation completes with results
- **Layout:** Three sections stacked vertically:
  1. **FogClearingProgressBar** (top): Shows `fogClearingPercentage` with gradient color
  2. **Three Collapse Panels** (center): Risk → Ambiguous → Clear grouping
  3. **Bottom Action Bar**: Batch confirm button
- **Group logic:** Confirmed ambiguous/risky items remain in their original group, but switch to green confirmed styling and contribute to group-level `已确认 N` counts
- **Tab Badge:** Red badge with pending count (ambiguous + risky unconfirmed)
- **data-testid:** `fog-map-view`

### State E: All Requirements Clear/Confirmed

- **Trigger:** All requirements are either `clear` or `confirmed`
- **FogClearingProgressBar:** 100%, fully green
- **Grouped layout:** Still shows Risk / Ambiguous / Clear sections; Risk / Ambiguous headers may read like `风险需求 (3 | 已确认 3)` / `模糊需求 (7 | 已确认 7)`
- **Badge:** Green CheckCircleOutlined replaces count badge
- **Bottom bar:** Hidden (no pending items)

### State F: Generation Error

- **Trigger:** AI generation fails
- **Content:** Red Alert with error message + "重试" button
- **Pattern:** Matches existing extraction error UI (same as Story 2.6/2.7)

### State G: Regeneration Confirmation

- **Trigger:** User clicks "重新生成" when fog map already exists
- **Component:** Popconfirm: "重新生成将清除所有现有分级（含已确认状态），是否继续？"
- **Actions:** [取消] + [确认重新生成]

---

## 4. Component Specifications

### 4.1 FogClearingProgressBar

**Framework:** Ant Design Progress + custom Tailwind CSS

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│  雾散进度  ████████████████░░░░░░░░░░  65%            │
│  明确 10 · 模糊 7 · 风险 3 · 已确认 3                  │
└────────────────────────────────────────────────────────┘
```

**Progress Bar:**
- Ant Design Progress component, `percent = fogClearingPercentage`
- Gradient color mapping:
  - 0–50%: Red `#FF4D4F`
  - 50–80%: Orange `#FAAD14`
  - 80–100%: Green `#52C41A`
- Format: percentage display

**Statistics Row:**
- Inline stat pills with colored dots:
  - Green dot `#52C41A` + "明确 N"
  - Yellow dot `#FAAD14` + "模糊 N"
  - Red dot `#FF4D4F` + "风险 N"
  - Blue dot `#1677FF` + "已确认 N" (user-confirmed ambiguous/risky items)
- Font: 14px, color `#595959`, gap 16px between pills

**data-testid:** `fog-map-progress-bar`, `fog-map-stats`

### 4.2 FogMapCard (Expandable Requirement Card)

**Framework:** Custom-styled expandable card built with Tailwind CSS and Ant Design primitives as needed; do not rely on default Card / Collapse skin

**Collapsed Layout:**
```
┌─[3px left border: certainty color]──────────────────────────┐
│  [#12] 系统应支持高可用部署架构...          [明确] Tag       │
│                                             [已确认 ✓]      │
└──────────────────────────────────────────────────────────────┘
```

**Expanded Layout:**
```
┌─[3px left border: certainty color]──────────────────────────┐
│  [#12] 系统应支持高可用部署架构... (完整描述)  [明确] Tag   │
│                                                              │
│  分级原因 (Alert component)                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ "良好的可扩展性"用词笼统，未定义具体扩展指标...     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  定向确认建议 (Blockquote style)                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ > 建议向客户确认：1) 预期系统规模... 2) 性能指标...   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  来源: 第 5, 12 页  |  分类: 技术需求  |  优先级: 高        │
│                                                              │
│  [✓ 确认]                                                    │
└──────────────────────────────────────────────────────────────┘
```

**Left Border Colors:**
| Certainty Level | Border Color | Tag Color | Tag Text |
|-----------------|-------------|-----------|----------|
| clear | `#52C41A` (green) | green | 明确 |
| ambiguous | `#FAAD14` (yellow/orange) | orange | 模糊 |
| risky | `#FF4D4F` (red) | red | 风险 |
| confirmed (was ambiguous/risky) | `#52C41A` (green) | green | 已确认 |

**Collapse Area — Reason (Alert component):**
- certaintyLevel=ambiguous → Alert type="warning"
- certaintyLevel=risky → Alert type="error"
- certaintyLevel=clear → Alert type="success" (rarely expanded)
- Font: 14px, line-height 1.8

**Collapse Area — Suggestion (Blockquote style):**
- Left border `4px solid #E8E8E8`, background `#FAFAFA`, padding 12px 16px
- Font: 14px, line-height 1.6, color `#595959`

**Collapse Area — Metadata Row:**
- Source pages: "来源: 第 N, M 页"
- Category: tag pill
- Priority: tag pill
- Font: 12px, color `#8C8C8C`

**Confirm Button:**
- Visible only when `confirmed === false` and `certaintyLevel !== 'clear'`
- Icon: CheckOutlined
- On click: card transitions to green (300ms CSS transition on border-color + background-color)

**Confirm Animation:**
- `transition: border-color 300ms ease, background-color 300ms ease`
- Left border transitions from yellow/red → green `#52C41A`
- Tag transitions from "模糊"/"风险" → "已确认 ✓"
- Card visually "clears the fog" — the confirmed card stays in its original Risk / Ambiguous group, while the group header's `已确认 N` count increments on next render cycle

**Props:** `item: FogMapItem`, `onConfirm(id: string)`, `expanded: boolean`, `onToggle(id: string)`

**data-testid:** `fog-map-card`, `fog-map-card-confirm`, `fog-map-card-detail`

### 4.3 FogMapView (Main Container)

**Layout:** Vertical flex container

```
┌────────────────────────────────────────────────────────┐
│ ActionBar: [重新生成]                                   │
├────────────────────────────────────────────────────────┤
│ FogClearingProgressBar                                  │
├────────────────────────────────────────────────────────┤
│ ▼ 风险需求 (3)                          [red header]    │
│   FogMapCard × 3                                        │
├────────────────────────────────────────────────────────┤
│ ▼ 模糊需求 (7)                          [yellow header] │
│   FogMapCard × 7                                        │
├────────────────────────────────────────────────────────┤
│ ▸ 明确需求 (10)                         [green header]  │
│   (collapsed by default)                                │
├────────────────────────────────────────────────────────┤
│ [全部确认 (7 项待确认)]                  [bottom bar]    │
└────────────────────────────────────────────────────────┘
```

**Action Bar:**
- First generation uses the centered Empty State B CTA "生成迷雾地图"
- After generation: top-right "重新生成" secondary button (triggers State G confirmation)

**Three-Color Collapse Groups:**
- Ant Design Collapse component, 3 panels
- Panel ordering: Risk (red) → Ambiguous (yellow) → Clear (green)
- Risk + Ambiguous panels expanded by default; Clear panel collapsed
- Panel header: colored background tint + group name + count + confirmed count
  - "风险需求 (3)" — header bg `#FFF1F0`, text `#FF4D4F`
  - "模糊需求 (7 | 已确认 2)" — header bg `#FFFBE6`, text `#FAAD14`
  - "明确需求 (10)" — header bg `#F6FFED`, text `#52C41A`
- Confirmed ambiguous/risky items remain in their original group and only switch to green confirmed styling

**Bottom Bar:**
- Visible when there are unconfirmed ambiguous/risky items
- Full-width primary button: "全部确认 (N 项待确认)"
- Hidden when all items are clear/confirmed

**First-time Tour:**
- Ant Design Tour component, 3 steps:
  1. Points to progress bar: "雾散进度条显示当前需求的明确程度"
  2. Points to red/yellow groups: "红色=风险区域，黄色=模糊需求，需要定向确认"
  3. Points to confirm button: "点击确认后需求变为明确，迷雾逐步消散"
- Triggered once per user (localStorage flag `fogMapTourShown`)
- Only appears when fog map has data

**data-testid:** `fog-map-view`, `fog-map-generate`, `fog-map-regenerate`, `fog-map-confirm-all`

### 4.4 FogMapBadge

**Framework:** Ant Design Badge

**States:**
| Condition | Display |
|-----------|---------|
| Fog map not generated | No badge |
| Has unconfirmed ambiguous/risky items | Red badge with count |
| All items clear or confirmed | Green CheckCircleOutlined |

**Props:** `summary: FogMapSummary | null`

**data-testid:** `fog-map-badge`

---

## 5. Interaction Patterns

### 5.1 Generation Flow

1. User opens "迷雾地图" tab
2. If requirements not extracted → Empty State A with redirect CTA
3. If fog map not generated → Empty State B with generate CTA
4. User clicks "生成迷雾地图" → fire-and-forget async via task-queue
5. Progress bar appears with real-time percentage updates
6. On completion: three-color groups render, progress bar shows percentage
7. Tab badge updates with pending count

### 5.2 Review & Confirm Flow

1. Fog map displays with risky items first (most attention-grabbing)
2. User clicks a risky/ambiguous card → expands to show reason + suggestion
3. User reads the AI-generated reason and confirmation suggestion
4. User clicks "确认" → optimistic UI update:
   - Card left border transitions to green (300ms)
   - Tag changes to "已确认 ✓"
   - FogClearingProgressBar updates percentage in real-time
   - Tab badge count decrements
   - On next render cycle, the card remains in its original Risk / Ambiguous group and the group header's `已确认 N` count increments
5. IPC call persists confirmation to DB + fog-map.json

### 5.3 Batch Confirm Flow

1. User clicks "全部确认 (N 项待确认)" at bottom
2. All unconfirmed ambiguous/risky items transition to confirmed
3. Progress bar jumps to 100%, all green
4. Tab badge shows green checkmark
5. Batch IPC call persists all confirmations

### 5.4 Regeneration Flow

1. User clicks "重新生成" → Popconfirm warning
2. On confirm: clears all existing classifications (including confirmed status)
3. Re-runs LLM classification from scratch
4. New results replace old ones

---

## 6. Visual Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Clear (green) | `#52C41A` | Card border, tag, stats dot |
| Ambiguous (yellow/orange) | `#FAAD14` | Card border, tag, stats dot |
| Risky (red) | `#FF4D4F` | Card border, tag, stats dot |
| Confirmed (blue) | `#1677FF` | Stats dot for user-confirmed items |
| Clear bg tint | `#F6FFED` | Clear group header, clear Alert bg |
| Ambiguous bg tint | `#FFFBE6` | Ambiguous group header |
| Risky bg tint | `#FFF1F0` | Risky group header |
| Reasoning blockquote bg | `#FAFAFA` | Suggestion blockquote background |
| Reasoning blockquote border | `#E8E8E8` | Suggestion left border |
| Confirm transition | 300ms ease | border-color + background-color |
| Card gap | 12px | Vertical spacing between cards |
| Card padding | 16px | Internal card padding |
| Card left border | 3px solid | Certainty-colored left border |
| Font body | 14px / 1.8 | Reason and suggestion text |
| Font title | 14px / 600 | Requirement description |
| Font caption | 12px / 400 | Source pages, metadata |
| Font family | PingFang SC | All Chinese text |
| Progress gradient | red→orange→green | 0-50%→50-80%→80-100% |

---

## 7. Responsive Behavior

- Minimum content width: 600px (same as AnalysisView)
- Cards fill available width, text content wraps naturally
- Collapse panels fill container width
- Progress bar is full-width within its container
- On narrow viewport: metadata row in card wraps to two lines

---

## 8. Accessibility

- Certainty level communicated via both color AND text labels (Tag text: 明确/模糊/风险/已确认)
- Progress communicated via both gradient color AND percentage number
- Screen reader: aria-label on confirm button ("确认此需求已完成人工确认")
- Focus management: after single confirm, focus moves to next unconfirmed card
- Keyboard: Tab through cards, Enter to expand/collapse, Space to confirm
- Color-blind safe: text labels always accompany color indicators

---

## 9. Prototype Screens

Screens to be created in prototype.pen:

1. **Screen A:** 迷雾地图 — Empty State B (requirements exist, fog map not generated)
2. **Screen B:** 迷雾地图 — Primary State with three-color groups (mixed: 3 risky, 7 ambiguous, 10 clear)
3. **Screen C:** 迷雾地图 — Card Expanded Detail (showing reason + suggestion + confirm button)

Notes:
- State A (requirements not extracted) is a simple redirect and not separately prototyped
- State C (in progress), State F (error), and State G (regeneration confirm) are implementation states not separately prototyped
- The first-time Tour overlay is not prototyped; it's a standard Ant Design component

---

## 10. Data Flow Summary

```
User enters "迷雾地图" Tab
  → fetchFogMap(projectId) + fetchFogMapSummary(projectId)
  → Render based on state:
    - requirements === null → State A (redirect)
    - fogMap === null → State B (generate CTA)
    - fogMap exists → State D (three-color groups)

User clicks "生成迷雾地图"
  → generateFogMap(projectId) → IPC → task-queue → LLM classification
  → Progress events → State C (progress bar)
  → Completion → fetchFogMap + fetchFogMapSummary → State D

User confirms single item
  → confirmCertainty(id) → optimistic local update → IPC persist
  → Progress bar + badge + group-level 已确认 count update in real-time

User batch confirms
  → batchConfirmCertainty(projectId) → all items go green → 100% progress
```
