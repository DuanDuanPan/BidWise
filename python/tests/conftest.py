import pytest
from fastapi.testclient import TestClient

from docx_renderer.app import create_app


@pytest.fixture()
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


@pytest.fixture()
def tmp_output(tmp_path):
    return str(tmp_path / "output.docx")
