from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


class MilestoneFiveDraftTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["REFLECTBLOCKS_DATA_DIR"] = self.temp_dir.name
        os.environ["REFLECTBLOCKS_SESSION_SECRET"] = "test-secret-that-is-long-enough-for-local-tests"
        os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
        os.environ["COOKIE_SECURE"] = "false"

        for module_name in [
            "backend.app",
            "backend.automated_evaluation",
            "backend.drafts",
            "backend.ai",
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

    def login(self, sub: str, email: str) -> None:
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

    @staticmethod
    def save_payload(text: str = "I presented my project and felt nervous at first.") -> dict:
        return {
            "model": "gemini-3.1-flash-lite",
            "title": "Presentation reflection",
            "paragraphs": [
                {
                    "id": "p1",
                    "text": text,
                    "sources": [
                        {
                            "kind": "quick_thought",
                            "block_id": None,
                            "category": None,
                            "question": None,
                            "text": "Client copy is ignored for the quick thought.",
                        },
                        {
                            "kind": "block",
                            "block_id": "situation-instance",
                            "category": "situation",
                            "question": "What happened?",
                            "text": "I presented my project.",
                        },
                    ],
                }
            ],
        }

    def test_save_and_reopen_generated_entry_with_source_snapshots(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()

        saved = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=self.save_payload(),
        )
        self.assertEqual(saved.status_code, 200)
        payload = saved.json()
        self.assertEqual(payload["title"], "Presentation reflection")
        self.assertEqual(payload["paragraphs"][0]["source_block_ids"], ["situation-instance"])
        self.assertTrue(payload["paragraphs"][0]["uses_quick_thought"])
        self.assertEqual(
            payload["paragraphs"][0]["sources"][0]["text"],
            "I felt nervous during my presentation.",
        )

        reopened = self.client.get(f"/api/reflections/{reflection_id}/generated-entry")
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()["entry"]["id"], payload["id"])
        self.assertEqual(
            reopened.json()["entry"]["paragraphs"][0]["sources"][1]["text"],
            "I presented my project.",
        )

    def test_saving_edits_updates_same_generated_entry(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        first = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=self.save_payload(),
        ).json()

        second_payload = self.save_payload("I presented my project; I was nervous, but I got through it.")
        second_payload["title"] = "Edited presentation reflection"
        second = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=second_payload,
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["id"], first["id"])
        self.assertEqual(second.json()["title"], "Edited presentation reflection")
        self.assertIn("got through it", second.json()["paragraphs"][0]["text"])

    def test_generated_entry_remains_inspectable_after_blocks_are_removed(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=self.save_payload(),
        )

        cleared = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={"blocks": [], "connections": []},
        )
        self.assertEqual(cleared.status_code, 200)

        reopened = self.client.get(f"/api/reflections/{reflection_id}/generated-entry")
        self.assertEqual(reopened.status_code, 200)
        sources = reopened.json()["entry"]["paragraphs"][0]["sources"]
        self.assertEqual(sources[1]["question"], "What happened?")
        self.assertEqual(sources[1]["text"], "I presented my project.")

    def test_generated_entry_is_scoped_to_reflection_owner(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        saved = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=self.save_payload(),
        )
        self.assertEqual(saved.status_code, 200)

        self.client.cookies.clear()
        self.login("user-b", "b@example.com")
        self.assertEqual(
            self.client.get(f"/api/reflections/{reflection_id}/generated-entry").status_code,
            404,
        )
        self.assertEqual(
            self.client.put(
                f"/api/reflections/{reflection_id}/generated-entry",
                json=self.save_payload(),
            ).status_code,
            404,
        )

    def test_paragraph_without_source_is_rejected(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        payload = self.save_payload()
        payload["paragraphs"][0]["sources"] = []
        response = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=payload,
        )
        self.assertEqual(response.status_code, 422)

    def test_reflection_history_surfaces_saved_journal(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        saved = self.client.put(
            f"/api/reflections/{reflection_id}/generated-entry",
            json=self.save_payload(),
        )
        self.assertEqual(saved.status_code, 200)

        history = self.client.get("/api/reflections")
        self.assertEqual(history.status_code, 200)
        item = history.json()[0]
        self.assertEqual(item["generated_entry_title"], "Presentation reflection")
        self.assertIsInstance(item["generated_entry_updated_at"], int)


if __name__ == "__main__":
    unittest.main()
