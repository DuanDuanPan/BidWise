# UX Specification: Story 5-3 — Terminology Library Maintenance & Auto-Application

## Overview

This specification defines the UX for the Terminology Library management interface and its integration into the asset module. Users maintain industry-specific term mappings (e.g., "设备管理" -> "装备全寿命周期管理") that are automatically applied during AI chapter generation. The design builds on the BidWise design system (Story 1.4) and the asset module structure from Stories 5.1/5.2.

Implementation alignment note:
- Story 5.3 extends the existing `/asset` route introduced in Story 5.1.
- The prototype's TopNav is global shell context for visual reference only; Story 5.3 does **not** require a new app-shell refactor.
- The route should render an `AssetModuleContainer` that switches between `AssetSearchPage` and `TerminologyPage`.

## Target Pages & Components

| Component | Location | Purpose |
|-----------|----------|---------|
| AssetModuleContainer | Asset module root | Segmented switch between 资产库 and 术语库 |
| TerminologyPage | Asset module, 术语库 tab | Full terminology CRUD with search/filter/table |
| TerminologyEntryForm | Modal overlay | Add/edit term mapping |
| TerminologyImportDialog | Modal overlay | CSV bulk import with preview |

## Screen 1: Terminology Library Management Page

### Layout

- Full workspace viewport (1440 x 900)
- Top navigation bar (48px) — shown in prototype as global shell context; not a new 5.3 implementation requirement
- Below TopNav: Segmented control bar (48px) — `资产库` | `术语库` toggle
- Main content area (remaining height):
  - Toolbar row (48px): search + filters + action buttons
  - Table body: Ant Design Table filling remaining space

### Segmented Control Specification

| Property | Value |
|----------|-------|
| Component | Ant Design `Segmented` |
| Options | `资产库`, `术语库` |
| Default | `资产库` (existing behavior preserved) |
| Position | Left-aligned, 16px padding from left edge |
| Background | `#F5F5F5` container, white active segment |

### Toolbar Specification

| Element | Component | Position | Details |
|---------|-----------|----------|---------|
| Search | `Input.Search` | Left | Placeholder: "搜索源术语或目标术语", 280px width, 300ms debounce |
| Category filter | `Select` | Left, after search | Placeholder: "全部分类", options from existing categories, 160px, clearable |
| Active-only toggle | `Switch` + label | Left, after category | Label: "仅显示启用", default ON |
| Add button | `Button` primary | Right | Label: "添加术语", icon: `plus` |
| Import button | `Button` default | Right, after add | Label: "批量导入", icon: `upload` |
| Export button | `Button` default | Right, after import | Label: "导出 JSON", icon: `download` |

### Table Specification

| Column | Width | Render |
|--------|-------|--------|
| 源术语 | 180px | Text, 14px semibold `#1F1F1F` |
| 目标术语 | 240px | Text, 14px regular `#262626` |
| 分类 | 120px | Ant Design `Tag`, gray if null |
| 状态 | 80px | `Switch`, green when active |
| 操作 | 140px | `编辑` (text link `#1677FF`) + `删除` (text link `#FF4D4F`, Popconfirm) |

| Property | Value |
|----------|-------|
| Row height | 52px |
| Sort | Default by `updatedAt` DESC |
| Empty state | Centered icon (book-open, 48px `#D9D9D9`) + "术语库暂无条目。点击"添加术语"创建第一条行业术语映射。" |
| Pagination | Bottom, 20 items/page, client-side pagination over the already-loaded filtered list |
| Row hover | `#FAFAFA` background |

### Interaction Mechanics

1. **Search**: Typing triggers 300ms debounced filter via `terminologyStore.setSearchQuery()`
2. **Category filter**: Selection triggers immediate `loadEntries()` with category constraint
3. **Active-only toggle**: Toggle triggers `setActiveOnly()` + `loadEntries()`
4. **Inline status toggle**: Clicking row Switch calls `updateEntry({ id, isActive: !current })` directly
5. **Delete**: Popconfirm "确认删除此术语映射？" -> confirmed -> `deleteEntry(id)`
6. **Export JSON**: Calls `window.api.terminologyExport()` -> main process save dialog -> writes JSON to selected path; user cancel is silent and not treated as an error

## Screen 2: Add/Edit Terminology Entry Dialog

### Trigger

- "添加术语" button -> opens in Add mode
- "编辑" text link on table row -> opens in Edit mode (pre-filled)

### Modal Specification

| Property | Value |
|----------|-------|
| Title | Add: "添加术语映射", Edit: "编辑术语映射" |
| Width | 480px |
| Corner radius | 12px |
| Shadow | `0 8px 24px rgba(0,0,0,0.15)` |
| Mask closable | Yes |

### Form Fields

| Field | Component | Placeholder | Required | Validation |
|-------|-----------|-------------|----------|------------|
| 源术语 | `Input` | "如"设备管理"" | Yes | Non-empty; duplicate check on submit |
| 目标术语 | `Input` | "如"装备全寿命周期管理"" | Yes | Non-empty |
| 分类 | `AutoComplete` | "如"军工装备"、"信息化"" | No | Options from existing categories |
| 说明 | `Input.TextArea` (3 rows) | "可选，最多 200 字" | No | Max 200 chars |

### Error States

- **Duplicate source term**: Red text below 源术语 field: "该术语已存在（已有映射：{existingTarget}）"; renderer should branch on `ErrorCode.DUPLICATE`
- **Required field empty**: Standard Ant Design form validation red border + "请输入{fieldName}"

### Actions

- Primary: "确定" (submit, closes on success)
- Secondary: "取消" (close without saving)
- Loading: Primary button shows loading spinner during API call

## Screen 3: Bulk Import Dialog

### Trigger

- "批量导入" button on toolbar

### Modal Specification

| Property | Value |
|----------|-------|
| Title | "批量导入术语" |
| Width | 640px |
| Corner radius | 12px |

### Step 1: File Upload

| Element | Specification |
|---------|---------------|
| Upload area | `Upload.Dragger`, 200px height, dashed border `#D9D9D9` |
| Accept | `.csv` files only |
| Icon | `upload-cloud` 48px `#8C8C8C` |
| Primary text | "点击或拖拽 CSV 文件到此处" (14px `#595959`) |
| Secondary text | "格式：源术语, 目标术语, 分类, 说明（分类和说明可选）" (12px `#8C8C8C`) |
| Template link | "下载模板" text link below upload area |

### Step 2: Preview (after file parsed)

| Element | Specification |
|---------|---------------|
| Preview table | 4 columns (源术语, 目标术语, 分类, 说明), max 20 rows preview |
| Row count | "{N} 条术语待导入" badge above table |
| Table height | 280px max, scrollable |
| Parse error | If CSV malformed: red Alert banner "CSV 格式错误：{detail}" |

### Step 3: Import Result

| Element | Specification |
|---------|---------------|
| Success icon | `check-circle` 48px `#52C41A` |
| Result text | "成功导入 {N} 条，跳过 {M} 条重复" (16px `#262626`) |
| Detail list | Expandable list of skipped duplicate terms (if any) |
| Close button | "完成" primary button |

### Actions

- Step 1: "取消" only (primary disabled until file selected)
- Step 2: "导入" (primary) + "重新选择" (default) + "取消"
- Step 3: "完成" (primary, closes dialog)

## Visual & Layout Constraints

- All colors from BidWise design system (Story 1.4)
- Primary blue: `#1677FF`
- Success green: `#52C41A`
- Error red: `#FF4D4F`
- Text primary: `#1F1F1F`, secondary: `#595959`, tertiary: `#8C8C8C`
- Border: `#E8E8E8` (tables), `#D9D9D9` (inputs)
- Background: `#FAFAFA` (page), `#FFFFFF` (cards/modals)
- Font: PingFang SC for Chinese, Inter for labels/numbers
- 8px spacing grid (xs=4, sm=8, md=16, lg=24, xl=32)
- Modal corner radius: 12px
- Table row height: 52px
- Button height: 32px (default), 36px (large)

## Acceptance Criteria Mapping

| AC | Screen | Key Visual Element |
|----|--------|--------------------|
| AC1 | Screen 1 + Screen 2 | Table with CRUD + modal form |
| AC2 | Screen 1 | Search box + category filter + active-only toggle |
| AC3 | (Backend) | Not directly visible; blue AI-suggestion annotations appear in editor sidebar |
| AC4 | Screen 3 | Import dialog with 3-step flow |
| AC5 | Screen 1 | "导出 JSON" button on toolbar |

## Prototype Screens

1. `Screen 1 — 术语库管理页面`: Full workspace with Segmented nav, toolbar, table with sample data. The mixed active/inactive rows in the visual sample are for status coverage reference; runtime filtering behavior still follows the `仅显示启用` switch state.
2. `Screen 2 — 添加术语映射对话框`: Modal overlay on dimmed background, form in Add mode
3. `Screen 3 — 批量导入术语对话框`: Modal overlay showing Step 2 (preview) state with sample CSV data
