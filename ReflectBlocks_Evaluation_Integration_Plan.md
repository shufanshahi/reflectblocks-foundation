# Integration Plan: Enhanced Evaluation into ReflectBlocks

Goal: wire the real gaps into code. Cut anything that fakes automation for something a human has to judge anyway, or duplicates data the app already logs.

## Phase 0 — Backend groundwork

**File: `backend/evaluation.py`**
- Extend `REQUIREMENT_IDS` from R1–R14 to R1–R18. New ones: `R15` connect+label blocks, `R16` AI suggestions, `R17` findability (pan/zoom), `R18` accessibility (keyboard-only).
- Extend `governance_review` table with 4 columns via `_ensure_column`: `explainability_ok`, `trust_calibration_ok`, `human_control_ok`, `fairness_ok` — same pattern as existing `data_flow_ok` etc. Update `GovernanceReviewBody` model and `_row_to_governance`.

No other schema change — `events` table already stores arbitrary `event_type` + `metadata`.

## Phase 1 — New event instrumentation (frontend)

Only the actual gap: `AISuggestionsPanel.tsx` has zero tracking today, and nothing logs failed actions.

| Event | File | Trigger | Metadata |
|---|---|---|---|
| `connection_labeled` | `ReflectionWorkspace.tsx`, near existing `connection_created` (~line 387) | user sets/changes a relation label | `{ relation_type, requirement_id: "R15" }` |
| `suggestions_requested` | `AISuggestionsPanel.tsx` | fetch suggestions button pressed | `{ requirement_id: "R16" }` |
| `suggestion_accepted` | `AISuggestionsPanel.tsx`, in `onAddSuggestion` caller | user adds a suggested block | `{ requirement_id: "R16", success: true }` |
| `suggestion_rejected` | `AISuggestionsPanel.tsx` | user dismisses a suggestion | `{ requirement_id: "R16", success: true }` |
| `error_occurred` | wrap existing try/catch blocks in `reflections.ts` callers that currently swallow errors | any failed API call in evaluation mode | `{ action, message }` |

**Deliberately not adding:** pan/zoom telemetry, a "block found" event, a "keyboard task done" event, a "session reopened" event. Findability and accessibility success are already captured by the guided-task start/complete timestamps (Phase 2) — the task either finished or didn't, and a moderator watches *how*. Adding granular click/pan events on top doesn't add signal, just noise. Return-to-app behavior is already sitting in the existing `screen_view` events (timestamp + `reflectionId`) — no new code needed to see it.

## Phase 2 — New guided tasks

**File: `src/components/ParticipantEvaluationMode.tsx`**, extend the `TASKS` array (currently 7 entries):

```ts
{
  id: "connect-and-label",
  title: "Connect blocks with a labeled arrow",
  requirements: ["R15"],
  instruction: "Add two blocks, connect them, and give the connection a relationship label.",
},
{
  id: "ai-suggestion-review",
  title: "Review an AI suggestion",
  requirements: ["R16"],
  instruction: "Open AI suggestions, accept one, and dismiss another.",
},
{
  id: "find-far-block",
  title: "Find a block after panning",
  requirements: ["R17"],
  instruction: "A block was placed off-screen. Pan or zoom to find and select it.",
},
{
  id: "accessibility-pass",
  title: "Keyboard-only capture",
  requirements: ["R18"],
  instruction: "Repeat the quick-capture task using only the keyboard. Moderator observes and records pass/fail directly — no new event type.",
},
```

No other change needed — the component already tracks completion and timing through the existing `/guided-tasks` endpoints for any task id.

## Phase 3 — Automated (code-level) checks

**File: `backend/automated_evaluation.py`**, same pattern as existing R1–R14 fixtures:

- **R15**: create two blocks, POST a connection with a `relation_type`, assert it round-trips on GET. Fully automatable.
- **R16**: call the AI suggestions endpoint with a stub config, assert response shape. Mark `automation_level: "partial"` — can't verify suggestion *quality*, only that the endpoint works.
- **R17 / R18**: mark `automation_level: "human_required"`, same as existing R11. State plainly in `human_reason`: whether a person can find or reach something is not something a script can judge.

## Phase 4 — Field pilot (multi-day usage)

One read endpoint, no new writes — existing events already carry what's needed:

- `GET /api/evaluation/usage-summary?user_id=...&days=7`
- Group existing `events` by day: distinct active days, reflections created, connections created, suggestions accepted vs rejected.
- "Did they come back on their own" is answered directly from `screen_view` timestamp gaps — no new instrumentation required.

## Phase 5 — Manual layers (no code)

- **Heuristic evaluation** — `docs/heuristic-eval-template.md`, Nielsen's 10 with severity 0–4 columns.
- **Cognitive walkthrough** — `docs/cognitive-walkthrough-template.md`, 3-question table per action sequence.
- **HCAI checklist** — the 4 governance columns from Phase 0, added to the existing governance form in `EvaluationPage.tsx` (~line 500). Same UI pattern already there, just more checkboxes.
- **Comprehension answers, SUS, interview** — already fully built, no change.

## Build order
1. Phase 0 — backend fields, unblocks everything else
2. Phase 1 — event calls, cheap, do first
3. Phase 2 — guided tasks
4. Phase 3 — automated checks
5. Phase 4 — usage summary, independent
6. Phase 5 — templates, independent

## Out of scope
- Multi-day pilot deployment logistics (hosting, reminding participants) — operational, not code
- Automating comprehension/SUS/interview/findability/accessibility judgment — these stay human by design, not a gap to close
