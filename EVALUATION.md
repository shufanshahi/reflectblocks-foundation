# ReflectBlocks Evaluation Method

How evaluation actually works in this codebase, as implemented. `ReflectBlocks_Evaluation_Method.md` describes the academic method; this file documents the running system.

## Scope

The evaluation checks whether people can understand and operate ReflectBlocks — capture, optional prompts, the AI-generation boundary, source attribution, and retention/deletion. It does not measure wellbeing, writing quality, or whether ReflectBlocks beats ordinary journaling.

## Three layers

| Layer | Where | Users needed | What it produces |
|---|---|---|---|
| Automated conformance audit | `backend/automated_evaluation.py` | No | Pass/fail per requirement, from real code paths |
| Guided participant mode | `src/components/ParticipantEvaluationMode.tsx` | Yes | Task timing, auto-detected actions, comprehension answers |
| Moderator protocol | `src/components/EvaluationPage.tsx` | Yes | Requirement evidence, governance review, SUS |

Layers are independent. The audit can run any time; the other two need a session.

---

## Layer 1 — Automated conformance audit

Creates a temporary synthetic user, exercises the real persistence and data-flow code, then deletes the fixture data. It never calls Gemini and never touches real reflections or prompt preferences.

Two kinds of check:
- **Behavioural** — create blocks/connections/entries through the actual backend functions and assert what persisted (selection boundaries, independent deletion, edit-save round-trips).
- **Frontend contract** — `_source_check()` greps component source for required control labels and markers.

Each requirement is tagged with an automation level:

| Level | Meaning |
|---|---|
| `automated` | Fully checkable by code |
| `partial` | Mechanics checkable, judgment is not |
| `human_required` | Only a person can judge it (e.g. R11 expert prompt review) |

The audit covers **R1–R18**. A clean run reports `technical_pass_human_followup`: 14 passed, 0 failed, 4 `manual_required` (R9, R11, R17, R18). `manual_required` is a statement of scope, not a failure — those requirements are waiting on participant or expert evidence.

Run it from the evaluation page ("Run automated audit") or `POST /api/evaluation/automated-runs`. Results are stored in `automated_evaluation_runs` / `automated_evaluation_results` and can be re-opened or exported as JSON.

**Important:** the frontend-contract checks assert exact UI label strings. Renaming a button in the UI will fail the audit until the contract in `automated_evaluation.py` is updated to match. Both must be changed in the same commit.

### Separate backend verification (`backend/test_reflections.py`)

The method requires R7 to be verified technically, not only through participant comprehension. Three unit tests do this against the real provider-boundary builder:

- the Gemini payload contains only selected blocks
- the quick thought is included only when explicitly selected
- only connections *between* selected blocks are included

`backend/test_drafts.py` additionally covers provenance integrity: two reflections can save entries using the same client-side paragraph id without colliding. Paragraph ids are now re-generated server-side for this reason, so source attribution cannot cross entries or users.

The suite is 31 tests. Run with `python -m pytest backend -q`.

---

## Layer 2 — Guided participant mode

A locked, evaluation-only interface. Each task shows an instruction screen, timing starts when the participant presses Start task, and observable actions are detected from the event stream rather than self-reported.

Seven tasks:

| Task | Requirements | Completion detected from |
|---|---|---|
| `quick-capture` | R1, R9 | `quick_capture_timed` (no think-aloud during the timed run) |
| `optional-structure` | R2, R13 | block dismissed, custom block added, question edited, reordered, workspace saved |
| `persistent-default` | R3 | preference change, then two new reflections compared |
| `blank-writing` | R6 | free-writing created or saved, with no generation |
| `generation-boundary` | R4, R7, R10 | privacy notice shown, generation requested, generated, saved |
| `source-editing` | R5, R12 | source chip inspected, paragraph edited, saved |
| `retention-deletion` | R8, R14 | save-nothing, export, delete, then a resulting-state question |

Comprehension checkpoints interrupt tasks 5–7 and are auto-scored. Results go to `evaluation_guided_tasks` with duration, status, objective observations, and comprehension answers.

---

## Layer 3 — Moderator protocol

The evaluation page carries the full R1–R18 protocol. Each requirement shows its method, procedure, and decision rule, plus evidence fields the moderator fills in during the session.

| ID | Requirement | Primary verification |
|---|---|---|
| R1 | Fast one-line capture | Timed task + automated timing |
| R2 | Dismiss an irrelevant prompt directly | Guided task + event log |
| R3 | Persistent per-writer prompt default | Two-reflection walkthrough |
| R4 | Generation only after explicit request | Prediction question + cancellation event |
| R5 | Source transparency | Source-chip comprehension |
| R6 | Complete a reflection with blank writing only | Blank-writing task |
| R7 | Only selected material is processed | Selection task + backend check |
| R8 | Independent deletion with confirmation | Deletion task + backend check |
| R9 | Familiar tap-and-type capture | R1 task, recorded by age group |
| R10 | Plain-language processing notice comprehension | Comprehension checkpoint |
| R11 | Privacy/domain expert prompt review | Governance review only |
| R12 | Generated wording remains editable and edits are saved | Edit, save, reopen |
| R13 | Block customization before generation | Guided task |
| R14 | Distinct retention outcomes | Retention walkthrough + retention status panel |
| R15 | Connect blocks with a labeled relationship | Automated round-trip + moderator task |
| R16 | AI suggestions are understood as optional | Moderator task + event log |
| R17 | Blocks remain findable on the canvas | Moderator observation |
| R18 | Core capture is usable without a mouse | Moderator observation |

Some evidence auto-fills from the event log when the session contains the relevant events, using the same mechanism as R1 timing and R9 age group:

| Requirement | Auto-filled from |
|---|---|
| R2 | `block_dismissed`, `block_dismiss_undone`, `suggested_prompt_dismissed` |
| R4 | `generation_cancelled` |
| R15 | `connection_created`, `connection_labeled` |
| R16 | `suggestions_requested`, `suggestion_accepted`, `suggestion_rejected` |

Auto-filled fields are a starting point, not a verdict — the moderator still sets the pass/issue/critical status. R17 and R18 stay fully manual: whether a person can find or reach something is not something a script can judge.

### Retention status panel

`RetentionStatus.tsx` shows a live snapshot of what currently exists for a reflection — quick thought, block count, generated entry, free writing — on the workspace, journal, and free-writing pages.

This matters for R8 and R14. The protocol asks the participant *"what information do you believe still exists?"* after each retention action. Ask the question **before** letting them look at the panel, then use the panel to establish ground truth. Used the other way round it destroys the evidence.

### Undo and cancellation

Two affordances were added that change what the tasks observe:

- **Skip a prompt** is now undoable (`block_dismiss_undone`), so R2 can distinguish a confident dismissal from a recovered mistake.
- **Generation can be cancelled** (`generation_cancelled`), including mid-request. R4's boundary question — *"can the request be cancelled?"* — is now a real action a participant can take, not just a comprehension question.

### Governance review

A privacy or domain reviewer records eight judgments, separate from participant tasks:

- **Privacy/data** — data flow (R7), retention scope (R8), processing notice (R10), prompt wording (R11), plus an unresolved-flag count
- **HCAI** — explainability, trust calibration, human control, fairness

Stored in `evaluation_governance_reviews`.

### SUS

The standard 10-statement System Usability Scale, scored 0–100, plus ease / control / privacy-clarity ratings and free-text comments. SUS is a secondary measure: a good score does not demonstrate correct understanding of source attribution, data flow, or deletion.

---

## Event instrumentation

`src/lib/usability.ts` sends interaction events to `POST /api/evaluation/events` while a session is active. Events cover screen views, block add/edit/dismiss/reorder, connection created and labeled, AI suggestions requested/accepted/rejected, generation steps, save/export/delete/discard, and moderator help requests.

Events that carry requirement evidence directly:

| Event | Requirement | Records |
|---|---|---|
| `block_dismissed` / `block_dismiss_undone` | R2 | Whether a prompt was skipped, whether it had already been answered, and whether the skip was undone (auto-fills R2 evidence) |
| `suggested_prompt_dismissed` | R2 | A suggested prompt was declined |
| `generation_cancelled` | R4 | Generation was abandoned, and whether a request was already in flight (auto-fills R4 evidence) |
| `connection_created` / `connection_labeled` | R15 | An arrow was drawn and given a relationship |
| `suggestions_requested` / `suggestion_accepted` / `suggestion_rejected` | R16 | Per-suggestion accept and reject, with category |
| `discard_unsaved` (`workspace_leave`, `journal_leave`) | R14 | Leaving without saving |

**Privacy:** the backend keeps a strict allow-list (`_safe_metadata`, `_safe_evidence`, `_safe_guided_dict`). Journal text and block answers are never stored in the event log — only categorical outcomes and counts. Adding a new metadata field to a `trackUsability` call is not enough: unless the key is in the allow-list it is silently dropped before storage.

## Storage and export

| Table | Holds |
|---|---|
| `evaluation_sessions` | Participant code, device, age group, experience, consent, SUS |
| `usability_events` | Interaction event stream |
| `evaluation_requirement_checks` | Per-requirement status, evidence, notes |
| `evaluation_governance_reviews` | Privacy + HCAI review |
| `evaluation_guided_tasks` | Guided task timing and outcomes |
| `automated_evaluation_runs` / `automated_evaluation_results` | Audit runs, independent of any session |

Export via `GET /api/evaluation/sessions/{id}/export`, or the export button, which downloads **JSON** (`reflectblocks-evaluation-<participant_code>.json`). There is no CSV export; flattening for spreadsheet analysis is a separate step.

## Extending the protocol

Adding a requirement or a new piece of evidence touches more than one place, and the failure mode is silent. In order:

1. **`backend/evaluation.py`** — extend `REQUIREMENT_IDS`, and add any new evidence key to the `_safe_evidence` allow-list. Add new event metadata keys to `_safe_metadata`.
2. **`src/components/EvaluationPage.tsx`** — add the protocol entry (method, procedure, decision, fields). Counters derive from `REQUIREMENTS.length`, so they update themselves.
3. **`src/lib/usability.ts` call sites** — add the `trackUsability` call if the evidence should auto-fill, then read it in the `loadProtocol` effect.
4. **`backend/automated_evaluation.py`** — extend `REQUIREMENTS` and add a result block, even if it is only `human_required`. A requirement absent from the audit is silently missing from the run rather than reported as out of scope.
5. **`backend/test_controls_evaluation.py`** — the audit test asserts the exact result count in two places.

**The trap:** a `trackUsability` field or evidence key that is not in the matching allow-list is dropped on write. No error, no warning — the event saves, the field is simply gone. This has happened twice. After adding instrumentation, record one real event and read it back before trusting a session.

## Running a session

1. Start backend and frontend.
2. Sign in as moderator, open the evaluation page.
3. Optionally run the automated audit first, so implementation failures are known before spending participant time.
4. Enter participant code, device, age group, and text-editing experience; record consent.
5. Hand over the device and start participant tasks.
6. Fill in requirement evidence and notes as the session runs.
7. Complete the SUS and the governance review.
8. Export the session JSON.

## Known gaps

- **R15–R18 have no guided task.** They are moderator-run, not part of the seven-task wizard. R15 is covered by the automated audit; R16–R18 depend on moderator observation.
- **Frontend-contract checks are label-coupled.** UI copy changes break the audit until the contracts are updated. Control labels changed in the recent round (`Skip this prompt`, `Delete blocks only`, `Delete everything`, `Organize my entry`, `Export entry (.txt)`) and the contracts were updated with them, so the audit passes — but any protocol text or printed moderator script that still names the old labels is now stale.
- **Interface comprehension is not backend proof.** R7, R8, R10 and R11 also need technical and expert verification; participant understanding alone does not establish that the production backend deletes data or sends only selected blocks.
- **Allow-list drops are silent.** Instrumentation that is not allow-listed fails without an error. See *Extending the protocol*.
- **No CSV export.** Descriptive statistics (completion rates, medians, error counts) require flattening the JSON export by hand.
