# UX Design Spec: Story 2.7 - 策略种子生成与确认

**Story:** 2-7-strategy-seed-generation
**Date:** 2026-04-01
**Status:** Design

---

## 1. Overview

This story adds AI-powered strategy seed generation from customer communication materials (meeting notes, emails, chat logs). Strategy seeds capture the "soul" of what customers truly care about beyond the RFP — the hidden 20% that differentiates a winning bid. Users can review, confirm, adjust, or delete seeds, and manually add new ones.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** After uploading tender documents, analyzing requirements, and extracting scoring models, the user now wants to inject strategic insights from customer interactions
- **Core Need:** Transform tacit customer signals into actionable strategy seeds that drive proposal differentiation
- **Emotional Design Goal:** "原来客户真正在意这个" — insight + value recognition

---

## 2. Information Architecture

```
AnalysisView (existing from Story 2.5)
├── TenderUploadZone / ParseProgressPanel / TenderResultSummary (existing)
├── Tabs (after extraction completes)
│   ├── Tab 1: "需求清单 (N)" (existing RequirementsList)
│   ├── Tab 2: "评分模型" (existing ScoringModelEditor)
│   ├── Tab 3: "*项检测 (M)" (from Story 2.6)
│   └── Tab 4: "策略种子 (S)" ← NEW TAB (this story)
│       ├── Empty State (never generated): CTA "上传沟通素材生成策略种子"
│       ├── Progress State: Progress bar + stage message
│       ├── Result State:
│       │   ├── SummaryBar: "共 X 个种子 | 已确认 Y | 已调整 Z | 待确认 W"
│       │   ├── ActionBar: [重新生成] + [+ 手动添加]
│       │   └── StrategySeedList (vertical card layout)
│       │       └── StrategySeedCard × N (3-10 cards)
│       ├── Zero Result State: "未识别出隐性需求" + 重新生成/手动添加
│       └── Error State: Alert + retry
└── Tab Badge: pending count (red) / all confirmed (green ✓)
```

---

## 3. Screen States

### State A: Seeds Not Yet Generated (Empty State)

- **Trigger:** User opens "策略种子" tab, `seeds === null`
- **Content:** Centered illustration (lightbulb/seed icon) + heading "尚未生成策略种子"
- **Subtext:** "策略种子从客户沟通素材中提取隐性需求，让方案捕获招标文件之外的核心关注点。"
- **CTA:** Primary button "上传沟通素材" (centered, blue #1677FF)
- **Badge:** Tab label shows "策略种子" without badge number

### State B: Material Input (Modal)

- **Trigger:** User clicks "上传沟通素材" CTA or "重新生成"
- **Component:** MaterialInputModal (Ant Design Modal, width 600px)
- **Content:**
  - Title: "上传客户沟通素材"
  - TextArea: autoSize, minRows=8, maxRows=20, placeholder "粘贴会议纪要、邮件、沟通记录等文本内容..."
  - Upload zone: accept=".txt", single file, reads UTF-8 content into TextArea
  - Helper text: "支持粘贴会议纪要、邮件、沟通记录等文本内容，或上传 .txt 文件"
- **Actions:** [取消] (default) + [开始生成] (primary, disabled when TextArea empty)

### State C: Generation In Progress

- **Trigger:** User clicks "开始生成" in MaterialInputModal
- **Content:** Blue Progress bar with percentage + message text "正在分析沟通素材，提取策略种子... X%"
- **Tab label:** "策略种子" with spinning indicator
- **Interaction:** Generate button disabled, shows "生成中..."

### State D: Seeds Generated — Cards Displayed (Primary State)

- **Trigger:** Generation completes with results (3-10 seeds)
- **SummaryBar:** `共 8 个种子 | 已确认 3 | 已调整 1 | 待确认 4`
  - Pending count in blue badge
  - All confirmed: green checkmark icon
- **ActionBar:** "重新生成" (secondary) + "+ 手动添加" (default)
- **Card List:** Vertical stack of StrategySeedCards, sorted by confidence DESC
- **Tab Badge:** Red Badge with pending count; green ✓ when all resolved
- **Bottom Action:** "全部确认" button when pending seeds exist

### State E: All Seeds Reviewed

- **Trigger:** Every seed is confirmed or adjusted (no pending)
- **SummaryBar:** Green "全部已确认 ✓" indicator
- **Badge:** Green CheckCircleOutlined replaces count badge
- **Cards:** All show confirmed (green) or adjusted (orange) left borders

### State F: Generation Error

- **Trigger:** AI generation fails
- **Content:** Red Alert with error message + "重试" button
- **Pattern:** Matches existing extraction error UI

### State G: Generation Complete — No Seeds Found

- **Trigger:** Generation completed but returned zero seeds
- **Content:** "未识别出隐性需求，请提供更多沟通素材或手动添加"
- **ActionBar:** "重新生成" + "+ 添加"
- **Badge:** No badge; tab keeps plain "策略种子"

---

## 4. Component Specifications

### 4.1 StrategySeedCard

**Framework:** Ant Design Card, custom styled with Tailwind CSS

**Card Layout:**
```
┌─[3px left border: status color]─────────────────────────────┐
│  Title Area                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [种子标题 (bold, 16px)]              [置信度 Badge]  │   │
│  │                              [状态 Tag: 待确认/已确认/已调整] │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Reasoning Area (blockquote style)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ " 推理依据文本...                                     │    │
│  │   客户在第二次沟通中提到... "                          │    │
│  │                            [AI 来源标注]              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Strategy Suggestion Area                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 💡 策略建议文本...                                    │    │
│  │   方案第4章技术架构应重点阐述...                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Source Excerpt (Collapse)                                    │
│  ▸ 查看引用原文                                              │
│                                                              │
│  Action Bar                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [✓ 确认]  [✎ 编辑]  [🗑 删除]                        │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**Left Border Colors by Status:**
| Status | Border Color | Tag Color | Tag Text |
|--------|-------------|-----------|----------|
| pending | `#1677FF` (blue) | blue | 待确认 |
| confirmed | `#52C41A` (green) | green | 已确认 |
| adjusted | `#FAAD14` (orange) | orange | 已调整 |

**Confidence Badge:**
- ≥0.9: green background `#F6FFED`, green text `#52C41A`
- 0.7–0.89: orange background `#FFFBE6`, orange text `#FAAD14`
- <0.7: red background `#FFF1F0`, red text `#FF4D4F`
- Display format: "92%" (percentage)

**Reasoning Area:**
- Blockquote visual style: left border `4px solid #E8E8E8`, background `#FAFAFA`, padding 12px 16px
- Font: 14px, line-height 1.8, color `#595959`
- AI Source tag: 12px inline label "AI 推理" in blue `#1677FF`

**Strategy Suggestion Area:**
- Font: 14px, line-height 1.6, color `#262626`
- Prefix: lightbulb icon (BulbOutlined) in `#FAAD14`

**Source Excerpt:**
- Ant Design Collapse, ghost mode
- Expanded content: italic, color `#8C8C8C`, max-height 100px with scroll

**Edit Mode:**
- Click edit → title becomes Input, reasoning + suggestion become TextArea
- Save + Cancel buttons replace action bar
- On save: status auto-changes to "adjusted" (if was pending/confirmed)

**Action Buttons:**
| Button | Icon | Condition | Effect |
|--------|------|-----------|--------|
| 确认 | CheckOutlined | status=pending | → confirmed |
| 编辑 | EditOutlined | always | toggle edit mode |
| 删除 | DeleteOutlined | always | Popconfirm → remove |

**Test IDs:** `seed-card`, `seed-confirm`, `seed-edit`, `seed-delete`

### 4.2 StrategySeedList

**Layout:** Vertical stack, gap 16px (`space-md`)

**Summary Bar:**
- Horizontal stat row: `共 X 个种子 | 已确认 Y | 已调整 Z | 待确认 W`
- Numbers styled: total in bold, confirmed in green, adjusted in orange, pending in blue
- All confirmed: shows "全部已确认 ✓" in green

**Action Bar:**
- "重新生成" (secondary button) — triggers MaterialInputModal with re-detection confirmation
- "+ 手动添加" (default button) — opens inline add form at top of list

**Progress State:**
- Ant Design Progress bar (blue) with percentage
- Message text below: "正在分析沟通素材... X%"

**Error State:**
- Ant Design Alert type="error" with message + "重试" button

**Empty States:**
- Never generated (`seeds === null`): illustration + CTA (see State A)
- Zero results (`seeds === []`): informational message + action buttons (see State G)

**Bottom Bar:**
- "全部确认" button (primary, full width) when pending seeds > 0
- Hidden when no pending seeds

**Test IDs:** `seed-list`, `seed-summary`, `seed-generate`, `seed-add-manual`, `seed-confirm-all`

### 4.3 MaterialInputModal

**Framework:** Ant Design Modal, width 600px

**Content:**
- Title: "上传客户沟通素材"
- TextArea: autoSize, minRows=8, maxRows=20
- Upload.Dragger: accept=".txt", single file
- Helper text: secondary color, 12px

**File Reading:**
- HTML5 FileReader API, UTF-8 encoding
- On file select: read content → populate TextArea
- On TextArea manual input: clears file reference

**Actions:**
- "取消" (default) + "开始生成" (primary)
- "开始生成" disabled when TextArea is empty

**Test IDs:** `material-modal`, `material-textarea`, `material-upload`, `material-generate`

---

## 5. Interaction Patterns

### 5.1 Generation Trigger

- **Manual trigger:** User opens Modal, pastes/uploads material, clicks "开始生成"
- **Re-generation:** "重新生成" button → confirmation dialog "重新生成将覆盖当前种子，是否继续？" → opens MaterialInputModal
- **Fire-and-forget:** Generation runs async via task-queue; user can navigate away

### 5.2 Seed Review Flow

1. Seeds appear sorted by confidence DESC (highest first)
2. Click [确认] → status → `confirmed`, left border green, tag green
3. Click [编辑] → inline edit mode; save → status → `adjusted`, left border orange
4. Click [删除] → Popconfirm → remove from list
5. All changes are immediate (optimistic UI) with IPC persistence
6. Summary bar and tab badge update in real-time

### 5.3 Manual Add Flow

1. Click "+ 手动添加" → inline card form appears at top of list
2. Fill: title (required), reasoning (required), suggestion (required)
3. Save → creates seed with `status=confirmed`, `confidence=1.0`
4. Cancel → removes inline form

### 5.4 Skip Flow (AC #4)

- User can skip "策略种子" tab entirely
- Tab shows empty state but does not block progression to Stage 3
- "建议获取客户沟通素材以提升方案质量" subtle hint in empty state

---

## 6. Visual Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Seed pending border | `#1677FF` (blue) | Card left border for pending seeds |
| Seed confirmed border | `#52C41A` (green) | Card left border for confirmed seeds |
| Seed adjusted border | `#FAAD14` (orange) | Card left border for adjusted seeds |
| Status pending tag | `#1677FF` (blue) | Tag for unreviewed seeds |
| Status confirmed tag | `#52C41A` (green) | Tag for confirmed seeds |
| Status adjusted tag | `#FAAD14` (orange) | Tag for adjusted seeds |
| Confidence high | `#52C41A` | Badge ≥0.9 |
| Confidence medium | `#FAAD14` | Badge 0.7–0.89 |
| Confidence low | `#FF4D4F` | Badge <0.7 |
| Reasoning bg | `#FAFAFA` | Blockquote background |
| Reasoning border | `#E8E8E8` | Blockquote left border |
| Card gap | 16px (`space-md`) | Vertical spacing between cards |
| Card padding | 16px (`space-md`) | Internal card padding |
| Font body | 14px / 1.8 | Reasoning and suggestion text |
| Font title | 16px / 600 | Seed title |
| Font caption | 12px / 400 | Source attribution, confidence |
| Font family | PingFang SC | All Chinese text |
| Modal width | 600px | MaterialInputModal |

---

## 7. Responsive Behavior

- Minimum content width: 600px (same as AnalysisView)
- Cards fill available width, content wraps naturally
- On narrow viewport: source excerpt section collapses by default
- Modal: 600px fixed width, centered, responsive height with max-height scroll

---

## 8. Accessibility

- Status communicated via both color AND text labels (Tag text)
- Confidence communicated via both color AND percentage number
- Screen reader: aria-label on action buttons ("确认此策略种子", "编辑此策略种子", "删除此策略种子")
- Focus management: after confirm/delete, focus moves to next card
- Keyboard: Tab through cards, Enter to confirm, Escape to cancel edit

---

## 9. Prototype Screens

Screens to be created in prototype.pen:

1. **Screen A:** 策略种子 — Empty State (before generation)
2. **Screen B:** 沟通素材上传 — MaterialInputModal with sample text
3. **Screen C:** 策略种子 — Cards Displayed (primary state with mixed statuses)

Notes:
- State C (in progress), State F (error), and State G (zero results) are implementation states not separately prototyped.
- Card edit mode is an implementation interaction, not separately prototyped.
