# ReflectBlocks M3.5 — Infinite semantic canvas + Gemini suggestions

This update is designed to sit **on top of the Enhanced Milestone 3 build**.
It keeps Google auth, reflections, the 60-block library, answers, persistence, and history, while replacing the old finite top/bottom-thread canvas with a draw.io-like semantic map.

## What changed

### 1. Effectively infinite canvas
- The visible canvas is now a viewport into world coordinates.
- Drag empty canvas space to pan.
- `Ctrl`/`Cmd` + mouse wheel zooms around the pointer.
- Toolbar buttons support zoom in/out, 100%, and Fit.
- Block coordinates may be negative and are persisted.
- The dotted grid follows pan and zoom.

### 2. Draw.io-style block movement
- Drag **anywhere on a block header** to move it.
- The old dedicated drag handle is gone.
- The old `Earlier` / `Later` controls are removed; the semantic graph is now the meaningful structure.

### 3. Four connection ports per block
Every block exposes:
- top
- right
- bottom
- left

Drag from any connector dot toward another block. You can release anywhere over the target block; ReflectBlocks automatically chooses the nearest target port.

### 4. Rich semantic arrows
The relationship vocabulary now includes:
- is related to
- led to / resulted in
- caused
- triggered
- influenced
- happened because of
- made me feel
- made me think
- revealed
- helped me realize
- matters because
- changed into
- supports
- contrasts with
- depends on
- reminds me of
- next time / leads to action
- custom relationship

Click an arrow or its label to edit it. You can also reverse or delete the arrow. Custom relationships support a writer-authored label.

### 5. Reflection feedback loops are allowed
The previous version rejected cycles. This version intentionally permits them because human reflections can contain feedback loops, e.g.:

`worry -> avoidance -> more worry`

The graph is a semantic reflection map, not a programming AST.

### 6. Optional sound effects
Subtle WebAudio tones are used for:
- adding a block
- connecting blocks
- disconnecting/removing
- saving
- receiving AI ideas

No audio files are downloaded. Sound can be toggled from the canvas toolbar and the preference is stored locally in the browser.

### 7. Optional Gemini next-block suggestions
A new explicit action asks Gemini for 3–4 **optional reflective questions**.

Before anything is sent, the UI shows a confirmation explaining that only the current reflection's:
- quick thought
- current blocks/questions
- current answers
- current semantic relationships

are sent. Past reflections are not queried or sent.

Gemini returns structured suggestions with:
- question
- category
- short rationale
- optional source block to connect from
- suggested relationship type

Adding a suggestion is still the writer's choice. Gemini never automatically inserts a block.

## Files changed / added

Replace or add these files from the patch:

```text
backend/
  app.py
  ai.py                    NEW
  reflections.py
  requirements.txt
  test_reflections.py

src/
  reflections.ts
  styles.css
  lib/
    blockLibrary.ts
    useSoundEffects.ts      NEW
  components/
    AISuggestionsPanel.tsx  NEW
    BlockPalette.tsx
    ConnectionInspector.tsx
    ConnectionLayer.tsx
    ReflectionBlock.tsx
    ReflectionWorkspace.tsx

.env.example
```

Do **not** replace your real `.env` file.

## Environment setup

Keep your existing Google settings and add:

```env
GEMINI_API_KEY=PASTE_YOUR_FULL_GEMINI_KEY_HERE
GEMINI_MODEL=gemini-3.8-flash
```

The Gemini key is server-side only. Never place it in React source, Vite variables, or commit it to Git.

If your Google AI project does not have access to the default model, change only `GEMINI_MODEL` to a model available to your key.

## Install the new Python dependency

From the project folder:

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

No additional frontend package is required.

## Restart

Backend:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

## Database migration

Do not delete `.data/reflectblocks.sqlite3`.

On backend startup, existing `block_connections` tables are migrated with:

```text
source_port
target_port
relation_label
```

Existing arrows default to `right -> left`.

## Recommended test

1. Open an existing reflection.
2. Add `What happened?`, `How did you feel?`, `What were you thinking?`, and `What did you learn?`.
3. Drag blocks by their headers.
4. Pan the blank canvas far in one direction.
5. Zoom out, then Fit.
6. Drag from the right dot on `What happened?` onto `How did you feel?`.
7. Click the arrow and change the relation to `made me feel`.
8. Add a second arrow from the same source to `What were you thinking?`.
9. Create a custom relationship label on another arrow.
10. Save, return Home, reopen the reflection, and confirm all positions/ports/relationships persist.
11. Enable Gemini in `.env`, click `Suggest next blocks`, read the disclosure, confirm, and add one suggestion.

## Automated tests

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

This build was validated with 11 backend tests covering auth, ownership, negative/infinite-canvas coordinates, four-side ports, richer/custom relationships, persistence, cycles, and API-key non-exposure.
