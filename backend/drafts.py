from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, current_user_from_cookie
from backend.reflections import DB_PATH

router = APIRouter(prefix="/api/reflections", tags=["generated-entry"])


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_generated_entry_db() -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS generated_entries (
                id TEXT PRIMARY KEY,
                reflection_id TEXT NOT NULL UNIQUE,
                model TEXT NOT NULL,
                title TEXT NOT NULL,
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
            CREATE TABLE IF NOT EXISTS generated_entry_paragraphs (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL,
                position_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                source_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (entry_id)
                    REFERENCES generated_entries(id)
                    ON DELETE CASCADE,
                UNIQUE (entry_id, position_index)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_generated_entry_paragraphs_entry
            ON generated_entry_paragraphs(entry_id, position_index)
            """
        )
        connection.commit()
    finally:
        connection.close()


init_generated_entry_db()


class SourceSnapshotInput(BaseModel):
    kind: Literal["quick_thought", "block"]
    block_id: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=80)
    question: str | None = Field(default=None, max_length=500)
    text: str = Field(min_length=1, max_length=5000)


class DraftParagraphInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=8000)
    sources: list[SourceSnapshotInput] = Field(min_length=1, max_length=40)


class SaveGeneratedEntryBody(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    paragraphs: list[DraftParagraphInput] = Field(min_length=1, max_length=30)


class SourceSnapshot(BaseModel):
    kind: Literal["quick_thought", "block"]
    block_id: str | None = None
    category: str | None = None
    question: str | None = None
    text: str


class SavedGeneratedParagraph(BaseModel):
    id: str
    text: str
    source_block_ids: list[str]
    uses_quick_thought: bool
    sources: list[SourceSnapshot]


class SavedGeneratedEntry(BaseModel):
    id: str
    reflection_id: str
    model: str
    title: str
    paragraphs: list[SavedGeneratedParagraph]
    created_at: int
    updated_at: int


class GeneratedEntryEnvelope(BaseModel):
    entry: SavedGeneratedEntry | None


def _require_owned_reflection(
    connection: sqlite3.Connection,
    reflection_id: str,
    google_id: str,
) -> sqlite3.Row:
    row = connection.execute(
        """
        SELECT id, quick_thought
        FROM reflections
        WHERE id = ? AND user_google_id = ?
        """,
        (reflection_id, google_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Reflection not found")
    return row


def _decode_sources(raw: str) -> list[SourceSnapshot]:
    try:
        data = json.loads(raw or "[]")
        return [SourceSnapshot.model_validate(item) for item in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def _row_to_entry(
    connection: sqlite3.Connection,
    row: sqlite3.Row,
) -> SavedGeneratedEntry:
    paragraph_rows = connection.execute(
        """
        SELECT id, text, source_json
        FROM generated_entry_paragraphs
        WHERE entry_id = ?
        ORDER BY position_index ASC
        """,
        (row["id"],),
    ).fetchall()

    paragraphs: list[SavedGeneratedParagraph] = []
    for paragraph_row in paragraph_rows:
        sources = _decode_sources(paragraph_row["source_json"])
        source_block_ids = [source.block_id for source in sources if source.kind == "block" and source.block_id]
        paragraphs.append(
            SavedGeneratedParagraph(
                id=paragraph_row["id"],
                text=paragraph_row["text"],
                source_block_ids=source_block_ids,
                uses_quick_thought=any(source.kind == "quick_thought" for source in sources),
                sources=sources,
            )
        )

    return SavedGeneratedEntry(
        id=row["id"],
        reflection_id=row["reflection_id"],
        model=row["model"],
        title=row["title"],
        paragraphs=paragraphs,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _validate_and_build_sources(
    reflection: sqlite3.Row,
    body: SaveGeneratedEntryBody,
) -> list[list[SourceSnapshot]]:
    seen_paragraph_ids: set[str] = set()
    result: list[list[SourceSnapshot]] = []

    for paragraph in body.paragraphs:
        if paragraph.id in seen_paragraph_ids:
            raise HTTPException(status_code=400, detail="Duplicate generated paragraph id")
        seen_paragraph_ids.add(paragraph.id)

        if not paragraph.text.strip():
            raise HTTPException(status_code=400, detail="Generated paragraphs cannot be empty")

        sources: list[SourceSnapshot] = []
        seen_source_keys: set[tuple[str, str | None]] = set()
        for source in paragraph.sources:
            key = (source.kind, source.block_id)
            if key in seen_source_keys:
                raise HTTPException(status_code=400, detail="Duplicate source in generated paragraph")
            seen_source_keys.add(key)

            clean_text = source.text.strip()
            if not clean_text:
                raise HTTPException(status_code=400, detail="Source text cannot be empty")

            if source.kind == "quick_thought":
                sources.append(
                    SourceSnapshot(
                        kind="quick_thought",
                        text=str(reflection["quick_thought"]),
                    )
                )
                continue

            if not source.block_id or not (source.question or "").strip():
                raise HTTPException(status_code=400, detail="Block sources need an id and question")
            sources.append(
                SourceSnapshot(
                    kind="block",
                    block_id=source.block_id,
                    category=(source.category or "").strip() or None,
                    question=(source.question or "").strip(),
                    text=clean_text,
                )
            )

        if not sources:
            raise HTTPException(
                status_code=400,
                detail="Every generated paragraph must retain at least one source",
            )
        result.append(sources)

    return result


@router.get("/{reflection_id}/generated-entry", response_model=GeneratedEntryEnvelope)
def get_generated_entry(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> GeneratedEntryEnvelope:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        row = connection.execute(
            """
            SELECT id, reflection_id, model, title, created_at, updated_at
            FROM generated_entries
            WHERE reflection_id = ?
            """,
            (reflection_id,),
        ).fetchone()
        if row is None:
            return GeneratedEntryEnvelope(entry=None)
        return GeneratedEntryEnvelope(entry=_row_to_entry(connection, row))
    finally:
        connection.close()


def _save_generated_entry_for_user(
    reflection_id: str,
    body: SaveGeneratedEntryBody,
    google_id: str,
) -> SavedGeneratedEntry:
    """Persist an editable generated entry for one owner.

    The HTTP route and automated conformance audit share this implementation so
    audit results exercise the real provenance/edit persistence path.
    """

    connection = _connect()
    try:
        reflection = _require_owned_reflection(connection, reflection_id, google_id)
        source_lists = _validate_and_build_sources(reflection, body)

        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Generated entry title cannot be empty")

        now = int(time.time())
        existing = connection.execute(
            "SELECT id, created_at FROM generated_entries WHERE reflection_id = ?",
            (reflection_id,),
        ).fetchone()

        if existing is None:
            entry_id = str(uuid.uuid4())
            created_at = now
            connection.execute(
                """
                INSERT INTO generated_entries (
                    id, reflection_id, model, title, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entry_id, reflection_id, body.model.strip(), title, created_at, now),
            )
        else:
            entry_id = str(existing["id"])
            created_at = int(existing["created_at"])
            connection.execute(
                """
                UPDATE generated_entries
                SET model = ?, title = ?, updated_at = ?
                WHERE id = ?
                """,
                (body.model.strip(), title, now, entry_id),
            )
            connection.execute(
                "DELETE FROM generated_entry_paragraphs WHERE entry_id = ?",
                (entry_id,),
            )

        for position, (paragraph, sources) in enumerate(zip(body.paragraphs, source_lists)):
            # The client/Gemini paragraph id (for example "p1") is only unique within
            # one draft, but this column is the table's global primary key. Always
            # store a fresh id so different entries and users cannot collide.
            paragraph_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO generated_entry_paragraphs (
                    id, entry_id, position_index, text, source_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    paragraph_id,
                    entry_id,
                    position,
                    paragraph.text.strip(),
                    json.dumps([source.model_dump() for source in sources], ensure_ascii=False),
                    now,
                    now,
                ),
            )

        connection.commit()
        row = connection.execute(
            """
            SELECT id, reflection_id, model, title, created_at, updated_at
            FROM generated_entries
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=500, detail="Could not save generated entry")
        return _row_to_entry(connection, row)
    finally:
        connection.close()


@router.put("/{reflection_id}/generated-entry", response_model=SavedGeneratedEntry)
def save_generated_entry(
    reflection_id: str,
    body: SaveGeneratedEntryBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> SavedGeneratedEntry:
    user = current_user_from_cookie(reflectblocks_session)
    return _save_generated_entry_for_user(reflection_id, body, user.google_id)


@router.delete("/{reflection_id}/generated-entry", status_code=204)
def delete_generated_entry(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, user.google_id)
        connection.execute("DELETE FROM generated_entries WHERE reflection_id = ?", (reflection_id,))
        connection.execute(
            "UPDATE reflections SET updated_at = ? WHERE id = ? AND user_google_id = ?",
            (int(time.time()), reflection_id, user.google_id),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()
