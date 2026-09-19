from __future__ import annotations

import sqlite3
import time
import uuid

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, current_user_from_cookie
from backend.reflections import DB_PATH

router = APIRouter(prefix="/api/reflections", tags=["reflection-control"])
free_router = APIRouter(prefix="/api/free-writing", tags=["free-writing"])


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_control_db() -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS free_writing_entries (
                id TEXT PRIMARY KEY,
                reflection_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (reflection_id)
                    REFERENCES reflections(id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_free_writing_reflection
            ON free_writing_entries(reflection_id)
            """
        )
        connection.commit()
    finally:
        connection.close()


init_control_db()


class FreeWritingInput(BaseModel):
    title: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=100_000)


class NewFreeWritingInput(FreeWritingInput):
    pass


class FreeWritingEntry(BaseModel):
    id: str
    reflection_id: str
    title: str
    body: str
    created_at: int
    updated_at: int


class FreeWritingEnvelope(BaseModel):
    entry: FreeWritingEntry | None


class NewFreeWritingResponse(BaseModel):
    reflection_id: str
    entry: FreeWritingEntry


def _require_owned_reflection(
    connection: sqlite3.Connection,
    reflection_id: str,
    google_id: str,
) -> sqlite3.Row:
    row = connection.execute(
        """
        SELECT id, quick_thought, created_at, updated_at
        FROM reflections
        WHERE id = ? AND user_google_id = ?
        """,
        (reflection_id, google_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Reflection not found")
    return row


def _row_to_free_writing(row: sqlite3.Row) -> FreeWritingEntry:
    return FreeWritingEntry(
        id=row["id"],
        reflection_id=row["reflection_id"],
        title=row["title"],
        body=row["body"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _summary_from_free_writing(title: str, body: str) -> str:
    clean_title = " ".join(title.strip().split())
    if clean_title:
        return clean_title[:300]
    clean_body = " ".join(body.strip().split())
    if clean_body:
        return clean_body[:300]
    return "Free writing"


@free_router.post("", response_model=NewFreeWritingResponse)
def create_free_writing(
    body: NewFreeWritingInput,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> NewFreeWritingResponse:
    user = current_user_from_cookie(reflectblocks_session)
    if not body.title.strip() and not body.body.strip():
        raise HTTPException(status_code=400, detail="Write something before saving")

    reflection_id = str(uuid.uuid4())
    entry_id = str(uuid.uuid4())
    now = int(time.time())
    summary = _summary_from_free_writing(body.title, body.body)

    connection = _connect()
    try:
        connection.execute("BEGIN")
        connection.execute(
            """
            INSERT INTO reflections (id, user_google_id, quick_thought, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (reflection_id, user.google_id, summary, now, now),
        )
        connection.execute(
            """
            INSERT INTO free_writing_entries (id, reflection_id, title, body, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (entry_id, reflection_id, body.title.strip(), body.body, now, now),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT id, reflection_id, title, body, created_at, updated_at
            FROM free_writing_entries WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=500, detail="Could not create free-writing entry")
        return NewFreeWritingResponse(reflection_id=reflection_id, entry=_row_to_free_writing(row))
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.get("/{reflection_id}/free-writing", response_model=FreeWritingEnvelope)
def get_free_writing(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> FreeWritingEnvelope:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        row = connection.execute(
            """
            SELECT id, reflection_id, title, body, created_at, updated_at
            FROM free_writing_entries
            WHERE reflection_id = ?
            """,
            (reflection_id,),
        ).fetchone()
        return FreeWritingEnvelope(entry=_row_to_free_writing(row) if row else None)
    finally:
        connection.close()


@router.put("/{reflection_id}/free-writing", response_model=FreeWritingEntry)
def save_free_writing(
    reflection_id: str,
    body: FreeWritingInput,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> FreeWritingEntry:
    user = current_user_from_cookie(reflectblocks_session)
    if not body.title.strip() and not body.body.strip():
        raise HTTPException(status_code=400, detail="Write something before saving")

    now = int(time.time())
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        existing = connection.execute(
            "SELECT id, created_at FROM free_writing_entries WHERE reflection_id = ?",
            (reflection_id,),
        ).fetchone()
        if existing:
            entry_id = str(existing["id"])
            connection.execute(
                """
                UPDATE free_writing_entries
                SET title = ?, body = ?, updated_at = ?
                WHERE id = ?
                """,
                (body.title.strip(), body.body, now, entry_id),
            )
        else:
            entry_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO free_writing_entries (id, reflection_id, title, body, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entry_id, reflection_id, body.title.strip(), body.body, now, now),
            )

        # The home preview follows the free-writing title/first line while keeping the
        # free-writing document itself separate from the one-line capture object.
        connection.execute(
            """
            UPDATE reflections
            SET quick_thought = ?, updated_at = ?
            WHERE id = ? AND user_google_id = ?
            """,
            (_summary_from_free_writing(body.title, body.body), now, reflection_id, user.google_id),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT id, reflection_id, title, body, created_at, updated_at
            FROM free_writing_entries WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=500, detail="Could not save free-writing entry")
        return _row_to_free_writing(row)
    finally:
        connection.close()


@router.delete("/{reflection_id}/free-writing", status_code=204)
def delete_free_writing(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        connection.execute("DELETE FROM free_writing_entries WHERE reflection_id = ?", (reflection_id,))
        connection.execute(
            "UPDATE reflections SET updated_at = ? WHERE id = ? AND user_google_id = ?",
            (int(time.time()), reflection_id, user.google_id),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()


@router.delete("/{reflection_id}/workspace", status_code=204)
def delete_workspace_content(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        connection.execute("BEGIN")
        connection.execute("DELETE FROM block_connections WHERE reflection_id = ?", (reflection_id,))
        connection.execute("DELETE FROM reflection_blocks WHERE reflection_id = ?", (reflection_id,))
        connection.execute(
            "UPDATE reflections SET updated_at = ? WHERE id = ? AND user_google_id = ?",
            (int(time.time()), reflection_id, user.google_id),
        )
        connection.commit()
        return Response(status_code=204)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.delete("/{reflection_id}", status_code=204)
def delete_reflection(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        connection.execute(
            "DELETE FROM reflections WHERE id = ? AND user_google_id = ?",
            (reflection_id, user.google_id),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()
