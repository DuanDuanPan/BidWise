"""Figure numbering and cross-reference engine for docx export (Story 8.4)."""

import re
from dataclasses import dataclass, field

_H1_PATTERN = re.compile(r"^#\s+.+$")
_IMAGE_PATTERN = re.compile(r"^!\[((?:[^\]\\]|\\.)*)\]\(([^)]+)\)\s*$")
_FIGREF_PATTERN = re.compile(r"\{figref:([^}]+)\}")
_FENCE_OPEN_PATTERN = re.compile(r"^(`{3,}|~{3,})(\w*)\s*$")


@dataclass
class FigureEntry:
    line_index: int
    caption: str
    chapter_number: int
    figure_number: int
    label: str


def build_figure_registry(lines: list[str]) -> list[FigureEntry]:
    """Scan Markdown lines and build a figure registry with chapter-based numbering.

    Rules:
    - H1 increments chapter_number and resets figure_number
    - Images before the first H1 belong to implicit chapter 1
    - Only images with non-empty captions are registered
    """
    figures: list[FigureEntry] = []
    chapter_number = 1
    figure_number = 0
    seen_real_h1 = False
    fence_marker: str | None = None  # e.g. "```" or "~~~"

    for i, line in enumerate(lines):
        # Track fenced code block state — CommonMark: closing fence must use
        # the same character as the opening and be at least as long.
        if fence_marker is not None:
            # CommonMark: closing fence may be indented 0-3 spaces only
            lstripped = line.lstrip(' ')
            indent = len(line) - len(lstripped)
            if indent <= 3:
                stripped = lstripped.rstrip()
                if (
                    len(stripped) >= len(fence_marker)
                    and stripped == fence_marker[0] * len(stripped)
                ):
                    fence_marker = None
            continue

        fence_match = _FENCE_OPEN_PATTERN.match(line)
        if fence_match:
            fence_marker = fence_match.group(1)
            continue

        if _H1_PATTERN.match(line):
            if not seen_real_h1:
                seen_real_h1 = True
                # Pre-H1 figures already consumed chapter 1 — advance to 2
                if figures:
                    chapter_number += 1
            else:
                chapter_number += 1
            figure_number = 0
            continue

        img_match = _IMAGE_PATTERN.match(line)
        if img_match:
            caption = re.sub(r"\\(.)", r"\1", img_match.group(1)).strip()
            if caption:
                figure_number += 1
                label = f"\u56fe {chapter_number}-{figure_number}"
                figures.append(
                    FigureEntry(
                        line_index=i,
                        caption=caption,
                        chapter_number=chapter_number,
                        figure_number=figure_number,
                        label=label,
                    )
                )

    return figures


def renumber_registry(figures: list[FigureEntry]) -> list[FigureEntry]:
    """Re-number figure entries after pruning invalid images.

    Preserves chapter grouping — only ``figure_number`` and ``label`` are
    recalculated; ``chapter_number`` stays unchanged because chapter
    boundaries are determined by H1 headings, not by images.
    """
    chapter_counters: dict[int, int] = {}
    for entry in figures:
        ch = entry.chapter_number
        chapter_counters[ch] = chapter_counters.get(ch, 0) + 1
        entry.figure_number = chapter_counters[ch]
        entry.label = f"\u56fe {ch}-{chapter_counters[ch]}"
    return figures


def replace_cross_references(
    lines: list[str],
    figures: list[FigureEntry],
    warnings: list[str],
) -> list[str]:
    """Replace {figref:caption text} references with actual figure labels.

    Matching priority:
    1. Exact caption match
    2. Substring (contains) match — first by document order
    3. If contains-match hits multiple figures, use first and append warning
    4. If no match at all, keep original text and append warning
    """
    result: list[str] = []
    fence_marker: str | None = None

    for line in lines:
        # Track fenced code block state — CommonMark: closing fence must use
        # the same character as the opening and be at least as long.
        if fence_marker is not None:
            result.append(line)
            # CommonMark: closing fence may be indented 0-3 spaces only
            lstripped = line.lstrip(' ')
            indent = len(line) - len(lstripped)
            if indent <= 3:
                stripped = lstripped.rstrip()
                if (
                    len(stripped) >= len(fence_marker)
                    and stripped == fence_marker[0] * len(stripped)
                ):
                    fence_marker = None
            continue

        fence_match = _FENCE_OPEN_PATTERN.match(line)
        if fence_match:
            fence_marker = fence_match.group(1)
            result.append(line)
            continue

        def _replace_ref(m: re.Match) -> str:
            ref_text = m.group(1).strip()

            # 1. Exact match
            exact = [f for f in figures if f.caption == ref_text]
            if exact:
                return exact[0].label

            # 2. Contains match
            contains = [f for f in figures if ref_text in f.caption]
            if len(contains) == 1:
                return contains[0].label
            if len(contains) > 1:
                warnings.append(
                    f"\u56fe\u8868\u5f15\u7528\u5339\u914d\u4e0d\u552f\u4e00: '{{figref:{ref_text}}}' \u5339\u914d\u4e86 {len(contains)} \u4e2a\u56fe\u8868\uff0c\u4f7f\u7528\u7b2c\u4e00\u4e2a: {contains[0].label}"
                )
                return contains[0].label

            # 3. No match
            warnings.append(f"\u56fe\u8868\u5f15\u7528\u672a\u5339\u914d: '{{figref:{ref_text}}}'")
            return m.group(0)

        result.append(_FIGREF_PATTERN.sub(_replace_ref, line))

    return result
