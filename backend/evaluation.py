from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, current_user_from_cookie
from backend.reflections import DB_PATH

router = APIRouter(prefix="/api/evaluation", tags=["evaluation"])

REQUIREMENT_IDS = {f"R{i}" for i in range(1, 19)}
CHECK_STATUSES = {"not_tested", "pass", "issue", "critical"}


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


def init_evaluation_db() -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluation_sessions (
                id TEXT PRIMARY KEY,
                user_google_id TEXT NOT NULL,
                participant_code TEXT NOT NULL,
                device_type TEXT NOT NULL,
                age_group TEXT NOT NULL DEFAULT 'not_provided',
                text_editing_experience TEXT NOT NULL DEFAULT 'not_provided',
                started_at INTEGER NOT NULL,
                completed_at INTEGER,
                consented INTEGER NOT NULL DEFAULT 0,
                sus_json TEXT,
                custom_json TEXT,
                FOREIGN KEY (user_google_id)
                    REFERENCES users(google_id)
                    ON DELETE CASCADE
            )
            """
        )
        # Safe migration for databases created by the earlier evaluation build.
        _ensure_column(connection, "evaluation_sessions", "age_group", "TEXT NOT NULL DEFAULT 'not_provided'")
        _ensure_column(
            connection,
            "evaluation_sessions",
            "text_editing_experience",
            "TEXT NOT NULL DEFAULT 'not_provided'",
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS usability_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                reflection_id TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id)
                    REFERENCES evaluation_sessions(id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_usability_events_session_time
            ON usability_events(session_id, created_at)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluation_requirement_checks (
                session_id TEXT NOT NULL,
                requirement_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'not_tested',
                evidence_json TEXT NOT NULL DEFAULT '{}',
                notes TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, requirement_id),
                FOREIGN KEY (session_id)
                    REFERENCES evaluation_sessions(id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluation_governance_reviews (
                session_id TEXT PRIMARY KEY,
                reviewer_role TEXT NOT NULL DEFAULT '',
                data_flow_ok INTEGER,
                retention_ok INTEGER,
                processing_notice_ok INTEGER,
                prompt_wording_ok INTEGER,
                prompt_flags_count INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                reviewed_at INTEGER NOT NULL,
                FOREIGN KEY (session_id)
                    REFERENCES evaluation_sessions(id)
                    ON DELETE CASCADE
            )
            """
        )
        # HCAI review dimensions, added alongside the original privacy/governance fields.
        _ensure_column(connection, "evaluation_governance_reviews", "explainability_ok", "INTEGER")
        _ensure_column(connection, "evaluation_governance_reviews", "trust_calibration_ok", "INTEGER")
        _ensure_column(connection, "evaluation_governance_reviews", "human_control_ok", "INTEGER")
        _ensure_column(connection, "evaluation_governance_reviews", "fairness_ok", "INTEGER")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS evaluation_guided_tasks (
                session_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                requirement_ids_json TEXT NOT NULL DEFAULT '[]',
                started_at_ms INTEGER NOT NULL,
                completed_at_ms INTEGER,
                duration_ms INTEGER,
                status TEXT NOT NULL DEFAULT 'running',
                objective_json TEXT NOT NULL DEFAULT '{}',
                comprehension_json TEXT NOT NULL DEFAULT '{}',
                reflection_id TEXT,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, task_id),
                FOREIGN KEY (session_id)
                    REFERENCES evaluation_sessions(id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.commit()
    finally:
        connection.close()


init_evaluation_db()


class EvaluationStartBody(BaseModel):
    participant_code: str = Field(min_length=1, max_length=80)
    device_type: str = Field(default="desktop", max_length=40)
    age_group: str = Field(default="not_provided", max_length=40)
    text_editing_experience: str = Field(default="not_provided", max_length=40)
    consented: bool


class EvaluationStartResponse(BaseModel):
    session_id: str
    started_at: int


class UsabilityEventBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    event_type: str = Field(min_length=1, max_length=100)
    reflection_id: str | None = Field(default=None, max_length=100)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvaluationCompleteBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    sus: list[int] = Field(min_length=10, max_length=10)
    ease_rating: int = Field(ge=1, le=5)
    control_rating: int = Field(ge=1, le=5)
    privacy_clarity_rating: int = Field(ge=1, le=5)
    comments: str = Field(default="", max_length=4000)


class RequirementCheckBody(BaseModel):
    status: Literal["not_tested", "pass", "issue", "critical"] = "not_tested"
    evidence: dict[str, Any] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=2000)


class GovernanceReviewBody(BaseModel):
    reviewer_role: str = Field(min_length=1, max_length=120)
    data_flow_ok: bool | None = None
    retention_ok: bool | None = None
    processing_notice_ok: bool | None = None
    prompt_wording_ok: bool | None = None
    explainability_ok: bool | None = None
    trust_calibration_ok: bool | None = None
    human_control_ok: bool | None = None
    fairness_ok: bool | None = None
    prompt_flags_count: int = Field(default=0, ge=0, le=500)
    notes: str = Field(default="", max_length=4000)


class EvaluationExport(BaseModel):
    session: dict[str, Any]
    events: list[dict[str, Any]]
    requirement_checks: list[dict[str, Any]] = Field(default_factory=list)
    governance_review: dict[str, Any] | None = None
    guided_tasks: list[dict[str, Any]] = Field(default_factory=list)


class EvaluationProtocolState(BaseModel):
    requirement_checks: list[dict[str, Any]]
    governance_review: dict[str, Any] | None = None


class GuidedTaskStartBody(BaseModel):
    task_id: str = Field(min_length=1, max_length=80)
    requirement_ids: list[str] = Field(default_factory=list, max_length=18)


class GuidedRequirementResult(BaseModel):
    requirement_id: str = Field(min_length=2, max_length=4)
    status: Literal["not_tested", "pass", "issue", "critical"]
    evidence: dict[str, Any] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=1000)


class GuidedTaskCompleteBody(BaseModel):
    duration_ms: int = Field(ge=0, le=86_400_000)
    status: Literal["pass", "issue", "critical", "completed"] = "completed"
    objective: dict[str, Any] = Field(default_factory=dict)
    comprehension: dict[str, Any] = Field(default_factory=dict)
    reflection_id: str | None = Field(default=None, max_length=100)
    requirement_results: list[GuidedRequirementResult] = Field(default_factory=list, max_length=18)


class GuidedTaskRecord(BaseModel):
    task_id: str
    requirement_ids: list[str]
    started_at_ms: int
    completed_at_ms: int | None
    duration_ms: int | None
    status: str
    objective: dict[str, Any]
    comprehension: dict[str, Any]
    reflection_id: str | None


def _require_session(connection: sqlite3.Connection, session_id: str, google_id: str) -> sqlite3.Row:
    row = connection.execute(
        """
        SELECT * FROM evaluation_sessions
        WHERE id = ? AND user_google_id = ?
        """,
        (session_id, google_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Evaluation session not found")
    return row


def _primitive_dict(metadata: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in metadata.items():
        if key not in allowed:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            clean[key] = value
    return clean


def _safe_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    # Instrument interaction, not journal content. Only a small allow-list is persisted.
    allowed = {
        "category",
        "relation_type",
        "format",
        "source_count",
        "selected_count",
        "unselected_count",
        "block_count",
        "connection_count",
        "answered_count",
        "char_count",
        "duration_ms",
        "hesitation_count",
        "error_count",
        "help_count",
        "screen",
        "action",
        "success",
        "requirement_id",
        "task_id",
        "critical",
        "during_request",
        "was_answered",
    }
    return _primitive_dict(metadata, allowed)


def _safe_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    # Requirement evidence contains categorical observations, never reflection text.
    allowed = {
        "completed",
        "understood",
        "without_help",
        "persisted",
        "predicted_correctly",
        "source_identified",
        "writer_vs_system_distinguished",
        "edit_saved_matches",
        "blank_completed",
        "no_auto_generation",
        "selected_only_understood",
        "notice_explained",
        "delete_independent",
        "tap_type_only",
        "question_edited",
        "custom_block_added",
        "reordered",
        "save_blocks_only_understood",
        "save_entry_understood",
        "export_understood",
        "save_nothing_understood",
        "age_45_plus",
        "duration_ms",
        "hesitation_count",
        "error_count",
        "help_count",
        "source_count",
        "selected_count",
        "unselected_count",
        "critical_misunderstanding",
        "second_session_checked",
        "technical_check_passed",
        "reviewer_completed",
        "connection_created",
        "connection_labeled",
        "suggestion_requested",
        "suggestion_accepted",
        "suggestion_rejected",
        "suggestion_understood_optional",
        "block_found",
        "keyboard_only_completed",
        "accessible_without_mouse",
        "dismiss_undone",
        "generation_cancelled",
    }
    return _primitive_dict(evidence, allowed)


def _safe_guided_dict(value: dict[str, Any]) -> dict[str, Any]:
    # Guided-mode telemetry stores outcomes and answer keys, never journal/block text.
    allowed = {
        "completed", "within_5s", "duration_ms", "dismissed_block",
        "custom_block_added", "question_edited", "reordered", "workspace_saved",
        "answered_count", "preference_changed", "first_entry_starter_count",
        "second_entry_starter_count", "prediction_correct", "blank_saved",
        "generation_requested", "privacy_notice_seen", "selected_count",
        "unselected_count", "generated_after_request", "journal_generated",
        "source_inspected", "paragraph_edited", "journal_saved",
        "save_nothing_used", "exported", "journal_deleted", "blocks_remained",
        "generated_entry_removed", "save_blocks_only_done", "save_entry_done",
        "age_45_plus", "selected_data_correct", "processor_correct",
        "sent_already_correct", "source_meaning_correct", "delete_scope_correct",
        "retention_state_correct", "correct_count", "total_count",
        "help_count", "error_count", "hesitation_count", "task_success",
        "expected_behavior_correct", "source_checkpoint_answered",
        "connection_created", "connection_labeled", "suggestion_requested",
        "suggestion_accepted", "suggestion_rejected", "block_found",
        "keyboard_only_completed",
    }
    return _primitive_dict(value, allowed)


def _row_to_guided_task(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "task_id": row["task_id"],
        "requirement_ids": json.loads(row["requirement_ids_json"] or "[]"),
        "started_at_ms": row["started_at_ms"],
        "completed_at_ms": row["completed_at_ms"],
        "duration_ms": row["duration_ms"],
        "status": row["status"],
        "objective": json.loads(row["objective_json"] or "{}"),
        "comprehension": json.loads(row["comprehension_json"] or "{}"),
        "reflection_id": row["reflection_id"],
    }


def _row_to_requirement_check(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "requirement_id": row["requirement_id"],
        "status": row["status"],
        "evidence": json.loads(row["evidence_json"] or "{}"),
        "notes": row["notes"],
        "updated_at": row["updated_at"],
    }


def _row_to_governance(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "reviewer_role": row["reviewer_role"],
        "data_flow_ok": None if row["data_flow_ok"] is None else bool(row["data_flow_ok"]),
        "retention_ok": None if row["retention_ok"] is None else bool(row["retention_ok"]),
        "processing_notice_ok": (
            None if row["processing_notice_ok"] is None else bool(row["processing_notice_ok"])
        ),
        "prompt_wording_ok": None if row["prompt_wording_ok"] is None else bool(row["prompt_wording_ok"]),
        "explainability_ok": None if row["explainability_ok"] is None else bool(row["explainability_ok"]),
        "trust_calibration_ok": (
            None if row["trust_calibration_ok"] is None else bool(row["trust_calibration_ok"])
        ),
        "human_control_ok": None if row["human_control_ok"] is None else bool(row["human_control_ok"]),
        "fairness_ok": None if row["fairness_ok"] is None else bool(row["fairness_ok"]),
        "prompt_flags_count": row["prompt_flags_count"],
        "notes": row["notes"],
        "reviewed_at": row["reviewed_at"],
    }


@router.post("/sessions", response_model=EvaluationStartResponse)
def start_session(
    body: EvaluationStartBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> EvaluationStartResponse:
    user = current_user_from_cookie(reflectblocks_session)
    if not body.consented:
        raise HTTPException(status_code=400, detail="Consent is required to start evaluation instrumentation")
    session_id = str(uuid.uuid4())
    now = int(time.time())
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO evaluation_sessions (
                id, user_google_id, participant_code, device_type,
                age_group, text_editing_experience, started_at, consented
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                session_id,
                user.google_id,
                body.participant_code.strip(),
                body.device_type.strip(),
                body.age_group.strip(),
                body.text_editing_experience.strip(),
                now,
            ),
        )
        connection.commit()
        return EvaluationStartResponse(session_id=session_id, started_at=now)
    finally:
        connection.close()


@router.post("/events", status_code=204)
def record_event(
    body: UsabilityEventBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_session(connection, body.session_id, user.google_id)
        connection.execute(
            """
            INSERT INTO usability_events (
                id, session_id, event_type, reflection_id, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                body.session_id,
                body.event_type.strip(),
                body.reflection_id,
                json.dumps(_safe_metadata(body.metadata), ensure_ascii=False),
                int(time.time()),
            ),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()


@router.put("/sessions/{session_id}/requirements/{requirement_id}", status_code=204)
def save_requirement_check(
    session_id: str,
    requirement_id: str,
    body: RequirementCheckBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    requirement_id = requirement_id.upper().strip()
    if requirement_id not in REQUIREMENT_IDS:
        raise HTTPException(status_code=400, detail="Unknown requirement id")
    if body.status not in CHECK_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown requirement status")

    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        connection.execute(
            """
            INSERT INTO evaluation_requirement_checks (
                session_id, requirement_id, status, evidence_json, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, requirement_id) DO UPDATE SET
                status = excluded.status,
                evidence_json = excluded.evidence_json,
                notes = excluded.notes,
                updated_at = excluded.updated_at
            """,
            (
                session_id,
                requirement_id,
                body.status,
                json.dumps(_safe_evidence(body.evidence), ensure_ascii=False),
                body.notes.strip(),
                int(time.time()),
            ),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()


@router.put("/sessions/{session_id}/governance", status_code=204)
def save_governance_review(
    session_id: str,
    body: GovernanceReviewBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        connection.execute(
            """
            INSERT INTO evaluation_governance_reviews (
                session_id, reviewer_role, data_flow_ok, retention_ok,
                processing_notice_ok, prompt_wording_ok,
                explainability_ok, trust_calibration_ok, human_control_ok, fairness_ok,
                prompt_flags_count, notes, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                reviewer_role = excluded.reviewer_role,
                data_flow_ok = excluded.data_flow_ok,
                retention_ok = excluded.retention_ok,
                processing_notice_ok = excluded.processing_notice_ok,
                prompt_wording_ok = excluded.prompt_wording_ok,
                explainability_ok = excluded.explainability_ok,
                trust_calibration_ok = excluded.trust_calibration_ok,
                human_control_ok = excluded.human_control_ok,
                fairness_ok = excluded.fairness_ok,
                prompt_flags_count = excluded.prompt_flags_count,
                notes = excluded.notes,
                reviewed_at = excluded.reviewed_at
            """,
            (
                session_id,
                body.reviewer_role.strip(),
                None if body.data_flow_ok is None else int(body.data_flow_ok),
                None if body.retention_ok is None else int(body.retention_ok),
                None if body.processing_notice_ok is None else int(body.processing_notice_ok),
                None if body.prompt_wording_ok is None else int(body.prompt_wording_ok),
                None if body.explainability_ok is None else int(body.explainability_ok),
                None if body.trust_calibration_ok is None else int(body.trust_calibration_ok),
                None if body.human_control_ok is None else int(body.human_control_ok),
                None if body.fairness_ok is None else int(body.fairness_ok),
                body.prompt_flags_count,
                body.notes.strip(),
                int(time.time()),
            ),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()


@router.get("/sessions/{session_id}/protocol", response_model=EvaluationProtocolState)
def get_protocol_state(
    session_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> EvaluationProtocolState:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        checks = connection.execute(
            """
            SELECT requirement_id, status, evidence_json, notes, updated_at
            FROM evaluation_requirement_checks
            WHERE session_id = ?
            ORDER BY CAST(SUBSTR(requirement_id, 2) AS INTEGER)
            """,
            (session_id,),
        ).fetchall()
        governance = connection.execute(
            "SELECT * FROM evaluation_governance_reviews WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        return EvaluationProtocolState(
            requirement_checks=[_row_to_requirement_check(row) for row in checks],
            governance_review=_row_to_governance(governance),
        )
    finally:
        connection.close()


@router.post("/sessions/{session_id}/guided-tasks/start", response_model=GuidedTaskRecord)
def start_guided_task(
    session_id: str,
    body: GuidedTaskStartBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> GuidedTaskRecord:
    user = current_user_from_cookie(reflectblocks_session)
    requirement_ids = [item.upper().strip() for item in body.requirement_ids]
    if any(item not in REQUIREMENT_IDS for item in requirement_ids):
        raise HTTPException(status_code=400, detail="Unknown requirement id in guided task")
    now_ms = int(time.time() * 1000)
    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        connection.execute(
            """
            INSERT INTO evaluation_guided_tasks (
                session_id, task_id, requirement_ids_json, started_at_ms,
                completed_at_ms, duration_ms, status, objective_json,
                comprehension_json, reflection_id, updated_at
            ) VALUES (?, ?, ?, ?, NULL, NULL, 'running', '{}', '{}', NULL, ?)
            ON CONFLICT(session_id, task_id) DO UPDATE SET
                requirement_ids_json = excluded.requirement_ids_json,
                started_at_ms = excluded.started_at_ms,
                completed_at_ms = NULL,
                duration_ms = NULL,
                status = 'running',
                objective_json = '{}',
                comprehension_json = '{}',
                reflection_id = NULL,
                updated_at = excluded.updated_at
            """,
            (session_id, body.task_id.strip(), json.dumps(requirement_ids), now_ms, int(time.time())),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM evaluation_guided_tasks WHERE session_id = ? AND task_id = ?",
            (session_id, body.task_id.strip()),
        ).fetchone()
        return GuidedTaskRecord(**_row_to_guided_task(row))
    finally:
        connection.close()


@router.put("/sessions/{session_id}/guided-tasks/{task_id}", response_model=GuidedTaskRecord)
def complete_guided_task(
    session_id: str,
    task_id: str,
    body: GuidedTaskCompleteBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> GuidedTaskRecord:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        existing = connection.execute(
            "SELECT * FROM evaluation_guided_tasks WHERE session_id = ? AND task_id = ?",
            (session_id, task_id),
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Guided task was not started")
        completed_at_ms = int(time.time() * 1000)
        objective = _safe_guided_dict(body.objective)
        comprehension = _safe_guided_dict(body.comprehension)
        connection.execute(
            """
            UPDATE evaluation_guided_tasks
            SET completed_at_ms = ?, duration_ms = ?, status = ?,
                objective_json = ?, comprehension_json = ?, reflection_id = ?, updated_at = ?
            WHERE session_id = ? AND task_id = ?
            """,
            (
                completed_at_ms, body.duration_ms, body.status,
                json.dumps(objective, ensure_ascii=False),
                json.dumps(comprehension, ensure_ascii=False),
                body.reflection_id, int(time.time()), session_id, task_id,
            ),
        )
        for result in body.requirement_results:
            requirement_id = result.requirement_id.upper().strip()
            if requirement_id not in REQUIREMENT_IDS:
                raise HTTPException(status_code=400, detail="Unknown requirement id")
            connection.execute(
                """
                INSERT INTO evaluation_requirement_checks (
                    session_id, requirement_id, status, evidence_json, notes, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, requirement_id) DO UPDATE SET
                    status = excluded.status,
                    evidence_json = excluded.evidence_json,
                    notes = excluded.notes,
                    updated_at = excluded.updated_at
                """,
                (
                    session_id, requirement_id, result.status,
                    json.dumps(_safe_evidence(result.evidence), ensure_ascii=False),
                    result.notes.strip(), int(time.time()),
                ),
            )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM evaluation_guided_tasks WHERE session_id = ? AND task_id = ?",
            (session_id, task_id),
        ).fetchone()
        return GuidedTaskRecord(**_row_to_guided_task(row))
    finally:
        connection.close()


@router.get("/sessions/{session_id}/guided-tasks", response_model=list[GuidedTaskRecord])
def get_guided_tasks(
    session_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> list[GuidedTaskRecord]:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        _require_session(connection, session_id, user.google_id)
        rows = connection.execute(
            "SELECT * FROM evaluation_guided_tasks WHERE session_id = ? ORDER BY started_at_ms ASC",
            (session_id,),
        ).fetchall()
        return [GuidedTaskRecord(**_row_to_guided_task(row)) for row in rows]
    finally:
        connection.close()


@router.put("/sessions/complete", status_code=204)
def complete_session(
    body: EvaluationCompleteBody,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    user = current_user_from_cookie(reflectblocks_session)
    if any(value < 1 or value > 5 for value in body.sus):
        raise HTTPException(status_code=400, detail="SUS responses must be between 1 and 5")
    connection = _connect()
    try:
        _require_session(connection, body.session_id, user.google_id)
        connection.execute(
            """
            UPDATE evaluation_sessions
            SET completed_at = ?, sus_json = ?, custom_json = ?
            WHERE id = ? AND user_google_id = ?
            """,
            (
                int(time.time()),
                json.dumps(body.sus),
                json.dumps(
                    {
                        "ease_rating": body.ease_rating,
                        "control_rating": body.control_rating,
                        "privacy_clarity_rating": body.privacy_clarity_rating,
                        "comments": body.comments,
                    },
                    ensure_ascii=False,
                ),
                body.session_id,
                user.google_id,
            ),
        )
        connection.commit()
        return Response(status_code=204)
    finally:
        connection.close()


@router.get("/sessions/{session_id}/export", response_model=EvaluationExport)
def export_session(
    session_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> EvaluationExport:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        row = _require_session(connection, session_id, user.google_id)
        event_rows = connection.execute(
            """
            SELECT event_type, reflection_id, metadata_json, created_at
            FROM usability_events
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()
        requirement_rows = connection.execute(
            """
            SELECT requirement_id, status, evidence_json, notes, updated_at
            FROM evaluation_requirement_checks
            WHERE session_id = ?
            ORDER BY CAST(SUBSTR(requirement_id, 2) AS INTEGER)
            """,
            (session_id,),
        ).fetchall()
        governance_row = connection.execute(
            "SELECT * FROM evaluation_governance_reviews WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        guided_rows = connection.execute(
            "SELECT * FROM evaluation_guided_tasks WHERE session_id = ? ORDER BY started_at_ms ASC",
            (session_id,),
        ).fetchall()
        session = {
            "id": row["id"],
            "user_email": user.email,
            "participant_code": row["participant_code"],
            "device_type": row["device_type"],
            "age_group": row["age_group"],
            "text_editing_experience": row["text_editing_experience"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "sus": json.loads(row["sus_json"]) if row["sus_json"] else None,
            "custom": json.loads(row["custom_json"]) if row["custom_json"] else None,
        }
        events = [
            {
                "event_type": event["event_type"],
                "reflection_id": event["reflection_id"],
                "metadata": json.loads(event["metadata_json"] or "{}"),
                "created_at": event["created_at"],
            }
            for event in event_rows
        ]
        return EvaluationExport(
            session=session,
            events=events,
            requirement_checks=[_row_to_requirement_check(item) for item in requirement_rows],
            governance_review=_row_to_governance(governance_row),
            guided_tasks=[_row_to_guided_task(item) for item in guided_rows],
        )
    finally:
        connection.close()
