"""Tests for figure numbering and cross-reference engine (Story 8.4)."""

from docx_renderer.engine.figure_numbering import (
    build_figure_registry,
    renumber_registry,
    replace_cross_references,
)


class TestBuildFigureRegistry:
    def test_single_chapter_numbering(self):
        lines = [
            "# Chapter 1",
            "Some text",
            "![System Arch](assets/arch.png)",
            "More text",
            "![Flow Chart](assets/flow.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 2
        assert figures[0].label == "\u56fe 1-1"
        assert figures[0].caption == "System Arch"
        assert figures[1].label == "\u56fe 1-2"
        assert figures[1].caption == "Flow Chart"

    def test_multi_chapter_numbering(self):
        lines = [
            "# Chapter 1",
            "![Fig A](assets/a.png)",
            "# Chapter 2",
            "![Fig B](assets/b.png)",
            "![Fig C](assets/c.png)",
            "# Chapter 3",
            "![Fig D](assets/d.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 4
        assert figures[0].label == "\u56fe 1-1"
        assert figures[1].label == "\u56fe 2-1"
        assert figures[2].label == "\u56fe 2-2"
        assert figures[3].label == "\u56fe 3-1"

    def test_images_before_first_h1_belong_to_implicit_chapter_1(self):
        lines = [
            "![Before H1](assets/before.png)",
            "Some text",
            "# Chapter 1",
            "![After H1](assets/after.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 2
        assert figures[0].label == "\u56fe 1-1"
        assert figures[0].caption == "Before H1"
        # First real H1 advances chapter because pre-H1 figures consumed chapter 1
        assert figures[1].label == "\u56fe 2-1"
        assert figures[1].caption == "After H1"

    def test_no_pre_h1_figures_first_chapter_is_1(self):
        """When there are no figures before the first H1, chapter numbering starts at 1."""
        lines = [
            "Some intro text",
            "# Chapter 1",
            "![First](assets/first.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].label == "\u56fe 1-1"

    def test_empty_caption_not_registered(self):
        lines = [
            "# Chapter 1",
            "![](assets/no-caption.png)",
            "![Has Caption](assets/captioned.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Has Caption"
        assert figures[0].label == "\u56fe 1-1"

    def test_no_images(self):
        lines = ["# Title", "Just text", "## Subtitle"]
        figures = build_figure_registry(lines)
        assert len(figures) == 0

    def test_chapter_resets_figure_number(self):
        lines = [
            "# Ch1",
            "![A](a.png)",
            "![B](b.png)",
            "# Ch2",
            "![C](c.png)",
        ]
        figures = build_figure_registry(lines)
        assert figures[0].label == "\u56fe 1-1"
        assert figures[1].label == "\u56fe 1-2"
        assert figures[2].label == "\u56fe 2-1"


class TestReplaceCrossReferences:
    def test_exact_match(self):
        lines = ["\u53c2\u89c1 {figref:\u7cfb\u7edf\u67b6\u6784\u56fe} \u7684\u8bbe\u8ba1\u3002"]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u7cfb\u7edf\u67b6\u6784\u56fe](assets/arch.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert result[0] == "\u53c2\u89c1 \u56fe 1-1 \u7684\u8bbe\u8ba1\u3002"
        assert len(warnings) == 0

    def test_contains_match(self):
        lines = ["\u53c2\u89c1 {figref:\u67b6\u6784} \u7684\u8bbe\u8ba1\u3002"]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u7cfb\u7edf\u67b6\u6784\u56fe](assets/arch.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert result[0] == "\u53c2\u89c1 \u56fe 1-1 \u7684\u8bbe\u8ba1\u3002"
        assert len(warnings) == 0

    def test_ambiguous_contains_match_uses_first_and_warns(self):
        lines = ["\u53c2\u89c1 {figref:\u56fe}"]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/a.png)",
            "![\u6d41\u7a0b\u56fe](assets/b.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert "\u56fe 1-1" in result[0]
        assert len(warnings) == 1
        assert "\u5339\u914d\u4e0d\u552f\u4e00" in warnings[0]

    def test_no_match_keeps_original_and_warns(self):
        lines = ["\u53c2\u89c1 {figref:\u4e0d\u5b58\u5728\u7684\u56fe}"]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/a.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert result[0] == "\u53c2\u89c1 {figref:\u4e0d\u5b58\u5728\u7684\u56fe}"
        assert len(warnings) == 1
        assert "\u672a\u5339\u914d" in warnings[0]

    def test_forward_reference(self):
        """Reference appears before the figure in the document."""
        lines_for_registry = [
            "\u53c2\u89c1 {figref:\u67b6\u6784\u56fe}",
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/arch.png)",
        ]
        figures = build_figure_registry(lines_for_registry)
        warnings: list[str] = []
        result = replace_cross_references(lines_for_registry, figures, warnings)
        assert "\u56fe 1-1" in result[0]
        assert len(warnings) == 0

    def test_multiple_refs_in_one_line(self):
        lines = ["\u89c1 {figref:A\u56fe} \u548c {figref:B\u56fe}"]
        figures = build_figure_registry([
            "# Ch1",
            "![A\u56fe](a.png)",
            "![B\u56fe](b.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert "\u56fe 1-1" in result[0]
        assert "\u56fe 1-2" in result[0]

    def test_no_figref_passes_through(self):
        lines = ["Normal text without references."]
        result = replace_cross_references(lines, [], [])
        assert result[0] == "Normal text without references."


class TestFencedCodeBlockSkipping:
    """Images and figrefs inside fenced code blocks must be ignored."""

    def test_image_in_code_block_not_registered(self):
        lines = [
            "# Chapter 1",
            "```markdown",
            "![Fake](assets/fake.png)",
            "```",
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_image_in_tilde_code_block_not_registered(self):
        lines = [
            "# Chapter 1",
            "~~~",
            "![Fake](assets/fake.png)",
            "~~~",
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_figref_in_code_block_not_replaced(self):
        lines = [
            "```",
            "See {figref:\u67b6\u6784\u56fe} for details",
            "```",
            "Real ref: {figref:\u67b6\u6784\u56fe}",
        ]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/arch.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        # Inside code block: untouched
        assert "{figref:\u67b6\u6784\u56fe}" in result[1]
        # Outside code block: replaced
        assert "\u56fe 1-1" in result[3]
        assert len(warnings) == 0

    def test_mixed_code_blocks_and_real_images(self):
        """The exact reproduction from the finding:
        fenced + ![Fake] + fenced + ![Real] should give Real=\u56fe 1-1 only."""
        lines = [
            "# Chapter 1",
            "```",
            "![Fake](assets/fake.png)",
            "```",
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_longer_closing_fence_accepted(self):
        """A closing fence longer than the opening fence should close the block."""
        lines = [
            "# Chapter 1",
            "```",
            "![Fake](assets/fake.png)",
            "````",
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_longer_closing_fence_cross_ref(self):
        """Cross-reference replacement must also handle longer closing fences."""
        lines = [
            "```",
            "See {figref:\u67b6\u6784\u56fe} in code",
            "````",
            "Real ref: {figref:\u67b6\u6784\u56fe}",
        ]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/arch.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        assert "{figref:\u67b6\u6784\u56fe}" in result[1]
        assert "\u56fe 1-1" in result[3]

    def test_escaped_bracket_in_caption(self):
        """Captions with escaped ] should be parsed and unescaped correctly."""
        lines = [
            "# Chapter 1",
            r"![A\]B](assets/ab.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "A]B"

    def test_h1_inside_code_block_not_counted(self):
        lines = [
            "# Chapter 1",
            "![A](a.png)",
            "```",
            "# Not a real heading",
            "```",
            "![B](b.png)",
        ]
        figures = build_figure_registry(lines)
        # Both should be chapter 1 — the code block H1 must not increment chapter
        assert len(figures) == 2
        assert figures[0].label == "\u56fe 1-1"
        assert figures[1].label == "\u56fe 1-2"

    def test_indented_closing_fence_4_spaces_not_closing(self):
        """CommonMark: closing fence with 4+ spaces indentation is NOT a closing fence.
        Reproduction from finding: ['```','    ```','![Fake]','```','![Real]']
        """
        lines = [
            "```",
            "    ```",       # 4 spaces — content, NOT a closing fence
            "![Fake](assets/fake.png)",
            "```",           # real closing fence (0 spaces)
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_indented_closing_fence_3_spaces_is_closing(self):
        """CommonMark: closing fence with up to 3 spaces indentation IS a valid closing fence."""
        lines = [
            "```",
            "   ```",       # 3 spaces — valid closing fence
            "![Real](assets/real.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 1
        assert figures[0].caption == "Real"
        assert figures[0].label == "\u56fe 1-1"

    def test_indented_fence_figref_not_replaced(self):
        """figref inside code block with indented non-closing fence must not be replaced."""
        lines = [
            "```",
            "    ```",
            "{figref:\u67b6\u6784\u56fe}",
            "```",
            "Real ref: {figref:\u67b6\u6784\u56fe}",
        ]
        figures = build_figure_registry([
            "# Chapter 1",
            "![\u67b6\u6784\u56fe](assets/arch.png)",
        ])
        warnings: list[str] = []
        result = replace_cross_references(lines, figures, warnings)
        # Line inside code block: untouched
        assert "{figref:\u67b6\u6784\u56fe}" in result[2]
        # Line outside code block: replaced
        assert "\u56fe 1-1" in result[4]


class TestRenumberRegistry:
    """Tests for renumber_registry after pruning invalid entries."""

    def test_renumber_after_removing_first(self):
        """Removing the first figure should shift the second to 1-1."""
        lines = [
            "# Ch1",
            "![A](a.png)",
            "![B](b.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 2
        # Simulate pruning: remove the first entry (A)
        survivors = [figures[1]]
        renumber_registry(survivors)
        assert survivors[0].figure_number == 1
        assert survivors[0].label == "\u56fe 1-1"

    def test_renumber_across_chapters(self):
        """After pruning, each chapter re-numbers independently."""
        lines = [
            "# Ch1",
            "![A](a.png)",
            "![B](b.png)",
            "# Ch2",
            "![C](c.png)",
            "![D](d.png)",
        ]
        figures = build_figure_registry(lines)
        assert len(figures) == 4
        # Prune A (ch1) and C (ch2)
        survivors = [figures[1], figures[3]]  # B and D
        renumber_registry(survivors)
        assert survivors[0].label == "\u56fe 1-1"  # B
        assert survivors[1].label == "\u56fe 2-1"  # D

    def test_renumber_empty_list(self):
        """Renumbering an empty list should be a no-op."""
        result = renumber_registry([])
        assert result == []

    def test_renumber_no_pruning_is_idempotent(self):
        """Renumbering without any pruning should produce the same labels."""
        lines = [
            "# Ch1",
            "![A](a.png)",
            "![B](b.png)",
        ]
        figures = build_figure_registry(lines)
        original_labels = [f.label for f in figures]
        renumber_registry(figures)
        assert [f.label for f in figures] == original_labels
