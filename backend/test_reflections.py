from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


class DrawioReflectionMilestoneTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["REFLECTBLOCKS_DATA_DIR"] = self.temp_dir.name
        os.environ["REFLECTBLOCKS_SESSION_SECRET"] = "test-secret-that-is-long-enough-for-local-tests"
        os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ.pop("GEMINI_API_KEY", None)

        for module_name in ["backend.app", "backend.automated_evaluation", "backend.ai", "backend.reflections", "backend.auth"]:
            sys.modules.pop(module_name, None)

        self.auth = importlib.import_module("backend.auth")
        self.ai = importlib.import_module("backend.ai")
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

    def create_reflection(self, thought: str = "I felt nervous during my presentation.") -> str:
        response = self.client.post("/api/reflections", json={"quick_thought": thought})
        self.assertEqual(response.status_code, 200)
        return response.json()["id"]

    @staticmethod
    def blocks() -> list[dict[str, object]]:
        return [
            {
                "id": "situation-instance",
                "library_block_id": "situation-1",
                "category": "situation",
                "question": "What happened?",
                "answer": "I presented my project.",
                "position_x": -250,
                "position_y": 50,
                "order_index": 0,
            },
            {
                "id": "feelings-instance",
                "library_block_id": "feelings-1",
                "category": "feelings",
                "question": "How did you feel in the moment?",
                "answer": "Nervous at first.",
                "position_x": 180,
                "position_y": -180,
                "order_index": 1,
            },
            {
                "id": "learning-instance",
                "library_block_id": "learning-1",
                "category": "learning",
                "question": "What did you learn from this?",
                "answer": "I was more prepared than I thought.",
                "position_x": 420,
                "position_y": 344,
                "order_index": 2,
            },
        ]

    def test_create_list_and_load_reflection(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        history = self.client.get("/api/reflections")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.json()), 1)
        detail = self.client.get(f"/api/reflections/{reflection_id}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["blocks"], [])
        self.assertEqual(detail.json()["connections"], [])

    def test_save_ports_richer_relationships_and_negative_coordinates(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        connections = [
            {
                "id": "connection-1",
                "source_block_id": "situation-instance",
                "target_block_id": "feelings-instance",
                "relation_type": "triggered",
                "source_port": "right",
                "target_port": "bottom",
                "relation_label": None,
            },
            {
                "id": "connection-2",
                "source_block_id": "situation-instance",
                "target_block_id": "learning-instance",
                "relation_type": "custom",
                "source_port": "bottom",
                "target_port": "left",
                "relation_label": "changed how I see",
            },
        ]
        saved = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={"blocks": self.blocks(), "connections": connections},
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["blocks"][0]["position_x"], -250.0)
        self.assertEqual(saved.json()["connections"][0]["source_port"], "right")
        self.assertEqual(saved.json()["connections"][1]["relation_label"], "changed how I see")

    def test_cycles_are_allowed_for_reflection_feedback_loops(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        response = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={
                "blocks": self.blocks(),
                "connections": [
                    {
                        "id": "a-b",
                        "source_block_id": "situation-instance",
                        "target_block_id": "feelings-instance",
                        "relation_type": "made_me_feel",
                    },
                    {
                        "id": "b-a",
                        "source_block_id": "feelings-instance",
                        "target_block_id": "situation-instance",
                        "relation_type": "influenced",
                    },
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["connections"]), 2)

    def test_workspace_rejects_unknown_port_and_custom_without_label(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        bad_port = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={
                "blocks": self.blocks(),
                "connections": [{
                    "id": "bad-port",
                    "source_block_id": "situation-instance",
                    "target_block_id": "feelings-instance",
                    "relation_type": "led_to",
                    "source_port": "corner",
                    "target_port": "left",
                }],
            },
        )
        self.assertEqual(bad_port.status_code, 400)

        bad_custom = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={
                "blocks": self.blocks(),
                "connections": [{
                    "id": "bad-custom",
                    "source_block_id": "situation-instance",
                    "target_block_id": "feelings-instance",
                    "relation_type": "custom",
                    "relation_label": "",
                }],
            },
        )
        self.assertEqual(bad_custom.status_code, 400)

    def test_users_cannot_read_or_overwrite_each_others_maps(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection("A private thought")
        self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={"blocks": self.blocks(), "connections": []},
        )

        self.client.cookies.clear()
        self.login("user-b", "b@example.com")
        self.assertEqual(self.client.get(f"/api/reflections/{reflection_id}").status_code, 404)
        overwrite = self.client.put(
            f"/api/reflections/{reflection_id}/workspace",
            json={"blocks": self.blocks(), "connections": []},
        )
        self.assertEqual(overwrite.status_code, 404)
        self.assertEqual(self.client.get("/api/reflections").json(), [])

    def test_ai_config_does_not_expose_api_key(self) -> None:
        response = self.client.get("/api/ai/config")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload["enabled"], bool)
        self.assertNotIn("apiKey", payload)
        self.assertNotIn("GEMINI_API_KEY", payload)
        self.assertNotIn("GOOGLE_API_KEY", payload)

    def test_journal_endpoint_sends_only_explicitly_selected_blocks(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection("Quick thought that is not selected")
        selected = self.blocks()[0]
        captured: dict[str, object] = {}

        def fake_generate(context, api_key, model):
            captured["context"] = context
            captured["api_key"] = api_key
            captured["model"] = model
            return self.ai.JournalBundle(
                title="Presentation reflection",
                paragraphs=[
                    self.ai.JournalParagraph(
                        id="p1",
                        text="I presented my project.",
                        source_block_ids=["situation-instance"],
                        uses_quick_thought=False,
                    )
                ],
            )

        with patch.object(
            self.ai,
            "_runtime_settings",
            return_value=("test-key", "gemini-3.1-flash-lite", "gemini-3.8-flash", "test"),
        ), patch.object(self.ai, "_generate_journal", side_effect=fake_generate):
            response = self.client.post(
                f"/api/ai/reflections/{reflection_id}/journal",
                json={
                    "include_quick_thought": False,
                    "blocks": [selected],
                    "connections": [],
                },
            )

        self.assertEqual(response.status_code, 200)
        context = captured["context"]
        self.assertIsNone(context["quick_thought"])
        self.assertEqual([block["id"] for block in context["blocks"]], ["situation-instance"])
        self.assertEqual(context["connections"], [])
        self.assertEqual(response.json()["paragraphs"][0]["source_block_ids"], ["situation-instance"])


    def _run_journal_request_capturing_gemini_payload(self, reflection_id: str, payload: dict) -> tuple[object, list[dict]]:
        """Call the real journal endpoint with a fake Gemini SDK and record exactly what would be sent."""
        sent: list[dict] = []
        ai = self.ai

        class FakeModels:
            def generate_content(self, *, model, contents, config):
                sent.append({"model": model, "contents": contents})
                return type("Response", (), {
                    "parsed": ai.JournalBundle(
                        title="Presentation reflection",
                        paragraphs=[ai.JournalParagraph(
                            id="p1",
                            text="I presented my project.",
                            source_block_ids=["situation-instance"],
                        )],
                    ),
                    "text": "",
                })()

        class FakeClient:
            def __init__(self, api_key):
                self.models = FakeModels()

        fake_genai = type("FakeGenai", (), {"Client": FakeClient})
        fake_types = type("FakeTypes", (), {"GenerateContentConfig": lambda **kwargs: kwargs})

        with patch.object(
            ai,
            "_runtime_settings",
            return_value=("secret-test-key", "gemini-3.1-flash-lite", "gemini-3.8-flash", "test"),
        ), patch.object(ai, "_import_genai", return_value=(fake_genai, fake_types)):
            response = self.client.post(f"/api/ai/reflections/{reflection_id}/journal", json=payload)
        return response, sent

    def test_gemini_payload_contains_only_selected_blocks(self) -> None:
        """R7/R10: verify the text handed to the Gemini SDK, not just the intermediate context."""
        self.login("user-a", "a@example.com")
        # A previous entry with distinctive text that must never reach the provider.
        self.create_reflection("PREVIOUS-ENTRY-SECRET about my old job")
        reflection_id = self.create_reflection("UNSELECTED-QUICK-THOUGHT")
        all_blocks = self.blocks()
        selected = all_blocks[0]
        unselected = all_blocks[1:]

        connections = [
            {
                "id": "conn-selected-unselected",
                "source_block_id": "situation-instance",
                "target_block_id": "feelings-instance",
                "relation_type": "led_to",
                "relation_label": "LEAKY-RELATION-LABEL",
            }
        ]

        response, sent = self._run_journal_request_capturing_gemini_payload(
            reflection_id,
            {"include_quick_thought": False, "blocks": [selected], "connections": connections},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(sent), 1)
        contents = sent[0]["contents"]

        self.assertIn(selected["answer"], contents)
        self.assertIn(selected["question"], contents)
        for block in unselected:
            self.assertNotIn(block["answer"], contents)
            self.assertNotIn(block["question"], contents)
            self.assertNotIn(block["id"], contents)
        self.assertNotIn("UNSELECTED-QUICK-THOUGHT", contents)
        self.assertNotIn("PREVIOUS-ENTRY-SECRET", contents)
        self.assertNotIn("LEAKY-RELATION-LABEL", contents)
        self.assertNotIn("a@example.com", contents)
        self.assertNotIn("secret-test-key", contents)

    def test_gemini_payload_includes_quick_thought_only_when_selected(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection("OPT-IN-QUICK-THOUGHT")
        selected = self.blocks()[0]

        for include, expect in ((False, False), (True, True)):
            response, sent = self._run_journal_request_capturing_gemini_payload(
                reflection_id,
                {"include_quick_thought": include, "blocks": [selected], "connections": []},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual("OPT-IN-QUICK-THOUGHT" in sent[0]["contents"], expect)

    def test_gemini_payload_includes_selected_connections_between_selected_blocks(self) -> None:
        self.login("user-a", "a@example.com")
        reflection_id = self.create_reflection()
        first, second = self.blocks()[:2]
        response, sent = self._run_journal_request_capturing_gemini_payload(
            reflection_id,
            {
                "include_quick_thought": False,
                "blocks": [first, second],
                "connections": [
                    {
                        "id": "c1",
                        "source_block_id": first["id"],
                        "target_block_id": second["id"],
                        "relation_type": "made_me_feel",
                        "relation_label": "made me feel",
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("made me feel", sent[0]["contents"])
        self.assertNotIn(self.blocks()[2]["answer"], sent[0]["contents"])


if __name__ == "__main__":
    unittest.main()
