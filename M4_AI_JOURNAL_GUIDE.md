# ReflectBlocks M4 — Gemini configuration + selected-source journal generation

This patch sits on top of the M3.5 draw.io-style semantic canvas.

## 1. Why Gemini may show as disabled even after adding the key

ReflectBlocks reads local secrets from the **project-root** `.env` file — the same directory that contains `package.json`.

Correct:

```text
reflectblocks/
  .env
  package.json
  backend/
  src/
```

Not:

```text
reflectblocks/backend/.env
```

Use:

```env
GEMINI_API_KEY=YOUR_FULL_KEY
GEMINI_SUGGESTION_MODEL=gemini-3.1-flash-lite
GEMINI_JOURNAL_MODEL=gemini-3.8-flash
```

This version re-reads the project `.env` on AI config/request calls, so adding a previously missing key is detected without depending solely on module-import time. Restarting FastAPI after secret/config changes is still recommended.

Verify what the backend sees **without printing the key**:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/ai/config | Format-List
```

Expected:

```text
enabled         : True
suggestionModel : gemini-3.1-flash-lite
journalModel    : gemini-3.8-flash
keySource       : project .env
```

If `enabled` is still `False`, run from the project root:

```powershell
.venv\Scripts\python.exe -c "from dotenv import dotenv_values; v=dotenv_values('.env'); print('env found:', bool(v)); print('Gemini key present:', bool(v.get('GEMINI_API_KEY') or v.get('GOOGLE_API_KEY'))); print('suggestion model:', v.get('GEMINI_SUGGESTION_MODEL')); print('journal model:', v.get('GEMINI_JOURNAL_MODEL'))"
```

This prints only booleans/model names, never the secret.

## 2. Install/update backend dependency

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Then restart FastAPI:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
npm run dev
```

## 3. Recommended model split

```env
GEMINI_SUGGESTION_MODEL=gemini-3.1-flash-lite
GEMINI_JOURNAL_MODEL=gemini-3.8-flash
```

- **3.1 Flash-Lite**: fast enough for 3–4 next-question suggestions and lightweight structured output.
- **3.8 Flash**: use for the final journal organization where nuance, uncertainty preservation, and coherent prose matter more.

For backward compatibility, `GEMINI_MODEL=...` still works. It is used for both tasks only when the task-specific model variables are absent.

## 4. New journal-generation flow

The workspace now has a separate **Generate journal entry** section.

### Step 1 — Select blocks

Only answered blocks can be selected. The quick thought has its own independent checkbox.

### Step 2 — Privacy confirmation

ReflectBlocks shows exactly what will be sent:

- optional quick thought,
- selected block questions + answers,
- semantic relationships only when both endpoints are selected.

It explicitly excludes:

- unchecked blocks,
- other reflections,
- Google profile/history data.

### Step 3 — Gemini structured response

Endpoint:

```text
POST /api/ai/reflections/{reflection_id}/journal
```

Request example:

```json
{
  "include_quick_thought": true,
  "blocks": [
    {
      "id": "feelings-abc",
      "library_block_id": "feelings-1",
      "category": "feelings",
      "question": "How did you feel in the moment?",
      "answer": "I was nervous at first.",
      "position_x": 120,
      "position_y": 80,
      "order_index": 0
    }
  ],
  "connections": []
}
```

Structured response:

```json
{
  "model": "gemini-3.8-flash",
  "title": "Reflecting on the presentation",
  "paragraphs": [
    {
      "id": "p1",
      "text": "I was nervous at first during the presentation.",
      "source_block_ids": ["feelings-abc"],
      "uses_quick_thought": true
    }
  ]
}
```

The backend validates every returned `source_block_id`. Gemini cannot cite an unselected block ID without the response being rejected.

## 5. Generated draft UI

The returned journal is:

- editable paragraph by paragraph,
- titled but fully editable,
- accompanied by source chips,
- explicit about whether the quick thought was used,
- not automatically persisted or accepted.

The original blocks remain unchanged.

## 6. Files in the patch

Replace:

```text
backend/ai.py
backend/app.py
backend/requirements.txt
backend/test_reflections.py
src/reflections.ts
src/components/AISuggestionsPanel.tsx
src/components/ReflectionWorkspace.tsx
src/styles.css
.env.example   (reference only — do NOT replace your real .env)
```

Add:

```text
src/components/JournalGeneratorPanel.tsx
```

Keep your real `.env`.

## 7. Tests

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
npm run typecheck
```

The backend bundle is validated with 12 tests, including a test that the journal endpoint passes only explicitly selected block material into the AI-generation boundary.
