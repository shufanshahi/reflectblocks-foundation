# ReflectBlocks — Milestones 6 + 7

This update sits on top of **M5.1 Journal Navigation**. It deliberately leaves the current block-map interaction in place so the team can redesign that later without blocking the rest of the product.

## Recommended integration

Use the patch on the project where Gemini is already working.

**Do not replace your real `.env` or your locally working `backend/ai.py`.** The patch does not include `backend/ai.py`.

Copy/replace:

```text
backend/
  app.py
  controls.py                 NEW
  drafts.py
  evaluation.py               NEW
  reflections.py
  requirements.txt
  test_controls_evaluation.py NEW

src/
  App.tsx
  reflections.ts
  styles.css
  lib/
    draftRecovery.ts          NEW
    usability.ts              NEW
  components/
    ConfirmDialog.tsx         NEW
    EvaluationPage.tsx        NEW
    FreeWritingPage.tsx       NEW
    Home.tsx
    JournalEntryPage.tsx
    JournalGeneratorPanel.tsx
    ReflectionWorkspace.tsx
```

The `.env.example` in the patch is reference only. Keep your real `.env`. The tested local configuration is:

```env
GEMINI_SUGGESTION_MODEL=gemini-3.1-flash-lite
GEMINI_JOURNAL_MODEL=gemini-3.1-flash-lite
```

## Install / restart

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

Do **not** delete `.data/reflectblocks.sqlite3`. New tables are created automatically.

---

# Milestone 6 — proper control

## 1. Free writing

Home now has two equal entry routes:

```text
+ New reflection     Write freely
```

Free writing is a normal document editor with:

- optional title
- large blank-writing area
- no prompts
- no Gemini request
- explicit save
- `.txt` and `.md` export
- local unsaved-draft recovery
- independent deletion

An existing reflection can also open **Free writing** from its workspace or journal.

Database table:

```text
free_writing_entries
  id
  reflection_id UNIQUE
  title
  body
  created_at
  updated_at
```

## 2. Export

Saved journal and free writing can be exported directly from the browser as:

- `.txt`
- `.md`

The export is generated locally; no extra provider receives the text.

## 3. Independent deletion

Deletion scopes are explicit and confirmed:

- **Delete saved blocks** → deletes blocks + semantic arrows only
- **Delete journal** → deletes generated journal only
- **Delete free writing** → deletes free-writing document only
- **Delete reflection** → deletes the entire reflection and all related saved forms

Foreign-key cascades keep the database consistent.

## 4. Save blocks only

The workspace button now says **Save blocks only**. This makes the retention boundary explicit: saving the map does not save an unsaved generated journal.

## 5. Save nothing

Unsaved work has a visible **Save nothing** / discard option:

- unsaved workspace edits restore the last saved map
- unsaved generated draft is discarded without becoming a saved journal
- unsaved journal edits restore the last saved journal
- unsaved free writing restores the last saved version, or exits without creating anything for a new document

Previously saved content is never silently deleted by this action.

## 6. Draft recovery

A local recovery copy is written to browser `localStorage` for:

- workspace edits
- generated-but-unsaved AI draft
- edits to a saved journal
- free writing

After refresh/crash the UI surfaces a recovery message. Explicit save/discard clears the recovery copy.

Recovery is local-device functionality; it does not send the draft to Gemini or the usability logger.

---

# Milestone 7 — polish + evaluation

## Responsive design

The update adds responsive behavior for:

- home/history cards
- workspace controls
- block palette + canvas
- journal editor
- free-writing editor
- privacy/generation panels
- source inspection
- evaluation questionnaire
- confirmation dialogs

The graph canvas remains available on small screens, while non-drag controls remain the accessible alternative for important actions.

## Animations

Subtle transitions/page entry animations are included. `prefers-reduced-motion: reduce` disables them for users who request reduced motion.

## Accessibility

Added/maintained:

- skip-to-content link
- visible keyboard focus
- semantic headings/landmarks
- `aria-live` save/recovery feedback
- accessible confirmation dialogs
- fieldset/legend grouping for SUS questions
- button alternatives to drag-only flows
- responsive touch targets
- `prefers-reduced-motion`
- `prefers-contrast: more` support

## Privacy-conscious usability instrumentation

Instrumentation is **off by default**. It begins only after the participant explicitly starts an Evaluation session and checks consent.

The event logger stores interaction metadata such as:

```text
screen_view
quick_thought_saved
block_added
connection_created
workspace_saved
journal_generation_started
journal_generated
journal_saved
free_writing_created
free_writing_saved
export_clicked
discard_unsaved
delete_action
```

It intentionally does **not** store:

- quick-thought text in usability events
- block answers
- journal text
- free-writing text
- Google profile data in exported study events

Backend metadata uses an allow-list so arbitrary text fields are discarded even if a caller submits them.

## Built-in HCI evaluation flow

Home → **Run HCI evaluation**.

The flow includes:

1. anonymous participant code such as `P01`
2. device type
3. explicit instrumentation consent
4. task protocol
5. 10-item System Usability Scale (SUS)
6. 1–5 ratings for ease, user control, and privacy clarity
7. optional qualitative comments
8. JSON export of the session and interaction events

### Suggested formative task script

Ask the participant to:

1. capture a one-sentence thought;
2. add and answer at least two reflection blocks;
3. connect two ideas;
4. generate a journal using selected material and review the privacy confirmation;
5. inspect a source, edit the journal, and save it;
6. try free writing and export it;
7. use a discard/delete control and explain what they expect it to remove before confirming.

For a class usability study, a practical formative sample is around **5–8 participants** if time is limited. Record task completion, notable errors/confusion, event timestamps, SUS, custom ratings, and think-aloud observations. Treat the SUS score as a standardized usability scale rather than a percentage grade.

---

# Database additions

```text
users
└── reflections
    ├── reflection_blocks
    ├── block_connections
    ├── generated_entries
    │   └── generated_entry_paragraphs
    └── free_writing_entries

evaluation_sessions
└── usability_events
```

No existing table needs to be deleted.

# Validation

Backend test command:

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

This bundle was validated with **23 backend tests, all passing**, including independent deletion, free writing, evaluation consent, event metadata filtering, existing auth/reflection behavior, source provenance, and user isolation.

TypeScript/TSX source files were syntax-transpiled successfully. Full `npm run build` could not be run in the generation environment because package installation timed out, so run locally after `npm install`:

```powershell
npm run typecheck
npm run build
```
