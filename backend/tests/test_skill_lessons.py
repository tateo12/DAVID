from fastapi.testclient import TestClient

from main import app


def test_skill_lessons_management() -> None:
    with TestClient(app) as client:
        lessons_res = client.get("/api/employees/skills/lessons")
        assert lessons_res.status_code == 200
        lessons = lessons_res.json()
        assert len(lessons) >= 1
        lesson_id = lessons[0]["id"]

        assign_res = client.post(f"/api/employees/1/skill/lessons/assign", json={"lesson_id": lesson_id})
        assert assign_res.status_code == 200
        assert assign_res.json()["status"] == "assigned"

        list_res = client.get("/api/employees/1/skill/lessons")
        assert list_res.status_code == 200
        assert any(item["lesson_id"] == lesson_id for item in list_res.json())

        complete_res = client.post(f"/api/employees/1/skill/lessons/complete", json={"lesson_id": lesson_id})
        assert complete_res.status_code == 200
        assert complete_res.json()["status"] == "completed"
