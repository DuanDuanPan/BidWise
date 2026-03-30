# UX Design Spec: Story 3.2 - Editor Workspace & Document Outline

**Story:** 3-2-editor-workspace-doc-outline
**Date:** 2026-03-30
**Status:** Design

---

## 1. Overview

This story integrates the Plate rich-text editor into the project workspace's main content area during the "Proposal Writing" SOP stage, adds a real-time document outline tree for chapter navigation, and provides a live word count in the status bar.

### Target User

- **Persona:** Li Gong (售前工程师, 28y, 2yr pre-sales experience)
- **Context:** Editing 50-100+ page proposals, managing 2-3 concurrent bids
- **Core Need:** Fast chapter navigation in long documents, real-time progress feedback

---

## 2. Information Architecture

```
ProjectWorkspace (3-column layout from Story 1.7)
├── SOP ProgressBar (48px, fixed top)
├── WorkspaceLayout
│   ├── OutlinePanel (240px, collapsible)    ← THIS STORY fills content
│   │   ├── Panel Header: "文档大纲"
│   │   └── DocumentOutlineTree (Ant Design Tree)
│   │       ├── H1 nodes (top-level)
│   │       │   ├── H2 nodes (nested)
│   │       │   │   ├── H3 nodes
│   │       │   │   └── H4 nodes
│   │       │   └── ...
│   │       └── Empty State: "开始撰写后，文档大纲将自动生成"
│   ├── MainContent (flex, min 600px)        ← THIS STORY embeds editor
│   │   └── EditorView
│   │       └── PlateEditor (Markdown WYSIWYG)
│   └── AnnotationPanel (320px, collapsible)
│       └── (placeholder — future stories)
└── StatusBar (32px, fixed bottom)           ← THIS STORY adds word count
    ├── Left cluster: Current Stage Name + AutoSaveIndicator
    └── Right cluster: Word Count "字数 3,842" + Compliance Score "--" + Quality Score "--"
```

---

## 3. Screen States

### State 1: Proposal Writing — Normal (with content)

- **Trigger:** User navigates to "方案撰写" SOP stage with an existing proposal
- **OutlinePanel:** Shows hierarchical outline tree (H1-H4) with connecting lines
- **MainContent:** PlateEditor loaded with proposal.md content
- **StatusBar:** Shows live character count (Chinese character-based)

### State 2: Proposal Writing — Empty Document

- **Trigger:** New project, first time entering "方案撰写" stage
- **OutlinePanel:** Empty state message centered: "开始撰写后，文档大纲将自动生成"
- **MainContent:** PlateEditor with placeholder text
- **StatusBar:** "字数 0"

### State 3: Other SOP Stage (Non-editing)

- **Trigger:** User is on any stage other than "方案撰写"
- **OutlinePanel:** Default placeholder (as per Story 1.7)
- **MainContent:** StageGuidePlaceholder (as per Story 1.7)
- **StatusBar:** Word count hidden ("字数 --")

### State 4: Outline Panel Collapsed

- **Trigger:** User clicks collapse toggle (Cmd/Ctrl + \)
- **OutlinePanel:** Reuses the existing Story 1.7 collapsed shell (40px expand strip in implementation)
- **MainContent:** Expands to fill available space
- **Transition:** Smooth 200ms ease-in-out

---

## 4. Interaction Patterns

### 4.1 Outline Navigation (Click-to-Scroll)

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | Click outline node | Highlight selected node with brand-bg color |
| 2 | — | Editor smooth-scrolls to matching heading |
| 3 | — | Editor focus is preserved; outline selection remains visible |

- **Scroll behavior:** `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- **Matching:** `data-heading-text` attribute on H1-H4 elements
- **Duplicate titles:** Resolved by DOM order + same-title occurrence index, not by "first match wins"

### 4.2 Outline Auto-Sync

| Trigger | Latency | Behavior |
|---------|---------|----------|
| User edits heading text | ≤500ms | Outline tree updates title in-place |
| User adds new heading | ≤500ms | New node appears in correct position |
| User deletes heading | ≤500ms | Node removed from outline |

- **Pipeline:** Editor onChange → 300ms debounce serialize → documentStore.content update → useMemo recalculate outline
- **Total latency:** ~300-500ms (within AC2 requirement of 500ms)

### 4.3 Word Count Update

| Trigger | Latency | Format |
|---------|---------|--------|
| Content change | ≤1s | Chinese: character count (not word count) |
| — | — | Exact count with `zh-CN` thousands separator (e.g. `3,842`) |
| — | — | Empty → "0" |

### 4.4 Stage Switching

| From → To | EditorView | OutlinePanel | StatusBar |
|-----------|------------|--------------|-----------|
| Other → 方案撰写 | Mount, load proposal.md | Show outline tree | Show word count |
| 方案撰写 → Other | Unmount | Show default placeholder | Hide word count ("--") |
| 方案撰写 → 方案撰写 (re-enter) | Re-mount, reload content | Regenerate outline | Recalculate count |

---

## 5. Visual Design Specifications

### 5.1 Outline Panel

| Property | Value | Source |
|----------|-------|--------|
| Width | 240px (fixed, collapsible) | UX Spec §工作空间布局 |
| Background | #F5F5F5 | UX Spec §文档大纲背景 |
| Font size | 12px (text-caption) | Story spec Task 3.3 |
| Text color | var(--color-text-secondary) | Story spec Task 3.3 |
| Selected highlight | var(--color-brand-bg) | Story spec Task 3.3 |
| Tree lines | showLine enabled | Story spec Task 3.2 |
| Default expand | All nodes expanded | Story spec Task 3.2 |
| Title truncation | 30 chars + "..." | Story spec Task 3.2 |
| Design direction | Lightweight text nav, doesn't steal focus from editor | UX design challenge §长文档编辑体验 |

Implementation note:
- Outer shell geometry inherits the shipped Story 1.7 workspace shell. For this Story, the normative parts are content composition, tree behavior, and status layout; not a redefinition of the already-implemented outer panel chrome dimensions.

### 5.2 Main Content Area (Editor)

| Property | Value |
|----------|-------|
| Width | Flex (min 600px) |
| Background | #FFFFFF |
| Content max-width | 800px (reading comfort) |
| Side padding | Auto (centered) |

### 5.3 Status Bar

| Property | Value |
|----------|-------|
| Height | 32px |
| Background | Dark (matches SOP bar) |
| Word count position | Right section |
| Format | "字数 {count}" with exact count and thousands separator |

### 5.4 Empty State

| Property | Value |
|----------|-------|
| Text | "开始撰写后，文档大纲将自动生成" |
| Alignment | Centered vertically and horizontally |
| Color | var(--color-text-tertiary) |
| Font size | 13px |

---

## 6. Responsive Behavior

| Breakpoint | Width | Outline Panel Behavior |
|------------|-------|----------------------|
| Compact | <1440px | Auto-collapsed, toggle to expand |
| Standard | 1440-1920px | Visible by default |
| Widescreen | >1920px | Visible, editor content stays 800px max |

---

## 7. Accessibility

- Outline tree supports keyboard navigation (Arrow keys, Enter to select)
- Cmd/Ctrl + \ keyboard shortcut to toggle outline panel
- Screen reader: Tree nodes announce heading level and text
- Focus management: Clicking outline node doesn't steal focus from editor

---

## 8. Data Flow Diagram

```
documentStore.content (Markdown string)
       │
       ├──→ useDocumentOutline(content)
       │         │
       │         └──→ OutlineNode[] ──→ DocumentOutlineTree (Ant Design Tree)
       │                                       │
       │                                       └── onClick → scrollToHeading(containerEl, { title, occurrenceIndex })
       │                                                         │
       │                                                         └── DOM querySelectorAll + exact attribute match + scrollIntoView
       │
       ├──→ useWordCount(content)
       │         │
       │         └──→ number ──→ StatusBar.wordCount
       │
       └──→ EditorView → PlateEditor (renders content)
```

---

## 9. Prototype Screens

The following screens are prototyped in `prototype.pen`:

1. **Screen A: Full Workspace — Proposal Writing (with content)**
   - 3-column layout with outline tree, editor with sample headings, status bar with word count

2. **Screen B: Empty Document State**
   - Outline shows empty state message, editor shows placeholder

3. **Screen C: Outline Panel Collapsed**
   - 2-column layout (editor + annotation panel), wider editor area
