from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


class MilestoneSixSevenTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["REFLECTBLOCKS_DATA_DIR"] = self.temp_dir.name
        os.environ["REFLECTBLOCKS_SESSION_SECRET"] = "test-secret-that-is-long-enough-for-local-tests"
        os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ.pop("GEMINI_API_KEY", None)

        for module_name in [
            "backend.app",
            "backend.automated_evaluation",
            "backend.evaluation",
            "backend.controls",
            "backend.drafts",
            "backend.ai",
            "backend.preferences",
            "backend.reflections",
            "backend.auth",
        ]:
            sys.modules.pop(module_name, None)

        self.auth = importlib.import_module("backend.auth")
        self.app_module = importlib.import_module("backend.app")
        self.client = TestClient(self.app_module.app)

    def tearDown(self) -> None:
        self.client.close()
        self.temp_dir.cleanup()

    def login(self, sub: str = "user-a", email: str = "a@example.com") -> None:
        claims = {
            "iss": "https://accounts.google.com",
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": email.split("@")[0],
        }
        with patch.object(self.auth, "verify_google_credential", return_value=claims):
            response = self.client.post(
                "/api/auth/google",
                json={"credential": "fake-google-id-token-for-tests"},
            )
        self.assertEqual(response.status_code, 200)

    def create_reflection(self) -> str:
        response = self.client.post(
            "/api/reflections",
            json={"quick_thought": "I felt nervous during my presentation."},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["id"]

    def save_workspace(self, reflection_id: str) -> None:
        response = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={
                "blocks": [
                    {
                        "id": "b1",
                        "library_block_id": "situation-1",
                        "category": "situation",
                        "question": "What happened?",
                        "answer": "I presented our project.",
                        "position_x": 20,
                        "position_y": 30,
                        "order_index": 0,
                    }
                ],
                "connections": [],
            },
        )
        self.assertEqual(response.status_code, 200)

    def save_journal(self, reflection_id: str) -> None:
        response = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json={
                "model": "gemini-3.1-flash-lite",
                "title": "Presentation reflection",
                "paragraphs": [
                    {
                        "id": "p1",
                        "text": "I presented our project.",
                        "sources": [
                            {
                                "kind": "block",
                                "block_id": "b1",
                                "category": "situation",
                                "question": "What happened?",
                                "text": "I presented our project.",
                            }
                        ],
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)

    def test_free_writing_create_save_history_and_delete_independently(self) -> None:
        self.login()
        created = self.client.post(
            "/api/free-writing",
            json={"title": "Untitled evening note", "body": "I just want to write without prompts."},
        )
        self.assertEqual(created.status_code, 200)
        reflection_id = created.json()["reflection_id"]

        history = self.client.get("/api/reflections")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()[0]["free_writing_title"], "Untitled evening note")

        updated = self.client.put(
            f"/api/reflections/{reflection_id}/free-writing",
            json={"title": "Evening note", "body": "Updated free writing."},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["body"], "Updated free writing.")

        deleted = self.client.delete(f"/api/reflections/{reflection_id}/free-writing")
        self.assertEqual(deleted.status_code, 204)
        reopened = self.client.get(f"/api/reflections/{reflection_id}/free-writing")
        self.assertEqual(reopened.status_code, 200)
        self.assertIsNone(reopened.json()["entry"])
        self.assertEqual(self.client.get(f"/api/reflections/{reflection_id}").status_code, 200)

    def test_generated_journal_and_blocks_can_be_deleted_independently(self) -> None:
        self.login()
        reflection_id = self.create_reflection()
        self.save_workspace(reflection_id)
        self.save_journal(reflection_id)

        delete_journal = self.client.delete(f"/api/reflections/{reflection_id}/generated-entry")
        self.assertEqual(delete_journal.status_code, 204)
        detail = self.client.get(f"/api/reflections/{reflection_id}").json()
        self.assertEqual(len(detail["blocks"]), 1)
        self.assertIsNone(self.client.get(f"/api/reflections/{reflection_id}/generated-entry").json()["entry"])

        self.save_journal(reflection_id)
        clear_blocks = self.client.delete(f"/api/reflections/{reflection_id}/workspace")
        self.assertEqual(clear_blocks.status_code, 204)
        detail = self.client.get(f"/api/reflections/{reflection_id}").json()
        self.assertEqual(detail["blocks"], [])
        self.assertIsNotNone(self.client.get(f"/api/reflections/{reflection_id}/generated-entry").json()["entry"])

    def test_delete_reflection_cascades_all_saved_forms(self) -> None:
        self.login()
        reflection_id = self.create_reflection()
        self.save_workspace(reflection_id)
        self.save_journal(reflection_id)
        self.client.put(
            f"/api/reflections/{reflection_id}/free-writing",
            json={"title": "Free", "body": "Separate free-writing text."},
        )

        response = self.client.delete(f"/api/reflections/{reflection_id}")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get(f"/api/reflections/{reflection_id}").status_code, 404)

    def test_evaluation_records_only_allowlisted_metadata_and_exports(self) -> None:
        self.login()
        start = self.client.post(
            "/api/evaluation/sessions",
            json={"participant_code": "P01", "device_type": "desktop", "consented": True},
        )
        self.assertEqual(start.status_code, 200)
        session_id = start.json()["session_id"]

        event = self.client.post(
            "/api/evaluation/events",
            json={
                "session_id": session_id,
                "event_type": "block_answered",
                "reflection_id": None,
                "metadata": {
                    "category": "feelings",
                    "char_count": 42,
                    "journal_text": "THIS MUST NOT BE STORED",
                    "answer": "NEITHER SHOULD THIS",
                },
            },
        )
        self.assertEqual(event.status_code, 204)

        complete = self.client.put(
            "/api/evaluation/sessions/complete",
            json={
                "session_id": session_id,
                "sus": [4, 2, 5, 1, 4, 2, 5, 1, 4, 2],
                "ease_rating": 4,
                "control_rating": 5,
                "privacy_clarity_rating": 4,
                "comments": "Useful study note.",
            },
        )
        self.assertEqual(complete.status_code, 204)

        exported = self.client.get(f"/api/evaluation/sessions/{session_id}/export")
        self.assertEqual(exported.status_code, 200)
        metadata = exported.json()["events"][0]["metadata"]
        self.assertEqual(metadata["category"], "feelings")
        self.assertEqual(metadata["char_count"], 42)
        self.assertNotIn("journal_text", metadata)
        self.assertNotIn("answer", metadata)


    def test_prompt_default_persists_and_applies_only_to_new_reflections(self) -> None:
        self.login()

        initial = self.client.get("/api/preferences")
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.json()["prompt_behavior"], "manual")

        saved = self.client.put("/api/preferences", json={"prompt_behavior": "starter"})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["prompt_behavior"], "starter")

        first_id = self.create_reflection()
        first = self.client.get(f"/api/reflections/{first_id}")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(
            [block["question"] for block in first.json()["blocks"]],
            ["What happened?", "How did you feel in the moment?", "Why did this matter to you?"],
        )

        second_id = self.create_reflection()
        second = self.client.get(f"/api/reflections/{second_id}")
        self.assertEqual(len(second.json()["blocks"]), 3)

        reset = self.client.put("/api/preferences", json={"prompt_behavior": "manual"})
        self.assertEqual(reset.status_code, 200)
        third_id = self.create_reflection()
        third = self.client.get(f"/api/reflections/{third_id}")
        self.assertEqual(third.json()["blocks"], [])

        # Preference changes do not retroactively alter existing reflections.
        first_again = self.client.get(f"/api/reflections/{first_id}")
        self.assertEqual(len(first_again.json()["blocks"]), 3)

    def test_table8_requirement_checks_governance_and_export(self) -> None:
        self.login()
        start = self.client.post(
            "/api/evaluation/sessions",
            json={
                "participant_code": "P45",
                "device_type": "desktop",
                "age_group": "45_59",
                "text_editing_experience": "limited",
                "consented": True,
            },
        )
        self.assertEqual(start.status_code, 200)
        session_id = start.json()["session_id"]

        check = self.client.put(
            f"/api/evaluation/sessions/{session_id}/requirements/R1",
            json={
                "status": "pass",
                "evidence": {
                    "completed": True,
                    "without_help": True,
                    "duration_ms": 4200,
                    "journal_text": "MUST NOT BE STORED",
                },
                "notes": "Participant found save immediately.",
            },
        )
        self.assertEqual(check.status_code, 204)

        governance = self.client.put(
            f"/api/evaluation/sessions/{session_id}/governance",
            json={
                "reviewer_role": "privacy reviewer",
                "data_flow_ok": True,
                "retention_ok": True,
                "processing_notice_ok": True,
                "prompt_wording_ok": True,
                "prompt_flags_count": 0,
                "notes": "No unresolved issues in this review.",
            },
        )
        self.assertEqual(governance.status_code, 204)

        protocol = self.client.get(f"/api/evaluation/sessions/{session_id}/protocol")
        self.assertEqual(protocol.status_code, 200)
        self.assertEqual(protocol.json()["requirement_checks"][0]["requirement_id"], "R1")
        self.assertEqual(protocol.json()["requirement_checks"][0]["evidence"]["duration_ms"], 4200)
        self.assertNotIn("journal_text", protocol.json()["requirement_checks"][0]["evidence"])
        self.assertEqual(protocol.json()["governance_review"]["reviewer_role"], "privacy reviewer")

        exported = self.client.get(f"/api/evaluation/sessions/{session_id}/export")
        self.assertEqual(exported.status_code, 200)
        payload = exported.json()
        self.assertEqual(payload["session"]["age_group"], "45_59")
        self.assertEqual(payload["session"]["text_editing_experience"], "limited")
        self.assertEqual(payload["requirement_checks"][0]["status"], "pass")
        self.assertTrue(payload["governance_review"]["data_flow_ok"])

    def test_automated_table8_audit_is_stored_and_uses_only_synthetic_data(self) -> None:
        self.login()

        before = self.client.get("/api/reflections")
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before.json(), [])

        response = self.client.post("/api/evaluation/automated-runs")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(len(payload["results"]), 18)
        self.assertIn(payload["overall_status"], {"technical_pass_human_followup", "pass"})

        by_id = {item["requirement_id"]: item for item in payload["results"]}
        self.assertEqual(by_id["R7"]["status"], "pass")
        self.assertEqual(by_id["R9"]["status"], "manual_required")
        self.assertEqual(by_id["R11"]["status"], "manual_required")
        self.assertEqual(by_id["R15"]["status"], "pass")
        self.assertEqual(by_id["R17"]["status"], "manual_required")
        self.assertEqual(by_id["R18"]["status"], "manual_required")

        after = self.client.get("/api/reflections")
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.json(), [])

        history = self.client.get("/api/evaluation/automated-runs")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()[0]["id"], payload["id"])

        reopened = self.client.get(f"/api/evaluation/automated-runs/{payload['id']}")
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(len(reopened.json()["results"]), 18)

        # The temporary audit identity must be deleted after the run; only the
        # signed-in test user remains.
        import sqlite3
        from pathlib import Path as _Path
        connection = sqlite3.connect(_Path(self.temp_dir.name) / "reflectblocks.sqlite3")
        try:
            users = connection.execute("SELECT google_id FROM users ORDER BY google_id").fetchall()
        finally:
            connection.close()
        self.assertEqual(users, [("user-a",)])

    def test_guided_participant_task_is_stored_under_signed_in_session(self) -> None:
        self.login(email="participant@example.com")
        start = self.client.post(
            "/api/evaluation/sessions",
            json={
                "participant_code": "P07",
                "device_type": "desktop",
                "age_group": "45_59",
                "text_editing_experience": "some",
                "consented": True,
            },
        )
        self.assertEqual(start.status_code, 200)
        session_id = start.json()["session_id"]

        task_start = self.client.post(
            f"/api/evaluation/sessions/{session_id}/guided-tasks/start",
            json={"task_id": "quick-capture", "requirement_ids": ["R1", "R9"]},
        )
        self.assertEqual(task_start.status_code, 200, task_start.text)
        self.assertEqual(task_start.json()["status"], "running")

        complete = self.client.put(
            f"/api/evaluation/sessions/{session_id}/guided-tasks/quick-capture",
            json={
                "duration_ms": 4200,
                "status": "pass",
                "objective": {
                    "completed": True,
                    "within_5s": True,
                    "duration_ms": 4200,
                    "journal_text": "MUST NOT BE STORED",
                },
                "comprehension": {"expected_behavior_correct": True},
                "reflection_id": None,
                "requirement_results": [
                    {
                        "requirement_id": "R1",
                        "status": "pass",
                        "evidence": {"completed": True, "duration_ms": 4200},
                        "notes": "Automatic guided result",
                    }
                ],
            },
        )
        self.assertEqual(complete.status_code, 200, complete.text)
        self.assertEqual(complete.json()["objective"]["duration_ms"], 4200)
        self.assertNotIn("journal_text", complete.json()["objective"])

        tasks = self.client.get(f"/api/evaluation/sessions/{session_id}/guided-tasks")
        self.assertEqual(tasks.status_code, 200)
        self.assertEqual(len(tasks.json()), 1)
        self.assertEqual(tasks.json()[0]["task_id"], "quick-capture")

        exported = self.client.get(f"/api/evaluation/sessions/{session_id}/export")
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.json()["session"]["user_email"], "participant@example.com")
        self.assertEqual(exported.json()["guided_tasks"][0]["duration_ms"], 4200)
        self.assertEqual(exported.json()["requirement_checks"][0]["requirement_id"], "R1")

    def test_evaluation_requires_explicit_consent(self) -> None:
        self.login()
        response = self.client.post(
            "/api/evaluation/sessions",
            json={"participant_code": "P01", "device_type": "desktop", "consented": False},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
