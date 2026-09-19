from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values
from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel, Field

from backend.auth import COOKIE_NAME, current_user_from_cookie
from backend.reflections import DB_PATH, RELATION_TYPES, BlockInput, ConnectionInput

router = APIRouter(prefix="/api/ai", tags=["ai"])

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"

CATEGORY_IDS = {
    "situation",
    "feelings",
    "thoughts",
    "body",
    "people",
    "challenges",
    "meaning",
    "learning",
    "positive",
    "next",
}
AI_RELATIONS = sorted(RELATION_TYPES - {"custom"})


def _runtime_settings() -> tuple[str, str, str, str]:
    """Read AI settings without exposing secrets.

    Environment variables win. The project-root .env file is read on every AI
    request/config check so adding GEMINI_API_KEY during local development does
    not leave a long-running FastAPI process permanently stuck in "disabled".
    """

    file_values = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}

    # For local development, a non-empty project .env value wins so edits are
    # visible immediately. In deployment, where there is normally no .env file,
    # process environment variables are used.
    file_key = (file_values.get("GEMINI_API_KEY") or file_values.get("GOOGLE_API_KEY") or "").strip()
    env_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    key = file_key or env_key

    file_legacy_model = (file_values.get("GEMINI_MODEL") or "").strip()
    env_legacy_model = (os.getenv("GEMINI_MODEL") or "").strip()
    legacy_model = file_legacy_model or env_legacy_model

    suggestion_model = (
        file_values.get("GEMINI_SUGGESTION_MODEL")
        or os.getenv("GEMINI_SUGGESTION_MODEL")
        or legacy_model
        or "gemini-3.1-flash-lite"
    ).strip()

    journal_model = (
        file_values.get("GEMINI_JOURNAL_MODEL")
        or os.getenv("GEMINI_JOURNAL_MODEL")
        or legacy_model
        or "gemini-3.8-flash"
    ).strip()

    source = "project .env" if file_key else ("environment" if env_key else "")

    return key, suggestion_model, journal_model, source


class AISuggestion(BaseModel):
    question: str = Field(min_length=3, max_length=220)
    category: Literal[
        "situation",
        "feelings",
        "thoughts",
        "body",
        "people",
        "challenges",
        "meaning",
        "learning",
        "positive",
        "next",
    ]
    why: str = Field(min_length=3, max_length=240)
    connect_from_block_id: str | None = Field(default=None, max_length=100)
    relation_type: str = Field(default="related_to", max_length=50)


class AISuggestionBundle(BaseModel):
    suggestions: list[AISuggestion] = Field(min_length=1, max_length=5)


class AISuggestionResponse(BaseModel):
    model: str
    suggestions: list[AISuggestion]


class AISuggestionRequest(BaseModel):
    blocks: list[BlockInput] = Field(default_factory=list, max_length=100)
    connections: list[ConnectionInput] = Field(default_factory=list, max_length=300)


class JournalRequest(BaseModel):
    """Only the explicitly selected material is accepted by this endpoint."""

    blocks: list[BlockInput] = Field(min_length=1, max_length=40)
    connections: list[ConnectionInput] = Field(default_factory=list, max_length=100)
    include_quick_thought: bool = False


class JournalParagraph(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=3000)
    source_block_ids: list[str] = Field(default_factory=list, max_length=20)
    uses_quick_thought: bool = False


class JournalBundle(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    paragraphs: list[JournalParagraph] = Field(min_length=1, max_length=10)


class JournalResponse(BaseModel):
    model: str
    title: str
    paragraphs: list[JournalParagraph]


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _load_owned_reflection(reflection_id: str, google_id: str) -> sqlite3.Row:
    connection = _connect()
    try:
        reflection = connection.execute(
            """
            SELECT id, quick_thought
            FROM reflections
            WHERE id = ? AND user_google_id = ?
            """,
            (reflection_id, google_id),
        ).fetchone()
        if reflection is None:
            raise HTTPException(status_code=404, detail="Reflection not found")
        return reflection
    finally:
        connection.close()


def _selected_context(
    reflection_id: str,
    google_id: str,
    blocks: list[BlockInput],
    connections: list[ConnectionInput],
    *,
    include_quick_thought: bool,
) -> dict:
    reflection = _load_owned_reflection(reflection_id, google_id)

    selected: list[dict] = []
    seen_ids: set[str] = set()
    for block in blocks:
        if block.id in seen_ids:
            raise HTTPException(status_code=400, detail="Duplicate selected block")
        seen_ids.add(block.id)
        answer = block.answer.strip()
        if not answer:
            raise HTTPException(status_code=400, detail="Selected blocks must have an answer")
        selected.append(
            {
                "id": block.id,
                "category": block.category,
                "question": block.question.strip()[:500],
                "answer": answer[:5000],
            }
        )

    if not selected:
        raise HTTPException(status_code=400, detail="Select at least one answered block")

    selected_ids = {block["id"] for block in selected}
    selected_connections: list[dict] = []
    for item in connections:
        if item.source_block_id not in selected_ids or item.target_block_id not in selected_ids:
            # The frontend should already filter these. Silently dropping here keeps the
            # provider boundary strict: an unselected block is never represented to AI.
            continue
        selected_connections.append(
            {
                "from": item.source_block_id,
                "to": item.target_block_id,
                "relationship": (item.relation_label or item.relation_type).strip(),
            }
        )

    return {
        "quick_thought": str(reflection["quick_thought"])[:2000] if include_quick_thought else None,
        "blocks": selected,
        "connections": selected_connections[:100],
    }


def _import_genai():
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:  # pragma: no cover - deployment configuration
        raise HTTPException(
            status_code=503,
            detail="Gemini SDK is not installed on the server. Reinstall backend requirements.",
        ) from exc
    return genai, types


def _generate_suggestions(context: dict, api_key: str, model: str) -> AISuggestionBundle:
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini is not configured")

    genai, types = _import_genai()

    prompt = f"""
You are helping a writer use ReflectBlocks, a reflective-writing tool.
Suggest 3 to 4 OPTIONAL next reflection-question blocks based ONLY on the current reflection below.

Rules:
- Ask concise reflective questions; do not write the journal entry for the user.
- Do not diagnose, infer a mental-health condition, or give clinical/therapeutic advice.
- Do not invent facts, feelings, causes, people, or events.
- Prefer gaps in the writer's current reflection map instead of repeating existing questions.
- A suggestion can be about context, feelings, thoughts, body/energy, people, challenges,
  meaning/values, learning/perspective, gratitude/positive details, or a next step.
- If a suggestion clearly follows an existing block, set connect_from_block_id to that exact block id.
  Otherwise use null.
- relation_type must be one of: {", ".join(AI_RELATIONS)}.
- 'why' should briefly explain why this question may be useful; do not claim it is necessary.
- The writer decides whether to add any suggestion.

CURRENT REFLECTION (JSON):
{json.dumps(context, ensure_ascii=False)}
""".strip()

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.35,
                max_output_tokens=1200,
                response_mime_type="application/json",
                response_schema=AISuggestionBundle,
            ),
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, AISuggestionBundle):
            result = parsed
        elif parsed is not None:
            result = AISuggestionBundle.model_validate(parsed)
        else:
            result = AISuggestionBundle.model_validate_json(response.text or "{}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini could not generate suggestions ({type(exc).__name__})",
        ) from exc

    known_ids = {block["id"] for block in context["blocks"]}
    cleaned: list[AISuggestion] = []
    seen_questions: set[str] = set()
    for suggestion in result.suggestions:
        normalized = suggestion.question.strip().lower()
        if not normalized or normalized in seen_questions:
            continue
        seen_questions.add(normalized)
        if suggestion.connect_from_block_id not in known_ids:
            suggestion.connect_from_block_id = None
        if suggestion.relation_type not in RELATION_TYPES or suggestion.relation_type == "custom":
            suggestion.relation_type = "related_to"
        cleaned.append(suggestion)
        if len(cleaned) == 4:
            break

    if not cleaned:
        raise HTTPException(status_code=502, detail="Gemini returned no usable suggestions")
    return AISuggestionBundle(suggestions=cleaned)


def _generate_journal(context: dict, api_key: str, model: str) -> JournalBundle:
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini is not configured")

    genai, types = _import_genai()

    allowed_ids = [block["id"] for block in context["blocks"]]
    quick_thought_rule = (
        "The quick thought is explicitly selected and may be used. Set uses_quick_thought=true for any paragraph that uses it."
        if context.get("quick_thought")
        else "The quick thought was NOT selected. Do not use, paraphrase, or infer from it."
    )

    prompt = f"""
You are the organizing assistant inside ReflectBlocks. The writer has explicitly selected the material below and asked you to organize it into a journal draft.

The writer remains the author. Your task is organization, not interpretation.

Rules:
- Use ONLY the selected block answers and, only when explicitly included, the quick thought below.
- Do not invent events, people, motives, causes, emotions, lessons, certainty, or future intentions.
- Preserve uncertainty and the writer's point of view. Do not make tentative language sound certain.
- Write in first person unless the selected material clearly uses another point of view.
- Light connective wording is allowed only to make the selected material read coherently.
- Do not diagnose, give therapy, moralize, or provide advice.
- Semantic connections are writer-authored hints about how ideas relate. Use them to organize the draft, not as permission to add facts.
- Keep the draft concise. It is better to leave something out than to fabricate detail.
- Every paragraph MUST list the exact source_block_ids it used. IDs must come only from: {allowed_ids}.
- A paragraph may have an empty source_block_ids list ONLY if it uses the explicitly selected quick thought, and then uses_quick_thought must be true.
- Do not cite a source block that did not contribute to that paragraph.
- Produce a short neutral title grounded in the selected material.
- {quick_thought_rule}

SELECTED MATERIAL (JSON):
{json.dumps(context, ensure_ascii=False)}
""".strip()

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2200,
                response_mime_type="application/json",
                response_schema=JournalBundle,
            ),
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, JournalBundle):
            result = parsed
        elif parsed is not None:
            result = JournalBundle.model_validate(parsed)
        else:
            result = JournalBundle.model_validate_json(response.text or "{}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini could not organize the journal ({type(exc).__name__})",
        ) from exc

    allowed = set(allowed_ids)
    cleaned: list[JournalParagraph] = []
    for paragraph in result.paragraphs:
        source_ids = list(dict.fromkeys(paragraph.source_block_ids))
        unknown = [source_id for source_id in source_ids if source_id not in allowed]
        if unknown:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned a source ID that was not selected",
            )
        uses_quick = bool(paragraph.uses_quick_thought and context.get("quick_thought"))
        if not source_ids and not uses_quick:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned text without a valid source",
            )
        text = paragraph.text.strip()
        if not text:
            continue
        cleaned.append(
            JournalParagraph(
                id=paragraph.id,
                text=text,
                source_block_ids=source_ids,
                uses_quick_thought=uses_quick,
            )
        )

    if not cleaned:
        raise HTTPException(status_code=502, detail="Gemini returned no usable journal text")

    return JournalBundle(title=result.title.strip(), paragraphs=cleaned)


@router.get("/config")
def ai_config() -> dict[str, str | bool]:
    api_key, suggestion_model, journal_model, key_source = _runtime_settings()
    return {
        "enabled": bool(api_key),
        # Keep `model` for backward compatibility with the M3.5 frontend.
        "model": suggestion_model if api_key else "",
        "suggestionModel": suggestion_model if api_key else "",
        "journalModel": journal_model if api_key else "",
        "keySource": key_source,
        "envFileFound": ENV_PATH.exists(),
        "disclosure": (
            "Only the material you explicitly confirm is sent to Gemini. Past reflections, other blocks, and account profile data are not sent."
        ),
        "freeTierNotice": (
            "Google's Gemini API free tier may use submitted content to improve its products. Use an appropriate paid/API data setting for sensitive production data."
        ),
    }


@router.post("/reflections/{reflection_id}/suggestions", response_model=AISuggestionResponse)
def suggest_next_blocks(
    reflection_id: str,
    body: AISuggestionRequest,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> AISuggestionResponse:
    user = current_user_from_cookie(reflectblocks_session)
    api_key, suggestion_model, _journal_model, _source = _runtime_settings()

    # Suggestions intentionally use the current reflection. This preserves M3.5
    # behavior, while journal generation below is stricter and accepts only
    # explicitly selected blocks.
    reflection = _load_owned_reflection(reflection_id, user.google_id)
    context = {
        "quick_thought": str(reflection["quick_thought"])[:2000],
        "blocks": [
            {
                "id": block.id,
                "category": block.category,
                "question": block.question,
                "answer": block.answer[:1200],
            }
            for block in body.blocks[:40]
        ],
        "connections": [
            {
                "from": item.source_block_id,
                "to": item.target_block_id,
                "relationship": item.relation_label or item.relation_type,
            }
            for item in body.connections[:100]
        ],
    }
    bundle = _generate_suggestions(context, api_key, suggestion_model)
    return AISuggestionResponse(model=suggestion_model, suggestions=bundle.suggestions)


@router.post("/reflections/{reflection_id}/journal", response_model=JournalResponse)
def generate_journal(
    reflection_id: str,
    body: JournalRequest,
    reflectblocks_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> JournalResponse:
    user = current_user_from_cookie(reflectblocks_session)
    api_key, _suggestion_model, journal_model, _source = _runtime_settings()
    context = _selected_context(
        reflection_id,
        user.google_id,
        body.blocks,
        body.connections,
        include_quick_thought=body.include_quick_thought,
    )
    bundle = _generate_journal(context, api_key, journal_model)
    return JournalResponse(
        model=journal_model,
        title=bundle.title,
        paragraphs=bundle.paragraphs,
    )
