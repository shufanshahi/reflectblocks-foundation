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

Run it from the evaluation page ("Run automated audit") or `POST /api/evaluation/automated-runs`. Results are stored in `automated_evaluation_runs` / `automated_evaluation_results` and can be re-opened or exported as JSON.

**Important:** the frontend-contract checks assert exact UI label strings. Renaming a button in the UI will fail the audit until the contract in `automated_evaluation.py` is updated to match.

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
| R2 | Dismiss an irrelevant prompt directly | Guided task |
| R3 | Persistent per-writer prompt default | Two-reflection walkthrough |
| R4 | Generation only after explicit request | Prediction question before generating |
| R5 | Source transparency | Source-chip comprehension |
| R6 | Complete a reflection with blank writing only | Blank-writing task |
| R7 | Only selected material is processed | Selection task + backend check |
| R8 | Independent deletion with confirmation | Deletion task + backend check |
| R9 | Familiar tap-and-type capture | R1 task, recorded by age group |
| R10 | Plain-language processing notice comprehension | Comprehension checkpoint |
| R11 | Privacy/domain expert prompt review | Governance review only |
| R12 | Generated wording remains editable and edits are saved | Edit, save, reopen |
| R13 | Block customization before generation | Guided task |
| R14 | Distinct retention outcomes | Retention walkthrough |
| R15 | Connect blocks with a labeled relationship | Moderator task + event log |
| R16 | AI suggestions are understood as optional | Moderator task + event log |
| R17 | Blocks remain findable on the canvas | Moderator observation |
| R18 | Core capture is usable without a mouse | Moderator observation |

R15 and R16 evidence auto-fills from the event log when the session contains the relevant events — the same mechanism already used for R1 timing and R9 age group. R17 and R18 stay fully manual: whether a person can find or reach something is not something a script can judge.

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

**Privacy:** the backend keeps a strict allow-list (`_safe_metadata`, `_safe_evidence`, `_safe_guided_dict`). Journal text and block answers are never stored in the event log — only categorical outcomes and counts.

## Storage and export

| Table | Holds |
|---|---|
| `evaluation_sessions` | Participant code, device, age group, experience, consent, SUS |
| `usability_events` | Interaction event stream |
| `evaluation_requirement_checks` | Per-requirement status, evidence, notes |
| `evaluation_governance_reviews` | Privacy + HCAI review |
| `evaluation_guided_tasks` | Guided task timing and outcomes |

Export via `GET /api/evaluation/sessions/{id}/export`, or the export button, which downloads **JSON** (`reflectblocks-evaluation-<participant_code>.json`). There is no CSV export; flattening for spreadsheet analysis is a separate step.

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

- **Coverage counters say 14, protocol has 18.** The automated audit runs R1–R14 and the evaluation page counters read `/14`. R15–R18 exist in the protocol and are accepted by the backend, so a moderator can record them, but they are not reflected in the automated run or the coverage number.
- **R15–R18 have no guided task.** They are moderator-run, not part of the seven-task wizard.
- **Frontend-contract checks are label-coupled.** UI copy changes break the audit until the contracts are updated.
- **Interface comprehension is not backend proof.** R7, R8, R10 and R11 also need technical and expert verification; participant understanding alone does not establish that the production backend deletes data or sends only selected blocks.
