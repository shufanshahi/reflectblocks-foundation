from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Cookie, HTTPException, Query
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, DATA_DIR, current_user_from_cookie

DB_PATH = DATA_DIR / "reflectblocks.sqlite3"

router = APIRouter(prefix="/api/evaluation/automated-runs", tags=["automated-evaluation"])

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = [f"R{i}" for i in range(1, 15)]

AutomationLevel = Literal["automated", "partial", "human_required"]
AutomatedStatus = Literal["pass", "fail", "manual_required"]


class AutomatedCheck(BaseModel):
    name: str
    passed: bool | None
    detail: str


def _check(name: str, passed: bool | None, detail: str) -> AutomatedCheck:
    return AutomatedCheck(name=name, passed=passed, detail=detail)


class AutomatedRequirementResult(BaseModel):
    requirement_id: str
    title: str
    automation_level: AutomationLevel
    status: AutomatedStatus
    checks: list[AutomatedCheck] = Field(default_factory=list)
    human_reason: str = ""
    duration_ms: int = 0


class AutomatedRun(BaseModel):
    id: str
    started_at: int
    completed_at: int
    overall_status: str
    summary: dict[str, int]
    results: list[AutomatedRequirementResult]


class AutomatedRunSummary(BaseModel):
    id: str
    started_at: int
    completed_at: int
    overall_status: str
    summary: dict[str, int]


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_automated_evaluation_db() -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS automated_evaluation_runs (
                id TEXT PRIMARY KEY,
                user_google_id TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                completed_at INTEGER NOT NULL,
                overall_status TEXT NOT NULL,
                summary_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY (user_google_id)
                    REFERENCES users(google_id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS automated_evaluation_results (
                run_id TEXT NOT NULL,
                requirement_id TEXT NOT NULL,
                title TEXT NOT NULL,
                automation_level TEXT NOT NULL,
                status TEXT NOT NULL,
                checks_json TEXT NOT NULL DEFAULT '[]',
                human_reason TEXT NOT NULL DEFAULT '',
                duration_ms INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (run_id, requirement_id),
                FOREIGN KEY (run_id)
                    REFERENCES automated_evaluation_runs(id)
                    ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_automated_eval_runs_user_time
            ON automated_evaluation_runs(user_google_id, started_at DESC)
            """
        )
        connection.commit()
    finally:
        connection.close()


init_automated_evaluation_db()


def _read_source(relative_path: str) -> str:
    path = PROJECT_ROOT / relative_path
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _source_check(relative_path: str, required_fragments: list[str]) -> AutomatedCheck:
    source = _read_source(relative_path)
    if not source:
        return _check(
            name=f"Frontend contract: {relative_path}",
            passed=None,
            detail="Source file is not available in this deployment, so the UI contract cannot be statically verified here.",
        )
    missing = [fragment for fragment in required_fragments if fragment not in source]
    return _check(
        name=f"Frontend contract: {relative_path}",
        passed=not missing,
        detail=(
            "Required controls/text are present in the implementation."
            if not missing
            else f"Missing expected implementation markers: {', '.join(missing)}"
        ),
    )


def _new_synthetic_user() -> str:
    google_id = f"__reflectblocks_auto_eval__{uuid.uuid4()}"
    now = int(time.time())
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO users (google_id, email, name, picture_url, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, ?)
            """,
            (google_id, f"{google_id}@invalid.local", "Automated evaluation fixture", now, now),
        )
        connection.commit()
    finally:
        connection.close()
    return google_id


def _delete_synthetic_user(google_id: str) -> None:
    connection = _connect()
    try:
        connection.execute("DELETE FROM users WHERE google_id = ?", (google_id,))
        connection.commit()
    finally:
        connection.close()


def _set_prompt_behavior(google_id: str, behavior: str) -> None:
    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO user_preferences (user_google_id, prompt_behavior)
            VALUES (?, ?)
            ON CONFLICT(user_google_id) DO UPDATE SET prompt_behavior = excluded.prompt_behavior
            """,
            (google_id, behavior),
        )
        connection.commit()
    finally:
        connection.close()


def _count(connection: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> int:
    row = connection.execute(sql, args).fetchone()
    return int(row[0]) if row else 0


def _result(
    requirement_id: str,
    title: str,
    level: AutomationLevel,
    checks: list[AutomatedCheck],
    human_reason: str,
    started: float,
) -> AutomatedRequirementResult:
    definitive = [check.passed for check in checks if check.passed is not None]
    if definitive and any(value is False for value in definitive):
        status: AutomatedStatus = "fail"
    elif level == "human_required" or not definitive:
        status = "manual_required"
    else:
        status = "pass"
    return AutomatedRequirementResult(
        requirement_id=requirement_id,
        title=title,
        automation_level=level,
        status=status,
        checks=checks,
        human_reason=human_reason,
        duration_ms=max(0, int((time.perf_counter() - started) * 1000)),
    )


def _run_checks(synthetic_user: str) -> list[AutomatedRequirementResult]:
    # Lazy imports avoid changing the product modules' startup order.
    from backend.ai import _selected_context
    from backend.drafts import (
        DraftParagraphInput,
        SaveGeneratedEntryBody,
        SourceSnapshotInput,
        _save_generated_entry_for_user,
    )
    from backend.reflections import (
        BlockInput,
        ConnectionInput,
        WorkspaceSaveBody,
        _create_reflection_for_user,
        _save_workspace,
    )

    results: list[AutomatedRequirementResult] = []

    # R1 ------------------------------------------------------------------
    started = time.perf_counter()
    _set_prompt_behavior(synthetic_user, "manual")
    op_started = time.perf_counter()
    r1 = _create_reflection_for_user(synthetic_user, "Prepared one-line thought for automated testing.")
    backend_ms = int((time.perf_counter() - op_started) * 1000)
    connection = _connect()
    try:
        block_count = _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r1.id,))
    finally:
        connection.close()
    results.append(_result(
        "R1",
        "Fast one-line capture",
        "partial",
        [
            _check("One-line thought saves without any block/template", block_count == 0, f"Saved synthetic thought with {block_count} starter blocks in manual mode."),
            _check("Backend save path completes below five seconds", backend_ms < 5000, f"Backend persistence took {backend_ms} ms."),
            _source_check("src/components/QuickThought.tsx", ["autoFocus", "Save & explore blocks", "startQuickCaptureTimer"]),
        ],
        "Table 8 measures human time from screen appearance to a successful save, including discoverability and hesitation. A server self-test cannot simulate a participant noticing and using the control.",
        started,
    ))

    # R2 ------------------------------------------------------------------
    started = time.perf_counter()
    r2 = _create_reflection_for_user(synthetic_user, "R2 fixture")
    blocks = [
        BlockInput(id="r2-a", library_block_id="situation-1", category="situation", question="Relevant?", answer="A", position_x=0, position_y=0, order_index=0),
        BlockInput(id="r2-b", library_block_id="learning-1", category="learning", question="Irrelevant fixture", answer="B", position_x=300, position_y=0, order_index=1),
    ]
    _save_workspace(r2.id, WorkspaceSaveBody(blocks=blocks, connections=[]), synthetic_user)
    after_remove = _save_workspace(r2.id, WorkspaceSaveBody(blocks=[blocks[0]], connections=[]), synthetic_user)
    results.append(_result(
        "R2",
        "Dismiss an irrelevant prompt directly",
        "partial",
        [
            _check("A single block can be removed without deleting the reflection", len(after_remove.blocks) == 1 and after_remove.blocks[0].id == "r2-a", "Workspace snapshot retained the other block after removing the fixture block."),
            _source_check("src/components/ReflectionBlock.tsx", ["title=\"Remove block\"", "onRemove(block.id)"]),
        ],
        "Automation can verify that the dismiss control and data operation exist. It cannot establish that a person understands prompts are optional or can find the dismiss action without moderator help.",
        started,
    ))

    # R3 ------------------------------------------------------------------
    started = time.perf_counter()
    _set_prompt_behavior(synthetic_user, "starter")
    r3a = _create_reflection_for_user(synthetic_user, "R3 first session")
    r3b = _create_reflection_for_user(synthetic_user, "R3 second session")
    connection = _connect()
    try:
        counts = [
            _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r3a.id,)),
            _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r3b.id,)),
        ]
    finally:
        connection.close()
    _set_prompt_behavior(synthetic_user, "manual")
    r3c = _create_reflection_for_user(synthetic_user, "R3 manual reset")
    connection = _connect()
    try:
        manual_count = _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r3c.id,))
        earlier_count = _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r3a.id,))
    finally:
        connection.close()
    results.append(_result(
        "R3",
        "Persistent per-writer prompt default",
        "partial",
        [
            _check("Starter preference persists across two new reflections", counts == [3, 3], f"Starter block counts were {counts}."),
            _check("Reset affects only future reflections", manual_count == 0 and earlier_count == 3, f"New manual reflection has {manual_count} starter blocks; earlier reflection still has {earlier_count}."),
        ],
        "The persistence behavior is automated. The paper also asks whether participants predict and understand that persistence and whether the control has real value; those are human mental-model questions.",
        started,
    ))

    # R4 ------------------------------------------------------------------
    started = time.perf_counter()
    r4 = _create_reflection_for_user(synthetic_user, "R4 fixture")
    _save_workspace(
        r4.id,
        WorkspaceSaveBody(blocks=[BlockInput(id="r4-a", library_block_id=None, category="situation", question="What happened?", answer="Prepared answer", position_x=0, position_y=0, order_index=0)], connections=[]),
        synthetic_user,
    )
    connection = _connect()
    try:
        generated_before = _count(connection, "SELECT COUNT(*) FROM generated_entries WHERE reflection_id = ?", (r4.id,))
    finally:
        connection.close()
    results.append(_result(
        "R4",
        "Generation only after explicit request",
        "partial",
        [
            _check("Saving/filling blocks does not create a generated entry", generated_before == 0, f"Generated-entry count after workspace save: {generated_before}."),
            _source_check("src/components/JournalGeneratorPanel.tsx", ["Review privacy →", "Confirm & generate", 'type Stage = "closed" | "select" | "confirm" | "generating" | "draft"']),
        ],
        "The technical boundary can be checked automatically, but Table 8 also asks whether a participant believes generation happened before the explicit action. That belief cannot be inferred from program state alone.",
        started,
    ))

    # R5 ------------------------------------------------------------------
    started = time.perf_counter()
    r5 = _create_reflection_for_user(synthetic_user, "R5 fixture")
    r5_block = BlockInput(id="r5-source", library_block_id=None, category="feelings", question="How did it feel?", answer="I felt nervous.", position_x=0, position_y=0, order_index=0)
    _save_workspace(r5.id, WorkspaceSaveBody(blocks=[r5_block], connections=[]), synthetic_user)
    saved_r5 = _save_generated_entry_for_user(
        r5.id,
        SaveGeneratedEntryBody(
            model="automated-fixture",
            title="R5 source fixture",
            paragraphs=[DraftParagraphInput(
                id="r5-p1",
                text="I felt nervous.",
                sources=[SourceSnapshotInput(kind="block", block_id=r5_block.id, category=r5_block.category, question=r5_block.question, text=r5_block.answer)],
            )],
        ),
        synthetic_user,
    )
    source_ok = saved_r5.paragraphs[0].source_block_ids == [r5_block.id] and saved_r5.paragraphs[0].sources[0].text == r5_block.answer
    results.append(_result(
        "R5",
        "Source transparency",
        "partial",
        [
            _check("Generated paragraph retains its exact source snapshot", source_ok, f"Stored source block IDs: {saved_r5.paragraphs[0].source_block_ids}."),
            _source_check("src/components/JournalGeneratorPanel.tsx", ["Inspect sources", "source-chip", "Original writer material", "Current generated passage"]),
        ],
        "Source provenance and the visible inspection control can be verified. Whether a writer correctly interprets the source link and distinguishes their wording from system-introduced wording is a comprehension task requiring a person.",
        started,
    ))

    # R6 ------------------------------------------------------------------
    started = time.perf_counter()
    connection = _connect()
    try:
        now = int(time.time())
        r6_id = str(uuid.uuid4())
        connection.execute("INSERT INTO reflections (id, user_google_id, quick_thought, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (r6_id, synthetic_user, "Free writing fixture", now, now))
        connection.execute("INSERT INTO free_writing_entries (id, reflection_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (str(uuid.uuid4()), r6_id, "Prepared free writing", "Neutral prepared content.", now, now))
        connection.commit()
        free_count = _count(connection, "SELECT COUNT(*) FROM free_writing_entries WHERE reflection_id = ?", (r6_id,))
        gen_count = _count(connection, "SELECT COUNT(*) FROM generated_entries WHERE reflection_id = ?", (r6_id,))
    finally:
        connection.close()
    results.append(_result(
        "R6",
        "Complete a reflection with blank writing only",
        "partial",
        [
            _check("Free-writing data can be saved without generated-entry data", free_count == 1 and gen_count == 0, f"Free-writing rows={free_count}; generated-entry rows={gen_count}."),
            _source_check("src/components/Home.tsx", ["Write freely", "onNewFreeWriting"]),
        ],
        "Automation verifies the complete non-generative path exists. It cannot measure whether participants notice the blank-writing alternative or can complete it naturally without guidance.",
        started,
    ))

    # R7 ------------------------------------------------------------------
    started = time.perf_counter()
    r7 = _create_reflection_for_user(synthetic_user, "QUICK-THOUGHT-MUST-NOT-LEAK")
    r7_a = BlockInput(id="r7-selected", library_block_id=None, category="situation", question="Selected", answer="SELECTED-ANSWER", position_x=0, position_y=0, order_index=0)
    r7_b = BlockInput(id="r7-unselected", library_block_id=None, category="feelings", question="Unselected", answer="UNSELECTED-SECRET", position_x=300, position_y=0, order_index=1)
    r7_connection = ConnectionInput(id="r7-edge", source_block_id=r7_a.id, target_block_id=r7_b.id, relation_type="related_to", source_port="right", target_port="left", relation_label=None)
    _save_workspace(r7.id, WorkspaceSaveBody(blocks=[r7_a, r7_b], connections=[r7_connection]), synthetic_user)
    context = _selected_context(r7.id, synthetic_user, [r7_a], [r7_connection], include_quick_thought=False)
    serialized_context = json.dumps(context, ensure_ascii=False)
    selected_only = "SELECTED-ANSWER" in serialized_context and "UNSELECTED-SECRET" not in serialized_context and "QUICK-THOUGHT-MUST-NOT-LEAK" not in serialized_context and context["connections"] == []
    results.append(_result(
        "R7",
        "Only selected material is processed",
        "partial",
        [
            _check("Provider context excludes unselected blocks, unselected quick thought, and edges to unselected blocks", selected_only, "Built the real provider-boundary context from one selected block while another saved block existed."),
            _source_check("src/components/JournalGeneratorPanel.tsx", ["Unchecked blocks", "Other saved reflections", "selectedBlocks", "selectedConnections"]),
        ],
        "The selected-only provider payload is directly testable and this audit never calls Gemini. Table 8 additionally calls for a team/privacy data-flow review and participant understanding of the selection model; those require human review.",
        started,
    ))

    # R8 ------------------------------------------------------------------
    started = time.perf_counter()
    r8 = _create_reflection_for_user(synthetic_user, "R8 fixture")
    r8_block = BlockInput(id="r8-block", library_block_id=None, category="situation", question="What happened?", answer="Fixture", position_x=0, position_y=0, order_index=0)
    _save_workspace(r8.id, WorkspaceSaveBody(blocks=[r8_block], connections=[]), synthetic_user)
    _save_generated_entry_for_user(
        r8.id,
        SaveGeneratedEntryBody(model="automated-fixture", title="R8 journal", paragraphs=[DraftParagraphInput(id="r8-p1", text="Fixture", sources=[SourceSnapshotInput(kind="block", block_id=r8_block.id, category=r8_block.category, question=r8_block.question, text=r8_block.answer)])]),
        synthetic_user,
    )
    connection = _connect()
    try:
        connection.execute("DELETE FROM generated_entries WHERE reflection_id = ?", (r8.id,))
        connection.commit()
        block_after_journal_delete = _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r8.id,))
        journal_after_journal_delete = _count(connection, "SELECT COUNT(*) FROM generated_entries WHERE reflection_id = ?", (r8.id,))
    finally:
        connection.close()
    _save_generated_entry_for_user(
        r8.id,
        SaveGeneratedEntryBody(model="automated-fixture", title="R8 journal recreated", paragraphs=[DraftParagraphInput(id="r8-p2", text="Fixture", sources=[SourceSnapshotInput(kind="block", block_id=r8_block.id, category=r8_block.category, question=r8_block.question, text=r8_block.answer)])]),
        synthetic_user,
    )
    _save_workspace(r8.id, WorkspaceSaveBody(blocks=[], connections=[]), synthetic_user)
    connection = _connect()
    try:
        block_after_workspace_delete = _count(connection, "SELECT COUNT(*) FROM reflection_blocks WHERE reflection_id = ?", (r8.id,))
        journal_after_workspace_delete = _count(connection, "SELECT COUNT(*) FROM generated_entries WHERE reflection_id = ?", (r8.id,))
    finally:
        connection.close()
    independent = block_after_journal_delete == 1 and journal_after_journal_delete == 0 and block_after_workspace_delete == 0 and journal_after_workspace_delete == 1
    results.append(_result(
        "R8",
        "Independent deletion with confirmation",
        "partial",
        [
            _check("Generated entry and workspace blocks have independent persistence", independent, f"After journal delete: blocks={block_after_journal_delete}, journal={journal_after_journal_delete}; after workspace clear: blocks={block_after_workspace_delete}, journal={journal_after_workspace_delete}."),
            _source_check("src/components/ReflectionWorkspace.tsx", ["Delete saved blocks", "ConfirmDialog"]),
            _source_check("src/components/JournalEntryPage.tsx", ["Delete journal", "ConfirmDialog"]),
        ],
        "Deletion independence and confirmation components are testable. The irreversible-deletion evaluation specifically asks what a participant believes will be removed before confirmation; automation cannot read that mental model.",
        started,
    ))

    # R9 ------------------------------------------------------------------
    started = time.perf_counter()
    results.append(_result(
        "R9",
        "Familiar tap-and-type capture",
        "human_required",
        [
            _source_check("src/components/QuickThought.tsx", ["<textarea", "Save & explore blocks", "autoFocus"]),
        ],
        "The code can verify a visible text field and button exist, but Table 8 explicitly requires an inclusive session with participants aged 45+. Age-related discoverability, familiarity, motor interaction, and prior text-editing experience cannot be validly simulated by software.",
        started,
    ))

    # R10 -----------------------------------------------------------------
    started = time.perf_counter()
    results.append(_result(
        "R10",
        "Plain-language processing notice",
        "partial",
        [
            _source_check("src/components/JournalGeneratorPanel.tsx", ["Privacy confirmation", "Will be sent to Gemini", "Will not be sent", "selected block answer", "Unchecked blocks", "Other saved reflections", "Journal model:"]),
        ],
        "Automation can verify that the notice contains the expected disclosure elements and appears in the explicit confirmation stage. The paper specifically requires participants to explain the notice in their own words; comprehension cannot be inferred from the notice merely existing.",
        started,
    ))

    # R11 -----------------------------------------------------------------
    started = time.perf_counter()
    block_library = _read_source("src/lib/blockLibrary.ts").lower()
    risky_terms = [term for term in ["diagnose", "diagnosis", "disorder", "therapy", "therapist", "suicide", "self-harm", "mental illness"] if term in block_library]
    results.append(_result(
        "R11",
        "Privacy/domain expert prompt review",
        "human_required",
        [
            _check("Heuristic clinical-language pre-screen", not risky_terms if block_library else None, "No high-risk clinical terms found by the simple pre-screen." if block_library and not risky_terms else (f"Potential terms found: {', '.join(risky_terms)}" if risky_terms else "Block-library source unavailable.")),
        ],
        "R11 is an organizational requirement: a qualified privacy/domain expert must judge wording, context, possible harm, and policy implications. A keyword scan can assist the reviewer but cannot replace expertise or stakeholder accountability.",
        started,
    ))

    # R12 -----------------------------------------------------------------
    started = time.perf_counter()
    r12 = _create_reflection_for_user(synthetic_user, "R12 fixture")
    r12_block = BlockInput(id="r12-source", library_block_id=None, category="meaning", question="Why did it matter?", answer="Original source.", position_x=0, position_y=0, order_index=0)
    _save_workspace(r12.id, WorkspaceSaveBody(blocks=[r12_block], connections=[]), synthetic_user)
    first = _save_generated_entry_for_user(
        r12.id,
        SaveGeneratedEntryBody(model="automated-fixture", title="Editable", paragraphs=[DraftParagraphInput(id="r12-p1", text="Original generated wording.", sources=[SourceSnapshotInput(kind="block", block_id=r12_block.id, category=r12_block.category, question=r12_block.question, text=r12_block.answer)])]),
        synthetic_user,
    )
    edited = _save_generated_entry_for_user(
        r12.id,
        SaveGeneratedEntryBody(model="automated-fixture", title="Editable", paragraphs=[DraftParagraphInput(id="r12-p1", text="Writer corrected wording.", sources=[SourceSnapshotInput(kind="block", block_id=r12_block.id, category=r12_block.category, question=r12_block.question, text=r12_block.answer)])]),
        synthetic_user,
    )
    results.append(_result(
        "R12",
        "Generated draft remains editable",
        "partial",
        [
            _check("Edited text replaces the previously saved generated wording", first.paragraphs[0].text != edited.paragraphs[0].text and edited.paragraphs[0].text == "Writer corrected wording.", f"Reopened saved text: {edited.paragraphs[0].text!r}."),
            _source_check("src/components/JournalEntryPage.tsx", ["Journal paragraph", "updateParagraph", "Update journal"]),
        ],
        "Editability and persistence can be regression-tested automatically. The Table 8 walkthrough still asks whether a participant can notice, correct, and save unsuitable wording without moderator instruction, which is a usability observation.",
        started,
    ))

    # R13 -----------------------------------------------------------------
    started = time.perf_counter()
    r13 = _create_reflection_for_user(synthetic_user, "R13 fixture")
    r13_blocks = [
        BlockInput(id="r13-custom", library_block_id=None, category="meaning", question="My custom question?", answer="Custom answer", position_x=0, position_y=0, order_index=1),
        BlockInput(id="r13-edit", library_block_id="situation-1", category="situation", question="Edited question text?", answer="Edited answer", position_x=300, position_y=0, order_index=0),
    ]
    saved_r13 = _save_workspace(r13.id, WorkspaceSaveBody(blocks=r13_blocks, connections=[]), synthetic_user)
    custom_ok = any(block.library_block_id is None and block.question == "My custom question?" for block in saved_r13.blocks)
    order_ok = [block.id for block in saved_r13.blocks] == ["r13-edit", "r13-custom"]
    edit_ok = any(block.id == "r13-edit" and block.question == "Edited question text?" for block in saved_r13.blocks)
    results.append(_result(
        "R13",
        "Edit questions, add custom blocks, and reorder",
        "partial",
        [
            _check("Custom block, edited question, and explicit order persist", custom_ok and order_ok and edit_ok, f"Saved order: {[block.id for block in saved_r13.blocks]}."),
            _source_check("src/components/ReflectionBlock.tsx", ["Edit block question", "← Earlier", "Later →"]),
            _source_check("src/components/BlockPalette.tsx", ["Add your own question"]),
        ],
        "The mechanics can be tested automatically. R13 is explicitly provisional in the paper; whether people discover these controls and identify a concrete reason to use them requires participant evidence, not only a passing implementation test.",
        started,
    ))

    # R14 -----------------------------------------------------------------
    started = time.perf_counter()
    results.append(_result(
        "R14",
        "Distinct retention outcomes",
        "partial",
        [
            _source_check("src/components/ReflectionWorkspace.tsx", ["Save blocks only", "Save nothing", "Delete saved blocks"]),
            _source_check("src/components/JournalEntryPage.tsx", ["Export .txt", "Export .md", "Save nothing", "Delete journal", "Update journal"]),
            _check("Blocks and generated entry are stored in independent tables", independent, "Reuses the R8 persistence fixture: each saved form survived deletion of the other."),
        ],
        "Automation can verify the distinct actions exist and their stored states are independent. Table 8 asks the writer to select each option and correctly predict the resulting state; equal visibility and understanding are human-facing properties.",
        started,
    ))

    return results


def _store_run(user_google_id: str, started_at: int, completed_at: int, results: list[AutomatedRequirementResult]) -> AutomatedRun:
    run_id = str(uuid.uuid4())
    summary = {
        "passed": sum(item.status == "pass" for item in results),
        "failed": sum(item.status == "fail" for item in results),
        "manual_required": sum(item.status == "manual_required" for item in results),
        "automated": sum(item.automation_level == "automated" for item in results),
        "partial": sum(item.automation_level == "partial" for item in results),
        "human_required": sum(item.automation_level == "human_required" for item in results),
    }
    if summary["failed"]:
        overall = "fail"
    elif summary["manual_required"] or summary["partial"]:
        overall = "technical_pass_human_followup"
    else:
        overall = "pass"

    connection = _connect()
    try:
        connection.execute(
            """
            INSERT INTO automated_evaluation_runs (
                id, user_google_id, started_at, completed_at, overall_status, summary_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (run_id, user_google_id, started_at, completed_at, overall, json.dumps(summary)),
        )
        for item in results:
            connection.execute(
                """
                INSERT INTO automated_evaluation_results (
                    run_id, requirement_id, title, automation_level, status,
                    checks_json, human_reason, duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    item.requirement_id,
                    item.title,
                    item.automation_level,
                    item.status,
                    json.dumps([check.model_dump() for check in item.checks], ensure_ascii=False),
                    item.human_reason,
                    item.duration_ms,
                ),
            )
        connection.commit()
    finally:
        connection.close()
    return AutomatedRun(
        id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        overall_status=overall,
        summary=summary,
        results=results,
    )


def _row_to_run(connection: sqlite3.Connection, row: sqlite3.Row) -> AutomatedRun:
    result_rows = connection.execute(
        """
        SELECT requirement_id, title, automation_level, status, checks_json, human_reason, duration_ms
        FROM automated_evaluation_results
        WHERE run_id = ?
        ORDER BY CAST(SUBSTR(requirement_id, 2) AS INTEGER)
        """,
        (row["id"],),
    ).fetchall()
    results = [
        AutomatedRequirementResult(
            requirement_id=item["requirement_id"],
            title=item["title"],
            automation_level=item["automation_level"],
            status=item["status"],
            checks=[AutomatedCheck.model_validate(check) for check in json.loads(item["checks_json"] or "[]")],
            human_reason=item["human_reason"],
            duration_ms=item["duration_ms"],
        )
        for item in result_rows
    ]
    return AutomatedRun(
        id=row["id"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        overall_status=row["overall_status"],
        summary=json.loads(row["summary_json"] or "{}"),
        results=results,
    )


@router.post("", response_model=AutomatedRun)
def run_automated_evaluation(
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> AutomatedRun:
    user = current_user_from_cookie(reflectblocks_session)
    started_at = int(time.time())
    synthetic_user = _new_synthetic_user()
    try:
        results = _run_checks(synthetic_user)
    except Exception as exc:
        # Keep the signed-in user's product data untouched and clean fixtures even
        # when a self-test crashes. A hard runner failure is surfaced explicitly.
        raise HTTPException(status_code=500, detail=f"Automated evaluation failed: {type(exc).__name__}: {exc}") from exc
    finally:
        _delete_synthetic_user(synthetic_user)
    return _store_run(user.google_id, started_at, int(time.time()), results)


@router.get("", response_model=list[AutomatedRunSummary])
def list_automated_runs(
    limit: int = Query(default=10, ge=1, le=50),
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> list[AutomatedRunSummary]:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        rows = connection.execute(
            """
            SELECT id, started_at, completed_at, overall_status, summary_json
            FROM automated_evaluation_runs
            WHERE user_google_id = ?
            ORDER BY started_at DESC, completed_at DESC
            LIMIT ?
            """,
            (user.google_id, limit),
        ).fetchall()
        return [
            AutomatedRunSummary(
                id=row["id"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                overall_status=row["overall_status"],
                summary=json.loads(row["summary_json"] or "{}"),
            )
            for row in rows
        ]
    finally:
        connection.close()


@router.get("/{run_id}", response_model=AutomatedRun)
def get_automated_run(
    run_id: str,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> AutomatedRun:
    user = current_user_from_cookie(reflectblocks_session)
    connection = _connect()
    try:
        row = connection.execute(
            """
            SELECT id, started_at, completed_at, overall_status, summary_json
            FROM automated_evaluation_runs
            WHERE id = ? AND user_google_id = ?
            """,
            (run_id, user.google_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Automated evaluation run not found")
        return _row_to_run(connection, row)
    finally:
        connection.close()
