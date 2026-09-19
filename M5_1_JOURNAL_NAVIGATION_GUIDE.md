# ReflectBlocks M5.1 — Journal visibility + dedicated editor

This patch sits on top of Milestone 5. It does **not** replace `backend/ai.py` or `.env`, so keep your currently working Gemini configuration.

## What changes

### Home
Each reflection is now a card with explicit destinations:

- **Open workspace** — returns to the block/reflection map.
- **Open journal →** — appears when that reflection has a saved generated entry.

Saved journals are also surfaced directly on the card with their title and update time.

### Dedicated journal page
`Open journal →` opens a document-style editor separate from the block workspace. The user can:

- edit the journal title,
- edit every saved paragraph,
- inspect the source chips for each paragraph,
- save/update the journal,
- jump back to the workspace without changing block data.

### Workspace
When a saved journal exists, the journal section now displays it as a prominent card with **Open journal →** instead of hiding it as a small text link.

## Copy these files

```text
backend/
  app.py
  reflections.py

src/
  App.tsx
  reflections.ts
  styles.css
  components/
    Home.tsx
    JournalEntryPage.tsx          NEW
    JournalGeneratorPanel.tsx
    ReflectionWorkspace.tsx
```

`backend/test_drafts.py` is included only if you want the updated automated test suite.

## Do not replace

```text
backend/ai.py
.env
backend/auth.py
backend/drafts.py
```

This is important if your Gemini setup is currently working.

## Database
No reset or migration command is needed. The home history endpoint now LEFT JOINs the existing `generated_entries` table to expose only two bits of journal metadata:

- `generated_entry_title`
- `generated_entry_updated_at`

The actual journal remains in the existing generated-entry tables.

## Run

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

```powershell
npm run dev
```

## Test flow

1. Save a generated journal.
2. Return to ReflectBlocks home.
3. The reflection card should display **Journal saved** and the journal title.
4. It should have both **Open workspace** and **Open journal →**.
5. Open the journal.
6. Change the title or paragraph text.
7. Click **Save changes** / **Update journal**.
8. Return home and reopen the journal; the edits should persist.
9. Click a source chip and confirm source inspection still works.
10. Open the workspace and confirm the blocks were not modified by journal edits.

## Validation

Backend suite after this patch: **18 tests, OK**.
The modified TS/TSX files were syntax-parsed with TypeScript with **0 syntax diagnostics**. A full Vite typecheck was not run in the build container because frontend dependencies were not installed there.
