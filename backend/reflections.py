from __future__ import annotations

import sqlite3
import time
import uuid

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, DATA_DIR, current_user_from_cookie

router = APIRouter(prefix="/api/reflections", tags=["reflections"])
DB_PATH = DATA_DIR / "reflectblocks.sqlite3"

# Deliberately richer than the earlier six-link vocabulary. These are semantic
# labels, not a grammar: users may connect blocks however they want.
RELATION_TYPES = {
    "related_to",
    "led_to",
    "caused",
    "triggered",
    "made_me_feel",
    "made_me_think",
    "influenced",
    "because",
    "supports",
    "contrasts_with",
    "depends_on",
    "revealed",
    "helped_me_realize",
    "matters_because",
    "changed_into",
    "reminds_me_of",
    "next_time",
    "custom",
}
PORT_TYPES = {"top", "right", "bottom", "left"}

# Optional fixed starter prompts for R3. The default preference remains "manual",
# so existing users see exactly the previous behavior unless they opt in.
STARTER_PROMPTS = [
    ("situation-1", "situation", "What happened?", 80.0, 90.0),
    ("feelings-1", "feelings", "How did you feel in the moment?", 440.0, 90.0),
    ("meaning-1", "meaning", "Why did this matter to you?", 800.0, 90.0),
]


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _table_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}


def _ensure_column(connection: sqlite3.Connection, table: str, name: str, definition: str) -> None:
    if name not in _table_columns(connection, table):
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def init_reflection_db() -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reflections (
                id TEXT PRIMARY KEY,
                user_google_id TEXT NOT NULL,
                quick_thought TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_google_id)
                    REFERENCES users(google_id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_reflections_user_created
            ON reflections(user_google_id, created_at DESC)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reflection_blocks (
                id TEXT PRIMARY KEY,
                reflection_id TEXT NOT NULL,
                library_block_id TEXT,
                category TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL DEFAULT '',
                position_x REAL NOT NULL DEFAULT 24,
                position_y REAL NOT NULL DEFAULT 24,
                order_index INTEGER NOT NULL DEFAULT 0,
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
            CREATE INDEX IF NOT EXISTS idx_blocks_reflection_order
            ON reflection_blocks(reflection_id, order_index)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS block_connections (
                id TEXT PRIMARY KEY,
                reflection_id TEXT NOT NULL,
                source_block_id TEXT NOT NULL,
                target_block_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                source_port TEXT NOT NULL DEFAULT 'right',
                target_port TEXT NOT NULL DEFAULT 'left',
                relation_label TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (reflection_id)
                    REFERENCES reflections(id)
                    ON DELETE CASCADE,
                FOREIGN KEY (source_block_id)
                    REFERENCES reflection_blocks(id)
                    ON DELETE CASCADE,
                FOREIGN KEY (target_block_id)
                    REFERENCES reflection_blocks(id)
                    ON DELETE CASCADE,
                UNIQUE (reflection_id, source_block_id, target_block_id)
            )
            """
        )
        # Migration for users coming from the first enhanced M3 build.
        _ensure_column(connection, "block_connections", "source_port", "TEXT NOT NULL DEFAULT 'right'")
        _ensure_column(connection, "block_connections", "target_port", "TEXT NOT NULL DEFAULT 'left'")
        _ensure_column(connection, "block_connections", "relation_label", "TEXT")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_connections_reflection
            ON block_connections(reflection_id)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_google_id TEXT PRIMARY KEY,
                prompt_behavior TEXT NOT NULL DEFAULT 'manual',
                FOREIGN KEY (user_google_id)
                    REFERENCES users(google_id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.commit()
    finally:
        connection.close()


init_reflection_db()


class ReflectionCreate(BaseModel):
    quick_thought: str = Field(min_length=1, max_length=5000)


class Reflection(BaseModel):
    id: str
    quick_thought: str
    created_at: int
    updated_at: int
    generated_entry_title: str | None = None
    generated_entry_updated_at: int | None = None
    free_writing_title: str | None = None
    free_writing_updated_at: int | None = None


class BlockInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    library_block_id: str | None = Field(default=None, max_length=100)
    category: str = Field(min_length=1, max_length=80)
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(default="", max_length=5000)
    # World-space coordinates. Negative values are intentional: the new canvas
    # is effectively infinite and camera pan/zoom is independent of block data.
    position_x: float = Field(default=24, ge=-100_000, le=100_000)
    position_y: float = Field(default=24, ge=-100_000, le=100_000)
    order_index: int = Field(ge=0, le=500)


class ConnectionInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    source_block_id: str = Field(min_length=1, max_length=100)
    target_block_id: str = Field(min_length=1, max_length=100)
    relation_type: str = Field(min_length=1, max_length=50)
    source_port: str = Field(default="right", min_length=1, max_length=20)
    target_port: str = Field(default="left", min_length=1, max_length=20)
    relation_label: str | None = Field(default=None, max_length=100)


class WorkspaceSaveBody(BaseModel):
    blocks: list[BlockInput] = Field(max_length=100)
    connections: list[ConnectionInput] = Field(default_factory=list, max_length=300)


class BlocksSaveBody(BaseModel):
    """Backward-compatible Milestone 3 payload."""

    blocks: list[BlockInput] = Field(max_length=100)


class SavedBlock(BlockInput):
    created_at: int
    updated_at: int


class SavedConnection(ConnectionInput):
    created_at: int
    updated_at: int


class ReflectionDetail(Reflection):
    blocks: list[SavedBlock]
    connections: list[SavedConnection]


class WorkspaceResponse(BaseModel):
    blocks: list[SavedBlock]
    connections: list[SavedConnection]


def _row_to_reflection(row: sqlite3.Row) -> Reflection:
    keys = set(row.keys())
    return Reflection(
        id=row["id"],
        quick_thought=row["quick_thought"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        generated_entry_title=(
            row["generated_entry_title"] if "generated_entry_title" in keys else None
        ),
        generated_entry_updated_at=(
            row["generated_entry_updated_at"] if "generated_entry_updated_at" in keys else None
        ),
        free_writing_title=(row["free_writing_title"] if "free_writing_title" in keys else None),
        free_writing_updated_at=(
            row["free_writing_updated_at"] if "free_writing_updated_at" in keys else None
        ),
    )


def _row_to_block(row: sqlite3.Row) -> SavedBlock:
    return SavedBlock(
        id=row["id"],
        library_block_id=row["library_block_id"],
        category=row["category"],
        question=row["question"],
        answer=row["answer"],
        position_x=row["position_x"],
        position_y=row["position_y"],
        order_index=row["order_index"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_connection(row: sqlite3.Row) -> SavedConnection:
    return SavedConnection(
        id=row["id"],
        source_block_id=row["source_block_id"],
        target_block_id=row["target_block_id"],
        relation_type=row["relation_type"],
        source_port=row["source_port"],
        target_port=row["target_port"],
        relation_label=row["relation_label"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


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


def _validate_workspace(body: WorkspaceSaveBody) -> None:
    block_ids: set[str] = set()
    for block in body.blocks:
        if block.id in block_ids:
            raise HTTPException(status_code=400, detail="Duplicate block id")
        block_ids.add(block.id)
        if not block.question.strip():
            raise HTTPException(status_code=400, detail="Block question cannot be empty")

    connection_ids: set[str] = set()
    pairs: set[tuple[str, str]] = set()
    for item in body.connections:
        if item.id in connection_ids:
            raise HTTPException(status_code=400, detail="Duplicate connection id")
        connection_ids.add(item.id)
        if item.source_block_id == item.target_block_id:
            raise HTTPException(status_code=400, detail="A block cannot connect to itself")
        if item.source_block_id not in block_ids or item.target_block_id not in block_ids:
            raise HTTPException(status_code=400, detail="Connection references an unknown block")
        if item.relation_type not in RELATION_TYPES:
            raise HTTPException(status_code=400, detail="Unknown connection relationship")
        if item.source_port not in PORT_TYPES or item.target_port not in PORT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown block connection port")
        if item.relation_type == "custom" and not (item.relation_label or "").strip():
            raise HTTPException(status_code=400, detail="Custom relationships need a label")
        pair = (item.source_block_id, item.target_block_id)
        if pair in pairs:
            raise HTTPException(status_code=400, detail="Duplicate block connection")
        pairs.add(pair)

    # Unlike the earlier thread prototype, this version intentionally permits
    # cycles. Human reflection can contain feedback loops (e.g. worry -> avoid ->
    # more worry), and the canvas is a semantic map rather than a program AST.


def _create_reflection_for_user(google_id: str, quick_thought: str) -> Reflection:
    """Core reflection creation used by the API and the built-in technical audit.

    Keeping the write path in one helper means automated evaluation exercises the
    same persistence/default behavior as normal product use, without faking a
    browser login or touching the signed-in writer's own reflections.
    """

    thought = quick_thought.strip()
    if not thought:
        raise HTTPException(status_code=400, detail="Write something before saving")

    reflection_id = str(uuid.uuid4())
    now = int(time.time())
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO reflections (id, user_google_id, quick_thought, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (reflection_id, google_id, thought, now, now),
        )
        preference = connection.execute(
            "SELECT prompt_behavior FROM user_preferences WHERE user_google_id = ?",
            (google_id,),
        ).fetchone()
        if preference is not None and preference["prompt_behavior"] == "starter":
            for order_index, (library_id, category, question, x, y) in enumerate(STARTER_PROMPTS):
                connection.execute(
                    """
                    INSERT INTO reflection_blocks (
                        id, reflection_id, library_block_id, category, question, answer,
                        position_x, position_y, order_index, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        reflection_id,
                        library_id,
                        category,
                        question,
                        x,
                        y,
                        order_index,
                        now,
                        now,
                    ),
                )
        connection.commit()
        row = _require_owned_reflection(connection, reflection_id, google_id)
    finally:
        connection.close()
    return _row_to_reflection(row)


@router.post("", response_model=Reflection)
def create_reflection(
    body: ReflectionCreate,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Reflection:
    user = current_user_from_cookie(reflectblocks_session)
    return _create_reflection_for_user(user.google_id, body.quick_thought)


@router.get("", response_model=list[Reflection])
def list_reflections(
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> list[Reflection]:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        generated_entries_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'generated_entries'"
        ).fetchone() is not None
        free_writing_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'free_writing_entries'"
        ).fetchone() is not None

        if generated_entries_exists and free_writing_exists:
            rows = connection.execute(
                """
                SELECT
                    r.id, r.quick_thought, r.created_at, r.updated_at,
                    ge.title AS generated_entry_title,
                    ge.updated_at AS generated_entry_updated_at,
                    fw.title AS free_writing_title,
                    fw.updated_at AS free_writing_updated_at
                FROM reflections AS r
                LEFT JOIN generated_entries AS ge ON ge.reflection_id = r.id
                LEFT JOIN free_writing_entries AS fw ON fw.reflection_id = r.id
                WHERE r.user_google_id = ?
                ORDER BY r.updated_at DESC, r.created_at DESC
                """,
                (user.google_id,),
            ).fetchall()
        elif generated_entries_exists:
            rows = connection.execute(
                """
                SELECT r.id, r.quick_thought, r.created_at, r.updated_at,
                       ge.title AS generated_entry_title,
                       ge.updated_at AS generated_entry_updated_at,
                       NULL AS free_writing_title, NULL AS free_writing_updated_at
                FROM reflections AS r
                LEFT JOIN generated_entries AS ge ON ge.reflection_id = r.id
                WHERE r.user_google_id = ?
                ORDER BY r.updated_at DESC, r.created_at DESC
                """,
                (user.google_id,),
            ).fetchall()
        elif free_writing_exists:
            rows = connection.execute(
                """
                SELECT r.id, r.quick_thought, r.created_at, r.updated_at,
                       NULL AS generated_entry_title, NULL AS generated_entry_updated_at,
                       fw.title AS free_writing_title, fw.updated_at AS free_writing_updated_at
                FROM reflections AS r
                LEFT JOIN free_writing_entries AS fw ON fw.reflection_id = r.id
                WHERE r.user_google_id = ?
                ORDER BY r.updated_at DESC, r.created_at DESC
                """,
                (user.google_id,),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, quick_thought, created_at, updated_at,
                       NULL AS generated_entry_title, NULL AS generated_entry_updated_at,
                       NULL AS free_writing_title, NULL AS free_writing_updated_at
                FROM reflections
                WHERE user_google_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (user.google_id,),
            ).fetchall()
    finally:
        connection.close()
    return [_row_to_reflection(row) for row in rows]


@router.get("/{reflection_id}", response_model=ReflectionDetail)
def get_reflection(
    reflection_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> ReflectionDetail:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        reflection_row = _require_owned_reflection(connection, reflection_id, user.google_id)
        block_rows = connection.execute(
            """
            SELECT id, library_block_id, category, question, answer,
                   position_x, position_y, order_index, created_at, updated_at
            FROM reflection_blocks
            WHERE reflection_id = ?
            ORDER BY order_index ASC, created_at ASC
            """,
            (reflection_id,),
        ).fetchall()
        connection_rows = connection.execute(
            """
            SELECT id, source_block_id, target_block_id, relation_type,
                   source_port, target_port, relation_label, created_at, updated_at
            FROM block_connections
            WHERE reflection_id = ?
            ORDER BY created_at ASC
            """,
            (reflection_id,),
        ).fetchall()
    finally:
        connection.close()

    reflection = _row_to_reflection(reflection_row)
    return ReflectionDetail(
        **reflection.model_dump(),
        blocks=[_row_to_block(row) for row in block_rows],
        connections=[_row_to_connection(row) for row in connection_rows],
    )


def _save_workspace(
    reflection_id: str,
    body: WorkspaceSaveBody,
    google_id: str,
) -> WorkspaceResponse:
    _validate_workspace(body)
    now = int(time.time())
    connection = _connect()
    try:
        _require_owned_reflection(connection, reflection_id, google_id)
        connection.execute("BEGIN")

        # Save as one snapshot so blocks/edges cannot get out of sync.
        connection.execute("DELETE FROM block_connections WHERE reflection_id = ?", (reflection_id,))
        connection.execute("DELETE FROM reflection_blocks WHERE reflection_id = ?", (reflection_id,))

        for block in body.blocks:
            connection.execute(
                """
                INSERT INTO reflection_blocks (
                    id, reflection_id, library_block_id, category, question, answer,
                    position_x, position_y, order_index, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    block.id,
                    reflection_id,
                    block.library_block_id,
                    block.category,
                    block.question.strip(),
                    block.answer,
                    block.position_x,
                    block.position_y,
                    block.order_index,
                    now,
                    now,
                ),
            )

        for item in body.connections:
            connection.execute(
                """
                INSERT INTO block_connections (
                    id, reflection_id, source_block_id, target_block_id,
                    relation_type, source_port, target_port, relation_label,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.id,
                    reflection_id,
                    item.source_block_id,
                    item.target_block_id,
                    item.relation_type,
                    item.source_port,
                    item.target_port,
                    (item.relation_label or "").strip() or None,
                    now,
                    now,
                ),
            )

        connection.execute(
            "UPDATE reflections SET updated_at = ? WHERE id = ? AND user_google_id = ?",
            (now, reflection_id, google_id),
        )
        connection.commit()

        block_rows = connection.execute(
            """
            SELECT id, library_block_id, category, question, answer,
                   position_x, position_y, order_index, created_at, updated_at
            FROM reflection_blocks
            WHERE reflection_id = ?
            ORDER BY order_index ASC, created_at ASC
            """,
            (reflection_id,),
        ).fetchall()
        connection_rows = connection.execute(
            """
            SELECT id, source_block_id, target_block_id, relation_type,
                   source_port, target_port, relation_label, created_at, updated_at
            FROM block_connections
            WHERE reflection_id = ?
            ORDER BY created_at ASC
            """,
            (reflection_id,),
        ).fetchall()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return WorkspaceResponse(
        blocks=[_row_to_block(row) for row in block_rows],
        connections=[_row_to_connection(row) for row in connection_rows],
    )


@router.put("/{reflection_id}/workspace", response_model=WorkspaceResponse)
def save_workspace(
    reflection_id: str,
    body: WorkspaceSaveBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkspaceResponse:
    user = current_user_from_cookie(reflectblocks_session)
    return _save_workspace(reflection_id, body, user.google_id)


@router.put("/{reflection_id}/blocks", response_model=list[SavedBlock])
def save_blocks_legacy(
    reflection_id: str,
    body: BlocksSaveBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> list[SavedBlock]:
    """Keep the previous M3 endpoint usable; it clears graph connections."""

    user = current_user_from_cookie(reflectblocks_session)
    result = _save_workspace(
        reflection_id,
        WorkspaceSaveBody(blocks=body.blocks, connections=[]),
        user.google_id,
    )
    return result.blocks
