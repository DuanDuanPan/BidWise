# UX Design Spec: Story 3.3 - Template-Driven Proposal Skeleton

**Story:** 3-3-template-driven-proposal-skeleton
**Date:** 2026-03-31
**Status:** Design

---

## 1. Overview

This story adds the "方案设计" (Solution Design) SOP stage, enabling users to select a proposal template, preview its chapter structure, auto-generate a chapter skeleton with scoring weight annotations, and interactively edit the skeleton structure before proceeding to full proposal writing.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** Starting a new proposal from scratch, needing structured chapter guidance aligned to scoring criteria
- **Core Need:** Quickly scaffold a compliant proposal structure that highlights high-weight sections

---

## 2. Information Architecture

```
ProjectWorkspace (3-column layout from Story 1.7)
├── SOP ProgressBar (48px, fixed top)
│   └── Active stage: "方案设计" (solution-design)
├── WorkspaceLayout
│   ├── OutlinePanel (240px, collapsible)
│   │   ├── Panel Header: "文档大纲"
│   │   └── DocumentOutlineTree (read-only preview, derived from documentStore)
│   │       └── Shows skeleton headings after generation
│   ├── MainContent (flex, min 600px)
│   │   └── SolutionDesignView ← THIS STORY
│   │       ├── Phase: checking → loading spinner
│   │       ├── Phase: select-template → TemplateSelector
│   │       ├── Phase: edit-skeleton → SkeletonEditor
│   │       └── Phase: has-content → ExistingContentSummary
│   └── AnnotationPanel (320px, collapsible)
│       └── (placeholder — future stories)
└── StatusBar (32px, fixed bottom)
    ├── Left: Current Stage
    └── Right: Word Count (shown in solution-design once content/skeleton exists)
```

---

## 3. Page Flow

```
┌─────────────────┐
│  Enter Solution  │
│   Design Stage   │
└────────┬────────┘
         │
    ┌────▼────┐
    │ checking │  (load proposal.md)
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
proposal.md           proposal.md
is empty              has content
    │                     │
    ▼                     ▼
┌──────────┐      ┌──────────────┐
│ select-  │      │ has-content  │
│ template │      │  (summary)   │
└────┬─────┘      └──────┬───────┘
     │                   │
     │ select → preview  │ "重新选择模板"
     │ → click "生成骨架" │ (with confirm modal)
     │                   │
     ▼                   ▼
┌────────────┐    ┌──────────┐
│   generate │    │ select-  │
│   skeleton │───▶│ template │
│  (loading) │    └──────────┘
└────┬───────┘
     │
     ▼
┌──────────────┐
│ edit-skeleton │
│  (Tree view)  │
└──────┬───────┘
       │
       │ "确认骨架，开始撰写"
       ▼
┌─────────────────┐
│ Redirect to     │
│ 方案撰写 stage   │
└─────────────────┘
```

---

## 4. Screen States

### State 1: Checking (Loading)

- **Trigger:** User navigates to "方案设计" SOP stage
- **Display:** Centered `Spin` with text "正在检查方案内容..."
- **Duration:** Brief (< 500ms typical)
- **Transitions:** → `select-template` (no content) or `has-content` (existing content)

### State 2: Template Selection (`select-template`)

- **Trigger:** No existing proposal content, or user chose to re-select template
- **Layout:**
  - Top: Section header "选择方案模板" (H3) with subtitle "选择一个模板作为方案章节结构的起点"
  - Body: Two-column layout on desktop
    - Left: Card grid, 2 columns on desktop (responsive to 1 col on narrow)
    - Right: Read-only chapter preview panel for the selected template
  - Each card:
    - Icon: `FileTextOutlined` (built-in) or `BankOutlined` (company)
    - Title: Template name (bold)
    - Description: 1-2 line summary
    - Footer: `{n} 个章节` pill + source tag (蓝 "内置" / 绿 "公司")
  - Selected card: Blue border highlight (`border-color: #1677ff`)
  - Preview panel:
    - Unselected: Empty hint "选择模板后可预览章节结构"
    - Selected: H1-H4 indented list / read-only `Tree`, matching the template structure
- **Bottom bar:**
  - Right: "生成骨架" Button (primary, disabled until template selected)
- **Empty state:** `Empty` component with "暂无可用模板" if no templates found
- **Loading state:** `Spin` centered while fetching template list; preview area has its own loading state while fetching full template

### State 3: Skeleton Generation (Transient Loading)

- **Trigger:** User clicks "生成骨架"
- **Display:** Full-area loading overlay with Spin + "正在生成方案骨架..."
- **Duration:** < 2s typical
- **Transition:** → `edit-skeleton`

### State 4: Skeleton Editor (`edit-skeleton`)

- **Trigger:** Skeleton successfully generated
- **Layout:**
  - Top: Section header "编辑方案骨架" with stats line: "{totalSections} 个章节，{keyFocusCount} 个重点章节"
  - Body: `Tree` component (Ant Design), full height scroll
    - `showLine`: true (connecting lines between levels)
    - Controlled `expandedKeys`: initial all expanded, stays coherent after add/delete/move
    - `draggable`: true (drag-drop reorder)
    - Each node renders custom title:
      ```
      ┌─────────────────────────────────────────────────────┐
      │ ● 系统架构设计          [30%] [重点投入]  [+▾] [×]  │
      └─────────────────────────────────────────────────────┘
      ```
      - Title text: click to select, double-click to inline edit
      - Weight tag: colored by tier (≥15% red, 5-14% orange, <5% gray), display value comes from converted percentage
      - "重点投入" tag: red, only if `isKeyFocus === true`
      - Action buttons (visible on hover): Add menu (+▾ → 添加同级章节 / 添加子章节), Delete (×)
  - Bottom action bar:
    - Left: "重新选择模板" (text button, triggers confirm → `select-template`)
    - Right: "确认骨架，开始撰写" (primary button)

### State 5: Existing Content (`has-content`)

- **Trigger:** `proposal.md` already has content when entering stage
- **Layout:**
  - Info panel: "当前方案已包含内容"
  - Summary: List of H1 headings extracted from existing proposal
  - Actions:
    - "继续撰写" (primary) → navigates to "方案撰写" stage
    - "重新选择模板" (default) → Modal confirm: "重新生成骨架将覆盖当前方案内容，是否继续？" → if confirmed, → `select-template`

---

## 5. Interaction Patterns

### 5.1 Template Card Selection

| Action | Result |
|--------|--------|
| Click card | Card highlighted, previous deselected |
| Click "生成骨架" | Start skeleton generation |
| Hover card | Elevation shadow increase |

### 5.2 Skeleton Tree Editing

| Action | Result |
|--------|--------|
| Drag node | Reorder within same level or move to different parent (max depth 4) |
| Double-click title | Inline Input appears, Enter/blur to confirm, Escape to cancel |
| Click "+" (add) | Open menu: "添加同级章节" / "添加子章节"; inserted node auto-enters edit mode |
| Click "×" (delete) | Modal.confirm "确定删除「{title}」及其所有子章节？" |
| Click "重新选择模板" | Modal.confirm → reset to template selection |
| Click "确认骨架" | Flush pending persist, then switch to "方案撰写" stage |

### 5.3 Scoring Weight Display

| Condition | Display |
|-----------|---------|
| No scoring model | No weight tags shown at all |
| Display percent ≥ 15% | Red tag `{n}%` + red "重点投入" tag |
| Display percent 5-14% | Orange tag `{n}%` |
| Display percent < 5% | Gray tag `{n}%` |
| No weight match | No tag |

---

## 6. Component Inventory

| Component | File Path | Description |
|-----------|-----------|-------------|
| `SolutionDesignView` | `modules/editor/components/SolutionDesignView.tsx` | Phase controller, manages checking/select/edit/has-content states |
| `TemplateSelector` | `modules/editor/components/TemplateSelector.tsx` | Card grid + read-only chapter preview for template selection |
| `SkeletonEditor` | `modules/editor/components/SkeletonEditor.tsx` | Tree-based skeleton editor with drag/edit/weight display |

---

## 7. Data Dependencies

| Data | Source | Used By |
|------|--------|---------|
| Template list | `template:list` IPC → `resources/templates/` + `company-data/templates/skeletons/` | TemplateSelector |
| Full template | `template:get` IPC | SolutionDesignView (preview) |
| Generated skeleton | `template:generate-skeleton` IPC | SkeletonEditor |
| Persisted skeleton edits | `template:persist-skeleton` IPC | SolutionDesignView / SkeletonEditor |
| Scoring model | Story 2.5 analysis module data | Weight matching in template service |
| Existing proposal | `documentStore.loadDocument(projectId)` + `documentStore.content` (from Story 3.1/3.2) | has-content check + outline + word count |

---

## 8. Responsive Behavior

| Breakpoint | Template Grid | Tree Node Actions |
|------------|--------------|-------------------|
| ≥ 1200px | 3 columns | Inline on hover |
| 800-1199px | 2 columns | Inline on hover |
| < 800px | 1 column | Always visible (icon only) |

---

## 9. Accessibility

- Template cards are keyboard-navigable (Tab + Enter to select)
- Template preview panel is readable via keyboard/screen reader as a static structural preview
- Tree nodes support keyboard navigation (Arrow keys + Enter to expand/collapse)
- Color-coded weight tags also include text labels (not color-only)
- Confirm modals are focus-trapped
- Inline edit Input receives auto-focus on activation

---

## 10. Error States

| Error | Display |
|-------|---------|
| Template load failure | `Alert` type=error with "模板加载失败" + retry button |
| Skeleton generation failure | `Alert` type=error with "骨架生成失败" + retry button |
| Non-empty proposal without overwrite confirmation | Confirm modal first; if caller bypasses confirm, service returns blocking error and UI retries only after explicit user confirmation |
| Save failure | Toast notification with error message |
