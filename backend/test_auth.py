from __future__ import annotations

import importlib
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


class AuthFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["REFLECTBLOCKS_DATA_DIR"] = self.temp_dir.name
        os.environ["REFLECTBLOCKS_SESSION_SECRET"] = "test-secret-that-is-long-enough-for-local-tests"
        os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
        os.environ["COOKIE_SECURE"] = "false"

        for module_name in ["backend.app", "backend.automated_evaluation", "backend.auth"]:
            sys.modules.pop(module_name, None)

        self.auth = importlib.import_module("backend.auth")
        self.app_module = importlib.import_module("backend.app")
        self.client = TestClient(self.app_module.app)

    def tearDown(self) -> None:
        self.client.close()
        self.temp_dir.cleanup()

    @staticmethod
    def google_claims(
        *,
        sub: str = "google-user-123",
        email: str = "person@example.com",
        name: str = "Test Person",
    ) -> dict[str, object]:
        return {
            "iss": "https://accounts.google.com",
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": name,
            "picture": "https://example.com/avatar.png",
        }

    def login(self, **claim_overrides: str):
        claims = self.google_claims(**claim_overrides)
        with patch.object(self.auth, "verify_google_credential", return_value=claims):
            return self.client.post(
                "/api/auth/google",
                json={"credential": "fake-google-id-token-for-tests"},
            )

    def test_first_login_creates_user_and_session(self) -> None:
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["google_id"], "google-user-123")
        self.assertIn("reflectblocks_session", self.client.cookies)

        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "person@example.com")

        db_path = Path(self.temp_dir.name) / "reflectblocks.sqlite3"
        connection = sqlite3.connect(db_path)
        try:
            row = connection.execute(
                "SELECT google_id, email FROM users"
            ).fetchone()
        finally:
            connection.close()
        self.assertEqual(row, ("google-user-123", "person@example.com"))

    def test_same_google_id_updates_user_instead_of_creating_duplicate(self) -> None:
        first = self.login()
        self.assertEqual(first.status_code, 200)

        second = self.login(email="new@example.com", name="New Name")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["user"]["email"], "new@example.com")

        db_path = Path(self.temp_dir.name) / "reflectblocks.sqlite3"
        connection = sqlite3.connect(db_path)
        try:
            count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            email = connection.execute(
                "SELECT email FROM users WHERE google_id = ?",
                ("google-user-123",),
            ).fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(count, 1)
        self.assertEqual(email, "new@example.com")

    def test_logout_clears_session(self) -> None:
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

        logout = self.client.post("/api/auth/logout")
        self.assertEqual(logout.status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_tampered_cookie_is_rejected(self) -> None:
        self.client.cookies.set("reflectblocks_session", "tampered.cookie")
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_auth_config_exposes_only_public_client_id(self) -> None:
        response = self.client.get("/api/auth/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "enabled": True,
                "googleClientId": "test-client.apps.googleusercontent.com",
            },
        )


if __name__ == "__main__":
    unittest.main()
