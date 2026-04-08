from fastapi.testclient import TestClient


def test_health_returns_correct_format(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
    assert "uptimeSeconds" in data
    assert isinstance(data["uptimeSeconds"], (int, float))


def test_health_uses_camel_case(client: TestClient):
    response = client.get("/api/health")
    body = response.json()
    data = body["data"]
    assert "uptimeSeconds" in data
    assert "uptime_seconds" not in data
