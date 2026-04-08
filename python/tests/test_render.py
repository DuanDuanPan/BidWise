import os

from docx import Document
from fastapi.testclient import TestClient


def test_render_basic_heading(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "# Hello World",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["outputPath"] == tmp_output
    assert "renderTimeMs" in body["data"]
    assert os.path.exists(tmp_output)

    doc = Document(tmp_output)
    assert len(doc.paragraphs) == 1
    assert doc.paragraphs[0].text == "Hello World"


def test_render_paragraph(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "This is a paragraph.",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True

    doc = Document(tmp_output)
    assert doc.paragraphs[0].text == "This is a paragraph."


def test_render_unordered_list(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "- item one\n- item two",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200

    doc = Document(tmp_output)
    assert doc.paragraphs[0].text == "item one"
    assert doc.paragraphs[0].style.name == "List Bullet"


def test_render_ordered_list(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "1. first\n2. second",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200

    doc = Document(tmp_output)
    assert doc.paragraphs[0].text == "first"
    assert doc.paragraphs[0].style.name == "List Number"


def test_render_table(client: TestClient, tmp_output: str):
    md = "| A | B |\n| --- | --- |\n| 1 | 2 |"
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": md,
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200

    doc = Document(tmp_output)
    assert len(doc.tables) == 1
    table = doc.tables[0]
    assert table.cell(0, 0).text == "A"
    assert table.cell(0, 1).text == "B"
    assert table.cell(1, 0).text == "1"
    assert table.cell(1, 1).text == "2"


def test_render_template_not_found(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "# Test",
            "outputPath": tmp_output,
            "templatePath": "/nonexistent/template.docx",
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "TEMPLATE_NOT_FOUND"


def test_render_template_invalid(client: TestClient, tmp_output: str, tmp_path):
    invalid_template = str(tmp_path / "invalid.docx")
    with open(invalid_template, "w") as f:
        f.write("not a docx file")

    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "# Test",
            "outputPath": tmp_output,
            "templatePath": invalid_template,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "DOCX_TEMPLATE_INVALID"


def test_render_empty_content(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert os.path.exists(tmp_output)


def test_render_with_valid_template(client: TestClient, tmp_output: str, tmp_path):
    template_path = str(tmp_path / "template.docx")
    doc = Document()
    doc.save(template_path)

    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "# Templated",
            "outputPath": tmp_output,
            "templatePath": template_path,
            "projectId": "test-project",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True


def test_render_camel_case_response(client: TestClient, tmp_output: str):
    response = client.post(
        "/api/render-documents",
        json={
            "markdownContent": "# Test",
            "outputPath": tmp_output,
            "projectId": "test-project",
        },
    )
    body = response.json()
    data = body["data"]
    assert "outputPath" in data
    assert "renderTimeMs" in data
    assert "output_path" not in data
    assert "render_time_ms" not in data
