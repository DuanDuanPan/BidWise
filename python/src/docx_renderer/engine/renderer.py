import os
import re
import time
from pathlib import Path
from typing import Optional

from docx import Document
from docx.opc.exceptions import PackageNotFoundError

from docx_renderer.models.schemas import RenderResult


class RendererError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def render_markdown_to_docx(
    markdown_content: str,
    output_path: str,
    template_path: Optional[str] = None,
) -> RenderResult:
    start_time = time.perf_counter()

    if template_path:
        if not os.path.exists(template_path):
            raise RendererError("TEMPLATE_NOT_FOUND", f"Template not found: {template_path}")
        try:
            doc = Document(template_path)
        except (PackageNotFoundError, Exception) as e:
            raise RendererError(
                "DOCX_TEMPLATE_INVALID", f"Invalid docx template: {template_path}: {e}"
            ) from e
    else:
        doc = Document()

    _parse_markdown(doc, markdown_content)

    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    doc.save(output_path)

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    return RenderResult(
        output_path=output_path,
        render_time_ms=round(elapsed_ms, 2),
    )


def _parse_markdown(doc: Document, content: str) -> None:
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        # Headings
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            doc.add_heading(text, level=level)
            i += 1
            continue

        # Table detection
        if "|" in line and i + 1 < len(lines) and re.match(r"^\s*\|[\s\-:|]+\|\s*$", lines[i + 1]):
            table_lines = []
            while i < len(lines) and "|" in lines[i]:
                table_lines.append(lines[i])
                i += 1
            _parse_table(doc, table_lines)
            continue

        # Unordered list
        ul_match = re.match(r"^\s*[-*]\s+(.+)$", line)
        if ul_match:
            doc.add_paragraph(ul_match.group(1), style="List Bullet")
            i += 1
            continue

        # Ordered list
        ol_match = re.match(r"^\s*\d+\.\s+(.+)$", line)
        if ol_match:
            doc.add_paragraph(ol_match.group(1), style="List Number")
            i += 1
            continue

        # Empty line — skip
        if line.strip() == "":
            i += 1
            continue

        # Normal paragraph
        doc.add_paragraph(line)
        i += 1


def _parse_table(doc: Document, table_lines: list[str]) -> None:
    rows = []
    for idx, line in enumerate(table_lines):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if idx == 1:
            # Skip separator row
            continue
        rows.append(cells)

    if not rows:
        return

    num_cols = len(rows[0])
    table = doc.add_table(rows=len(rows), cols=num_cols)
    for row_idx, row_data in enumerate(rows):
        for col_idx, cell_text in enumerate(row_data):
            if col_idx < num_cols:
                table.cell(row_idx, col_idx).text = cell_text
