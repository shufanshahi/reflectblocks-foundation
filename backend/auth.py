"""Google authentication foundation for ReflectBlocks.

The browser gets a Google ID token from Google Identity Services. The backend
verifies that token, uses Google's stable `sub` claim as the users table primary
key, and issues a separate signed HttpOnly ReflectBlocks session cookie.

No Google access token, refresh token, or OAuth client secret is stored.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "reflectblocks_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

DATA_DIR = Path(os.getenv("REFLECTBLOCKS_DATA_DIR", ".data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "reflectblocks.sqlite3"
SESSION_KEY_PATH = DATA_DIR / "session.key"

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _load_session_secret() -> bytes:
    configured = os.getenv("REFLECTBLOCKS_SESSION_SECRET", "").strip()
    if configured:
        return configured.encode("utf-8")

    if SESSION_KEY_PATH.exists():
        secret = SESSION_KEY_PATH.read_bytes()
        if len(secret) >= 32:
            return secret

    secret = secrets.token_bytes(32)
    SESSION_KEY_PATH.write_bytes(secret)
    try:
        SESSION_KEY_PATH.chmod(0o600)
    except OSError:
        pass
    return secret


SESSION_SECRET = _load_session_secret()


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def _db():
    connection = _connect()
    try:
        yield connection
    finally:
        connection.close()


def init_auth_db() -> None:
    with _db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                google_id   TEXT PRIMARY KEY,
                email       TEXT NOT NULL,
                name        TEXT,
                picture_url TEXT,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            )
            """
        )
        # Email/password accounts: migrate older databases in place.
        existing = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
        if "password_hash" not in existing:
            connection.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        if "date_of_birth" not in existing:
            connection.execute("ALTER TABLE users ADD COLUMN date_of_birth TEXT")
        connection.commit()


init_auth_db()


class GoogleLoginBody(BaseModel):
    credential: str = Field(min_length=20, max_length=10_000)


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    date_of_birth: str = Field(min_length=10, max_length=10)
    password: str = Field(min_length=1, max_length=200)
    confirm_password: str = Field(min_length=1, max_length=200)


class EmailLoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class PublicUser(BaseModel):
    google_id: str
    email: str
    name: str | None = None
    picture_url: str | None = None


class LoginResponse(BaseModel):
    user: PublicUser


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _create_session(google_id: str) -> str:
    issued_at = int(time.time())
    payload = f"{google_id}:{issued_at}".encode("utf-8")
    encoded_payload = _b64url_encode(payload)
    signature = hmac.new(
        SESSION_SECRET,
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_b64url_encode(signature)}"


def _read_session(token: str | None) -> str | None:
    if not token or token.count(".") != 1:
        return None

    encoded_payload, encoded_signature = token.split(".", 1)
    expected_signature = hmac.new(
        SESSION_SECRET,
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()

    try:
        supplied_signature = _b64url_decode(encoded_signature)
        if not hmac.compare_digest(expected_signature, supplied_signature):
            return None

        payload = _b64url_decode(encoded_payload).decode("utf-8")
        google_id, issued_at_text = payload.rsplit(":", 1)
        issued_at = int(issued_at_text)
    except (ValueError, UnicodeDecodeError):
        return None

    now = int(time.time())
    age = now - issued_at
    if not google_id or age < 0 or age > SESSION_MAX_AGE_SECONDS:
        return None

    return google_id


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verify a Google ID token and return its claims.

    Imports google-auth lazily so local unit tests can mock this boundary without
    contacting Google. In the real app, `google-auth` must be installed.
    """

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:  # pragma: no cover - deployment/configuration failure
        raise HTTPException(
            status_code=503,
            detail="Google authentication dependency is not installed",
        ) from exc

    try:
        info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    if info.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")

    if not info.get("sub"):
        raise HTTPException(status_code=401, detail="Google credential has no subject")

    if not info.get("email") or info.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Google email is not verified")

    return info


def _row_to_user(row: sqlite3.Row) -> PublicUser:
    return PublicUser(
        google_id=row["google_id"],
        email=row["email"],
        name=row["name"],
        picture_url=row["picture_url"],
    )


def get_user(google_id: str) -> PublicUser | None:
    with _db() as connection:
        row = connection.execute(
            """
            SELECT google_id, email, name, picture_url
            FROM users
            WHERE google_id = ?
            """,
            (google_id,),
        ).fetchone()
    return _row_to_user(row) if row else None


def _upsert_google_user(info: dict[str, Any]) -> PublicUser:
    google_id = str(info["sub"])
    email = str(info["email"])
    name = str(info["name"]) if info.get("name") else None
    picture_url = str(info["picture"]) if info.get("picture") else None
    now = int(time.time())

    with _db() as connection:
        connection.execute(
            """
            INSERT INTO users (
                google_id,
                email,
                name,
                picture_url,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                picture_url = excluded.picture_url,
                updated_at = excluded.updated_at
            """,
            (google_id, email, name, picture_url, now, now),
        )
        connection.commit()

    user = get_user(google_id)
    if user is None:
        raise HTTPException(status_code=500, detail="Could not create user")
    return user


def _set_session_cookie(response: Response, google_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=_create_session(google_id),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
    )


def current_user_from_cookie(token: str | None) -> PublicUser:
    google_id = _read_session(token)
    if not google_id:
        raise HTTPException(status_code=401, detail="Not signed in")

    user = get_user(google_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


@router.get("/config")
def auth_config() -> dict[str, str | bool]:
    # OAuth client IDs are public identifiers. The client secret is never exposed.
    return {
        "enabled": bool(GOOGLE_CLIENT_ID),
        "googleClientId": GOOGLE_CLIENT_ID,
    }


@router.post("/google", response_model=LoginResponse)
def google_login(body: GoogleLoginBody, response: Response) -> LoginResponse:
    info = verify_google_credential(body.credential)
    user = _upsert_google_user(info)
    _set_session_cookie(response, user.google_id)
    return LoginResponse(user=user)


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 6
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return f"scrypt${_b64url_encode(salt)}${_b64url_encode(digest)}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, salt_text, digest_text = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = _b64url_decode(digest_text)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_b64url_decode(salt_text),
            n=_SCRYPT_N,
            r=_SCRYPT_R,
            p=_SCRYPT_P,
        )
    except ValueError:
        return False
    return hmac.compare_digest(digest, expected)


@router.post("/register", response_model=LoginResponse, status_code=201)
def register(body: RegisterBody, response: Response) -> LoginResponse:
    name = body.name.strip()
    email = body.email.strip().lower()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    try:
        dob = date.fromisoformat(body.date_of_birth)
    except ValueError:
        raise HTTPException(status_code=422, detail="Enter a valid date of birth") from None
    if dob >= date.today() or dob.year < 1900:
        raise HTTPException(status_code=422, detail="Enter a valid date of birth")
    if len(body.password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters long",
        )
    if not (re.search(r"[A-Za-z]", body.password) and re.search(r"\d", body.password)):
        raise HTTPException(
            status_code=422, detail="Password must include at least one letter and one number"
        )
    if body.password != body.confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")

    user_id = f"local:{secrets.token_hex(16)}"
    now = int(time.time())
    with _db() as connection:
        taken = connection.execute(
            "SELECT 1 FROM users WHERE lower(email) = ?", (email,)
        ).fetchone()
        if taken:
            raise HTTPException(
                status_code=409, detail="An account with this email already exists"
            )
        connection.execute(
            """
            INSERT INTO users (
                google_id, email, name, picture_url, created_at, updated_at,
                password_hash, date_of_birth
            )
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
            """,
            (user_id, email, name, now, now, _hash_password(body.password), dob.isoformat()),
        )
        connection.commit()

    user = get_user(user_id)
    if user is None:
        raise HTTPException(status_code=500, detail="Could not create user")
    _set_session_cookie(response, user.google_id)
    return LoginResponse(user=user)


@router.post("/login", response_model=LoginResponse)
def email_login(body: EmailLoginBody, response: Response) -> LoginResponse:
    email = body.email.strip().lower()
    with _db() as connection:
        row = connection.execute(
            "SELECT google_id, password_hash FROM users WHERE lower(email) = ? AND password_hash IS NOT NULL",
            (email,),
        ).fetchone()
    # Verify even when no row matched so timing does not reveal whether the email exists.
    stored = row["password_hash"] if row else None
    valid = _verify_password(body.password, stored or "scrypt$AA$AA")
    if not row or not valid:
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    user = get_user(row["google_id"])
    if user is None:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    _set_session_cookie(response, user.google_id)
    return LoginResponse(user=user)


@router.get("/me", response_model=PublicUser)
def me(
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> PublicUser:
    return current_user_from_cookie(reflectblocks_session)


@router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
    )
    response.status_code = 204
    return response
