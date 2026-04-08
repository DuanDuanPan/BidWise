from fastapi.testclient import TestClient


def test_shutdown_returns_accepted(client: TestClient):
    response = client.post("/api/shutdown")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["accepted"] is True
