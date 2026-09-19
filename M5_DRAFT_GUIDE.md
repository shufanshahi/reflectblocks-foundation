# ReflectBlocks Milestone 5 — Saved editable draft + source inspection

This milestone sits on top of the current M4 AI generation flow. It deliberately leaves the block canvas and Gemini implementation alone.

## What Milestone 5 adds

1. **Editable output**
   - Generated title and every generated paragraph remain ordinary editable fields.
   - Editing marks the generated entry as unsaved.
   - AI generation never auto-saves.

2. **Source inspection**
   - Every source chip is now clickable.
   - The inspector shows the original quick thought/block material next to the current generated paragraph.
   - Source snapshots are stored with the generated entry so provenance survives later edits/removal of reflection blocks.

3. **Save generated entry**
   - `Save generated entry` is a separate explicit action.
   - One current saved generated entry is stored per reflection.
   - Saving again updates the same generated entry rather than creating duplicates.
   - Reopening a reflection exposes the saved entry through `Inspect or edit`.
   - Saving the generated entry does not alter the reflection blocks.

## Files in the patch

### New backend files

```text
backend/drafts.py
backend/test_drafts.py
```

### Replace

```text
backend/app.py
src/reflections.ts
src/components/JournalGeneratorPanel.tsx
src/styles.css
```

### Leave your working Gemini files alone

Do not replace your locally working:

```text
backend/ai.py
.env
```

This is important if you already have both AI tasks working with:

```env
GEMINI_SUGGESTION_MODEL=gemini-3.1-flash-lite
GEMINI_JOURNAL_MODEL=gemini-3.1-flash-lite
```

## Database migration

No database deletion is required. On backend startup, Milestone 5 creates:

```text
generated_entries
generated_entry_paragraphs
```

The paragraph table stores a JSON snapshot of its source material. That snapshot contains only the sources already attributed to the generated paragraph.

This design keeps generated text and original blocks as distinct saved objects. Removing or changing blocks later does not silently rewrite the source record attached to an already-saved generated entry.

## New API endpoints

```text
GET /api/reflections/{reflection_id}/generated-entry
PUT /api/reflections/{reflection_id}/generated-entry
```

`GET` returns the saved generated entry or `null`.

`PUT` explicitly saves the current edited title, paragraphs, model name, and source snapshots.

## Recommended test flow

1. Open a reflection with answered blocks.
2. Generate an entry through source selection + privacy confirmation.
3. Edit the title.
4. Edit one paragraph.
5. Click a source chip and confirm the source inspector shows the original writer material and current generated passage.
6. Click **Save generated entry**.
7. Return to Reflections/Home.
8. Reopen the same reflection.
9. In the Journal draft section click the saved entry.
10. Confirm the edited title, edited paragraph, and source inspection all persist.
11. Optionally remove a reflection block, save the workspace, reopen the saved generated entry, and confirm its stored source snapshot is still inspectable.

## Run

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
npm run dev
```

## Tests

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

This build passes 17 backend tests, including five Milestone 5 persistence/provenance tests.
