from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

# Import app modules only after .env has been loaded because auth initializes config/db.
from fastapi import FastAPI  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from backend.auth import router as auth_router  # noqa: E402
from backend.reflections import router as reflections_router  # noqa: E402
from backend.preferences import router as preferences_router  # noqa: E402
from backend.ai import router as ai_router  # noqa: E402
from backend.drafts import router as drafts_router  # noqa: E402
from backend.controls import router as controls_router, free_router  # noqa: E402
from backend.evaluation import router as evaluation_router  # noqa: E402
from backend.automated_evaluation import router as automated_evaluation_router  # noqa: E402

app = FastAPI(title="ReflectBlocks API", version="0.8.0")
app.include_router(auth_router)
app.include_router(reflections_router)
app.include_router(preferences_router)
app.include_router(ai_router)
app.include_router(drafts_router)
app.include_router(controls_router)
app.include_router(free_router)
app.include_router(evaluation_router)
app.include_router(automated_evaluation_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
