"""Performance test: 100-page Markdown rendering under 30 seconds."""

import time

import pytest
from fastapi.testclient import TestClient

from docx_renderer.app import create_app


def _generate_100_page_markdown() -> str:
    """Generate deterministic 100-page Markdown content using headers, paragraphs, tables, and lists."""
    sections = []
    for page in range(1, 101):
        sections.append(f"# 第 {page} 章 标题\n")
        sections.append(f"## {page}.1 子标题\n")
        # Paragraph with inline formatting
        sections.append(
            f"这是第 {page} 章的正文内容。包含 **加粗** 和 *斜体* 以及 `行内代码`。\n"
        )
        # Table
        sections.append("| 列A | 列B | 列C |")
        sections.append("| --- | --- | --- |")
        for row in range(3):
            sections.append(f"| 数据{page}-{row}-A | 数据{page}-{row}-B | 数据{page}-{row}-C |")
        sections.append("")
        # Bullet list
        for item in range(3):
            sections.append(f"- 要点 {page}.{item}")
        sections.append("")
        # Ordered list
        for item in range(1, 4):
            sections.append(f"{item}. 步骤 {page}.{item}")
        sections.append("")
        # Code block
        sections.append("```python")
        sections.append(f"def chapter_{page}():")
        sections.append(f'    return "第{page}章"')
        sections.append("```")
        sections.append("")

    return "\n".join(sections)


@pytest.fixture()
def perf_client() -> TestClient:
    app = create_app()
    return TestClient(app)


def test_render_100_pages_under_30s(perf_client: TestClient, tmp_path):
    """AC2: 100-page proposal renders in under 30 seconds."""
    output_path = str(tmp_path / "perf-output.docx")
    markdown = _generate_100_page_markdown()

    start = time.perf_counter()
    response = perf_client.post(
        "/api/render-documents",
        json={
            "markdownContent": markdown,
            "outputPath": output_path,
            "projectId": "perf-test",
        },
    )
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert elapsed < 30, f"Render took {elapsed:.2f}s, exceeds 30s threshold"
    # Also verify renderTimeMs is reported
    assert body["data"]["renderTimeMs"] > 0
