# UX Specification: Story 7-1 — Mandatory Item Compliance Engine

## Overview

Three-layer compliance validation UI for mandatory bid items: real-time status bar score, export-blocking gate modal, and traceability matrix mandatory-item filter view.

## Target Components

1. **StatusBar compliance score** — integrated into existing workspace status bar
2. **ComplianceGateModal** — modal overlay during export flow
3. **TraceabilityMatrixView** — enhanced with mandatory-item filter + compliance summary

## Layout Context

Desktop viewport: 1440 x 900. These components exist within the existing 3-column workspace layout (Story 1-7).

## Screen 1: Status Bar with Compliance Score

Shows the bottom status bar of the workspace with 3 compliance score states.

### Layout
```
+---------------------------------------------------------------+
| [Workspace content area]                                       |
+---------------------------------------------------------------+
| StatusBar: [Word Count] | [合规分 92] | [Last Saved]           |
+---------------------------------------------------------------+
```

### Compliance Score States
| State | Rate | Color | Display |
|-------|------|-------|---------|
| Green | >= 80% | #52C41A | "合规分 92" with green dot |
| Orange | 60-79% | #FAAD14 | "合规分 68" with orange dot |
| Red | < 60% | #FF4D4F | "合规分 35" with red dot |
| Loading | -- | #D9D9D9 | "合规分 --" with spinner |

## Screen 2: Compliance Gate Modal (Export Blocking)

Non-dismissible modal shown when user tries to export with uncovered mandatory items.

### Layout
```
+------------------------------------------+
|  [Shield-X icon]  合规检查未通过            |
|                                          |
|  合规率: [=====------] 68%               |
|                                          |
|  以下必做项尚未覆盖：                       |
|  +--------------------------------------+|
|  | 1. 投标人需提供...  [未覆盖] (red)     ||
|  | 2. 必须包含安全...  [未覆盖] (red)     ||
|  | 3. 需提交项目...    [部分覆盖] (orange)||
|  +--------------------------------------+|
|                                          |
|  [返回修改 (Primary)]  [仍然导出 (Danger)]  |
+------------------------------------------+
```

### Interaction
- Modal: `closable=false`, `maskClosable=false`
- "返回修改": closes modal, aborts export
- "仍然导出": secondary danger confirmation, then proceeds with export
- When `canExport=true` (all covered): modal is not shown, export proceeds directly

## Screen 3: Traceability Matrix with Mandatory Filter

Enhanced matrix view with "mandatory items only" toggle and compliance summary bar.

### Layout
```
+---------------------------------------------------------------+
|  追溯矩阵                                                      |
|  [仅显示必做项 (toggle)] 必做项覆盖 8/10 ====[progress bar]==  |
|                                                                |
|  +---+--------+--------+--------+--------+                    |
|  |   | Ch.1   | Ch.2   | Ch.3   | Ch.4   |                    |
|  +---+--------+--------+--------+--------+                    |
|  |R1 | [green]| [green]|        |        |  ← covered         |
|  |R2 |        | [green]| [green]|        |  ← covered         |
|  |R3 | [red]  |        |        |        |  ← uncovered       |
|  |R4 |        |        | [orange]|       |  ← partial         |
|  +---+--------+--------+--------+--------+                    |
+---------------------------------------------------------------+
```

### Filter Toggle
- `Tag.CheckableTag` or Switch: "仅显示必做项"
- When active: filters `matrix.rows` to only mandatory-linked requirements
- Compliance summary bar: "必做项覆盖 X/Y" + progress bar

## Visual Specifications

### Typography
| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Modal title | Inter | 20px | 600 | #1F1F1F |
| Modal body text | Inter | 14px | 400 | #595959 |
| Uncovered item | Inter | 14px | 400 | #1F1F1F |
| Status badge | Inter | 12px | 600 | varies |
| Compliance score (status bar) | Inter | 12px | 600 | varies |
| Progress label | Inter | 13px | 400 | #8C8C8C |
| Matrix cell | Inter | 12px | 400 | #1F1F1F |
| Matrix header | Inter | 13px | 600 | #1F1F1F |

### Colors
| Element | Color |
|---------|-------|
| Green (covered) | #52C41A / bg #F6FFED |
| Orange (partial) | #FAAD14 / bg #FFFBE6 |
| Red (uncovered) | #FF4D4F / bg #FFF2F0 |
| Modal background | #FFFFFF |
| Modal overlay | rgba(0,0,0,0.45) |
| Progress bar track | #F0F0F0 |
| Matrix grid border | #F0F0F0 |
| Filter active | #1677FF bg #E6F4FF |

### Spacing (8px grid)
| Element | Value |
|---------|-------|
| Modal padding | 24px |
| Modal body gap | 16px |
| Item list gap | 8px |
| Status bar height | 32px |
| Summary bar padding | 12px |
| Matrix cell size | 40x32px |

## States

- **Full Compliance**: Score green, no modal on export, matrix all green with animation
- **Partial Compliance**: Score orange, modal shows partial/uncovered items
- **Low Compliance**: Score red, modal shows all uncovered items
- **Loading**: Status bar shows "--" with spinner
- **No Mandatory Items**: Score 100 (green), no modal needed
