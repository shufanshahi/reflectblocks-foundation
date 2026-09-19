from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Cookie
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, current_user_from_cookie
from backend.reflections import DB_PATH

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

PROMPT_BEHAVIORS = {"manual", "starter"}


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


class PromptPreferences(BaseModel):
    prompt_behavior: str = Field(default="manual", max_length=30)


@router.get("", response_model=PromptPreferences)
def get_preferences(
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> PromptPreferences:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        row = connection.execute(
            "SELECT prompt_behavior FROM user_preferences WHERE user_google_id = ?",
            (user.google_id,),
        ).fetchone()
    finally:
        connection.close()
    return PromptPreferences(prompt_behavior=(row["prompt_behavior"] if row else "manual"))


@router.put("", response_model=PromptPreferences)
def save_preferences(
    body: PromptPreferences,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> PromptPreferences:
    user = current_user_from_cookie(reflectblocks_session)
    if body.prompt_behavior not in PROMPT_BEHAVIORS:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Unknown prompt behavior")

    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO user_preferences (user_google_id, prompt_behavior)
            VALUES (?, ?)
            ON CONFLICT(user_google_id) DO UPDATE SET prompt_behavior = excluded.prompt_behavior
            """,
            (user.google_id, body.prompt_behavior),
        )
        connection.commit()
    finally:
        connection.close()
    return PromptPreferences(prompt_behavior=body.prompt_behavior)
