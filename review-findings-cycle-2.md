# Code Review Findings — Story 1-6 — Cycle 2

## Review Context

- Story: 1-6 SOP Navigation
- Review Cycle: 2
- Remaining from R1: 2 Low-severity items (4/6 fixed in cycle 1)

## Must-Fix Items

None — all remaining items are Low severity.

## Should-Fix Items

### [Low] Hardcoded colors in ProjectCard/Kanban/Workspace

- Location: ProjectCard.tsx, KanbanBoard.tsx, Workspace.tsx
- Issue: CSS color values are hardcoded instead of using Tailwind design tokens or theme variables
- Fix: Replace hardcoded hex/rgb colors with Tailwind utility classes or CSS custom properties from the design system

### [Low] MoreOutlined missing aria-label

- Location: ProjectCard.tsx (or wherever MoreOutlined icon is used)
- Issue: The MoreOutlined (three-dot menu) icon button lacks an aria-label for screen readers
- Fix: Add aria-label="更多操作" (or similar descriptive label) to the button wrapping the MoreOutlined icon

## Optional Items

None.
