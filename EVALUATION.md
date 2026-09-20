# ReflectBlocks Evaluation — Design, Metrics and Implementation

This is the complete evaluation documentation for ReflectBlocks: what is measured, why each metric was chosen, how it is collected, and how the application implements it. It is written so the evaluation can be rebuilt from scratch by someone who has not seen this codebase.

It replaces and consolidates the earlier separate documents (method, plan, integration plan, implementation notes).

---

## 1. What this evaluation is for

ReflectBlocks is a reflective journaling tool with two unusual properties: thoughts are laid out spatially as connected blocks, and an AI step can reorganise a writer's own material into a journal entry.

The evaluation asks one question: **can people understand and operate this, and do they correctly understand what happens to their words?** It deliberately does *not* ask whether the tool improves wellbeing or produces better writing.

That scope comes from the requirement analysis, which produced three findings:

1. People lose a thought before they manage to write it down.
2. Prompts help only when they are relevant and optional.
3. Writers want to know what the system changed.

Finding 3 is why comprehension, not just task success, is a first-class measure here. A participant can complete every task and still be wrong about where their text went — and for a journaling tool that sends personal writing to a third party, being wrong about that is the failure that matters most.

### Why formative, not summative

Every requirement carries a **decision rule** — a condition that triggers redesign — rather than a grade. This is a formative evaluation run during development to find what to fix, not a summative one run at the end to prove quality. Practically: a requirement is `pass`, `issue`, or `critical`, and `critical` means stop and revise before building further.

---

## 2. The metrics

Each metric below is listed with its justification, its collection mechanism, and its computation. "Automatic" means the app records it with no moderator action; "manual" means a human types or judges it.

### 2.1 Task completion

**What** — whether the participant finished a task, and whether they needed help to do it.

**Why this metric** — the standard first measure in usability testing (Wixon & Wilson). For a formative study it answers the blunt question: is this doable at all? It is also the only metric that distinguishes "slow but successful" from "failed", which matters because slow is acceptable for reflective writing and failure is not.

**Why it matters here** — several requirements are pass/fail by nature. R6 asks whether an entry can be completed *without* AI; either the participant saved a blank-writing entry or they did not.

**Collection — automatic.** Completion is inferred from the real interaction event stream, not self-reported. Each guided task listens for the specific events that constitute its success condition. Example, `blank-writing`:

```
free_writing_created | free_writing_saved  →  objective.blank_saved = true
```

**Computation** — `guided_tasks[].status`, derived by `buildRequirementResults()` in `ParticipantEvaluationMode.tsx`. Across participants: completion rate = participants completing unaided ÷ total.

### 2.2 Time on task

**What** — elapsed time from the participant pressing *Start task* to the task's completion condition being met.

**Why this metric** — a dependent variable in the classical sense: a measured human behaviour that responds to the interface. It detects difficulty that completion alone hides, because a task can be completed and still be painful.

**Why it matters here** — R1 exists because of requirement-analysis finding 1: thoughts are lost before capture. A capture affordance that *works* but takes twenty seconds does not solve the problem it was built for. R1 therefore has an explicit **5-second threshold**.

**Collection — automatic.** Two independent timers:

- **Task timer** — `started_at_ms` set on *Start task*, `duration_ms` computed on completion.
- **Capture timer** — a separate, tighter measure for R1. `startQuickCaptureTimer()` fires when the quick-thought screen appears; `finishQuickCaptureTimer()` on save. This isolates capture from reading the task instructions.

```ts
next.within_5s = Number(next.duration_ms) <= 5000;   // ParticipantEvaluationMode.tsx
```

**Computation** — milliseconds. Report **median and range**, not mean: small samples with one slow participant make means misleading.

> **Known defect.** `quick_capture_timed` fires multiple times per participant when the capture screen is re-entered, and the auto-fill stores the *last* value. In the real sessions this produced three different timings each. Fix the repeated firing before quoting any R1 figure.

### 2.3 Help requests

**What** — how many times a participant asked the moderator for assistance.

**Why this metric** — it operationalises "unaided". A task completed with three hints is not evidence that the interface works, and think-aloud protocol forbids the moderator pointing at controls. Counting requests keeps that boundary visible in the data.

**Why it matters here** — R1's decision rule requires capture to be located *without help*, so this metric can fail a requirement on its own, independent of time.

**Collection — automatic.** A visible "I need help" control in the participant banner increments a counter and emits `participant_help_requested` with the running `help_count`. Requesting help does **not** pause the task timer — help is a cost, and hiding it would flatter the interface.

**Computation** — `help_count === 0` feeds the `without_help` evidence field.

### 2.4 Comprehension accuracy

**What** — whether the participant correctly understands what the system did with their material.

**Why this metric** — this is the metric the study exists for, and it is the one that task success cannot substitute for. Requirement-analysis finding 3 is about understanding, not ability.

**Why it matters here** — the AI step sends personal writing to a third party. A participant who completes generation smoothly while believing nothing was sent has experienced a **critical** failure, not a success.

**Collection — automatic scoring of forced-choice checkpoints.** Checkpoints interrupt the task at the moment of interest and are scored against a fixed key, removing moderator interpretation:

| Checkpoint | Question | Correct answer |
|---|---|---|
| Privacy (R10) | Which material is eligible? | `selected-only` |
| Privacy (R10) | Who processes it? | `gemini-normal-use` |
| Privacy (R10) | Has it been sent already? | `not-sent-in-study` |
| Source (R5) | What does the source chip tell you? | `selected-material` |
| Retention (R14) | After deleting the entry, what remains? | `blocks-remain` |
| Delete scope (R8) | Predicted *before* confirming | `blocks-remain` |
| Preference (R3) | What will the next entry show? | `starter` |

**Computation** — `correct_count / total_count`. The privacy checkpoint requires **all three** correct to pass; anything less, once answered, is `critical`. Rationale: partial understanding of a data boundary is not partial success. Someone who knows the processor but not the scope will still be surprised by what leaves the device.

**Design rule:** ask the prediction *before* the participant can see the answer. The delete-scope question is asked before confirmation, and the retention-status panel must not be shown until after the question — otherwise the interface supplies the answer and the measurement is destroyed.

### 2.5 Error count and hesitations

**What** — wrong actions, accidental navigation, and visible pauses.

**Why this metric** — standard usability measures that capture friction which timing alone misses.

**Collection — MANUAL.** The moderator types these into number fields on the R1 protocol card. **No code writes them.** `discard_unsaved` is the nearest automatic proxy and is not the same thing.

> **Gap, stated plainly.** There is no `error_occurred` event. Error rate cannot currently be computed from logs, and any claim that it is "automatically collected" would be false. To close this, emit an error event from the `catch` blocks in the `reflections.ts` callers and add the key to `_safe_metadata`.

### 2.6 Findability and navigation

**What** — whether a participant can locate a block that is off-screen on the canvas.

**Why this metric** — *recognition rather than recall*. The canvas is effectively infinite; if placing a block puts it beyond retrieval, the spatial model fails. This is specific to ReflectBlocks and is not covered by the original R1–R14 set.

**Collection — MANUAL** (R17). The moderator records whether the block was found, whether help was needed, and time to locate.

> **Gap.** Pan/zoom actions are not instrumented, so "actions vs shortest path" is not computed. The *measurable* half — time to locate, and whether the target was selected — could be automated with a designated target block; only the *why* needs a human.

### 2.7 SUS (System Usability Scale)

**What** — the standard 10-item questionnaire, administered after all tasks.

**Why this metric** — a validated, comparable instrument. It permits comparison against the 68 benchmark and across design iterations.

**Why it is secondary here** — SUS measures perceived usability. It cannot detect that someone misunderstood where their data went. The simulated `SIM-TRUSTING-01` persona exists to make this concrete: SUS 80, and two critical comprehension failures. **A good SUS score never overrides a failed comprehension check.**

**Collection — manual** (participant self-report).

**Computation** — odd items score `value − 1`, even items `5 − value`, summed and multiplied by 2.5, giving 0–100.

### 2.8 Severity status

**What** — each requirement resolves to `not_tested`, `pass`, `issue`, or `critical`.

**Why this metric** — it converts observations into a redesign decision. Adapted from heuristic-evaluation severity ratings, collapsed to the distinctions that change what happens next.

**Computation — automatic** where a guided task covers the requirement:

| Status | Meaning |
|---|---|
| `pass` | Required actions observed **and** comprehension correct |
| `issue` | Actions happened but something was missing, wrong, or help was needed |
| `critical` | A misunderstanding of AI processing (R10) or of deletion scope (R8) |

Only R8 and R10 can auto-escalate to `critical`. These are the two categories the method defines as stop-and-revise.

> **Known defect.** The rules score *declining* to use AI the same as failing. A participant who deliberately never generates gets R4 = `issue` via `generated_after_request ? pass : issue`, even though R6 explicitly endorses blank writing as a valid path. "Did not attempt" and "attempted and failed" should not collapse into one status.

### 2.9 HCAI dimensions

**What** — explainability, trust calibration, human control, fairness.

**Why this metric** — ReflectBlocks includes an AI feature, and usability metrics do not cover whether someone can say *why* a suggestion appeared or whether they over-trust generated text. These are recorded separately so they cannot be averaged away into a usability score.

**Collection — manual**, by a privacy or domain reviewer, as four tri-state fields alongside the four existing privacy fields.

Safety and long-term interaction are deliberately excluded: safety is already covered by R11's prompt-wording review, and long-term reliance needs repeated-use data a single session cannot produce.

---

## 3. Three collection layers

| Layer | Implementation | Users? | Produces |
|---|---|---|---|
| 1. Automated conformance audit | `backend/automated_evaluation.py` | No | Per-requirement pass/fail from real code paths |
| 2. Guided participant mode | `src/components/ParticipantEvaluationMode.tsx` | Yes | Timing, observed actions, scored comprehension |
| 3. Moderator protocol | `src/components/EvaluationPage.tsx` | Yes | Requirement evidence, governance review, SUS |

**Why three.** The layers answer different questions and cost different amounts. Layer 1 is free and catches broken implementations before participant time is spent. Layer 2 removes moderator interpretation from anything a machine can observe. Layer 3 captures what only a human can judge. Running them in that order means no participant session is wasted on a build that was already broken.

### Layer 1 — what an automated audit can and cannot claim

The audit creates a temporary synthetic user, exercises the real persistence and data-flow code, then deletes the fixture data. It never calls Gemini and never touches real reflections.

**It is a conformance test, not participant evidence.** It proves the feature exists and behaves; it says nothing about whether a person understands it. If no one ever uses the app, it still passes. Each requirement is therefore tagged:

| Level | Count | Meaning |
|---|---|---|
| `automated` | 1 (R15) | Fully checkable by code |
| `partial` | 13 | Mechanism checkable, judgment is not |
| `human_required` | 4 (R9, R11, R17, R18) | Only a person can judge it |

A clean run reports `technical_pass_human_followup`: 14 passed, 0 failed, 4 `manual_required`. **`manual_required` is a statement of scope, not a failure.**

Two check kinds: **behavioural** (call the real backend functions and assert what persisted) and **frontend contract** (`_source_check()` greps component source for required control labels).

> The contract checks assert exact UI label strings. Renaming a button breaks the audit until the contract is updated in the same commit. This is deliberate — it prevents the UI and the study protocol silently diverging.

### Layer 1b — separate backend verification

The method requires R7 to be verified technically, because participant comprehension cannot establish what the server actually sends. Three tests in `backend/test_reflections.py` assert against the real provider-boundary builder:

- the payload contains only selected blocks
- the quick thought is included only when explicitly selected
- only connections *between* selected blocks are included

`backend/test_drafts.py` covers provenance integrity: two reflections can save entries using the same client-side paragraph id without colliding (ids are regenerated server-side), so source attribution cannot cross entries or users.

### Layer 2 — the seven guided tasks

A locked, evaluation-only interface. Timing starts on *Start task*; actions are detected from the event stream.

| Task | Requirements | Completion detected from |
|---|---|---|
| `quick-capture` | R1, R9 | `quick_capture_timed` (no think-aloud during the timed run) |
| `optional-structure` | R2, R13 | dismissed, custom block added, question edited, reordered, saved |
| `persistent-default` | R3 | preference change, then two new reflections compared |
| `blank-writing` | R6 | free-writing created or saved, with no generation |
| `generation-boundary` | R4, R7, R10 | notice shown, generation requested, generated, saved |
| `source-editing` | R5, R12 | source chip inspected, paragraph edited, saved |
| `retention-deletion` | R8, R14 | save-nothing, export, delete, then resulting-state question |

**Task 1 is the exception to think-aloud.** Speaking while being timed inflates the measurement, so R1 uses a retrospective explanation immediately afterwards instead.

### Layer 3 — moderator protocol

Each requirement card shows its method, procedure, decision rule, and evidence fields. Some evidence auto-fills from the event log:

| Requirement | Auto-filled from |
|---|---|
| R1 | `quick_capture_timed` (duration) |
| R2 | `block_dismissed`, `block_dismiss_undone`, `suggested_prompt_dismissed` |
| R4 | `generation_cancelled` |
| R9 | session `age_group` (sets `age_45_plus`) |
| R15 | `connection_created`, `connection_labeled` |
| R16 | `suggestions_requested`, `suggestion_accepted`, `suggestion_rejected` |

Auto-filled fields are a starting point; the moderator still sets the status.

---

## 4. Features → evaluation design → requirements

How each product feature was built so that it can be evaluated.

### Quick capture — R1, R9
A single autofocused textarea and a save control, reachable in one step from home. **Design for evaluation:** a dedicated timer isolates capture from instruction-reading, and a retrospective checkpoint asks what the participant expected Save to do. **Metrics:** time on task, help requests, completion. R9 re-reads the same task through an inclusion lens — did it need only visible tap/click-and-type controls, with no gesture or hidden menu.

### Block palette and skip — R2, R13
Blocks are added from a categorised library; each placed block can be skipped, and the skip is undoable. Questions are editable, custom blocks can be added, and order can be changed. **Design for evaluation:** the undo (`block_dismiss_undone`) distinguishes a confident dismissal from a recovered mistake — without it, both look identical in the log. **Metrics:** completion, help requests, dismissal confidence.

### Prompt preference — R3
A persistent per-writer default: fixed starter prompts, or none. **Design for evaluation:** the task deliberately spans *two* newly created reflections, because persistence cannot be observed within one. The participant predicts the second entry's contents before it opens. **Metric:** comprehension (prediction correctness).

### Canvas, connectors and semantic arrows — R15, R17
Blocks are positioned freely and joined by labelled directed arrows. **Design for evaluation:** creating and labelling a connection are separate events, so "drew an arrow" and "gave it meaning" are distinguishable. R17 exists because an infinite canvas can lose things. **Metrics:** completion, findability.

> Two structural findings the simulated personas surface: connector dots require a pointer drag with **no keyboard route**, making R15 unreachable with assistive technology; and on a phone the dots are below touch-target size.

### AI suggestions — R16
Optional next-question suggestions, requested explicitly. **Design for evaluation:** accept *and* reject are both logged. Logging only acceptance would make an ignored panel indistinguishable from a rejected one, and rejection is the evidence that the feature is genuinely optional. **Metric:** trust calibration, comprehension of optionality.

### Generation boundary and privacy notice — R4, R7, R10
Generation happens only after an explicit action, preceded by a notice naming what is sent, to whom, and why. Sources are chosen by explicit selection; generation can be cancelled, including mid-request. **Design for evaluation:** the notice is a hard interrupt so the comprehension checkpoint lands at the exact decision moment. Cancellation turns "can the request be cancelled?" from a question into an observable action. **Metrics:** comprehension (all three privacy questions), completion.

### Source chips — R5, R12
Each generated paragraph carries chips linking back to the exact material behind it; generated wording is editable and edits persist. **Design for evaluation:** provenance is stored as a *snapshot* at generation time, so the link survives later edits to the blocks. This is what makes R5 answerable at all. **Metrics:** comprehension, completion.

### Retention, deletion and the retention-status panel — R8, R14
Save blocks only, save entry, export, save nothing, delete entry, delete everything — each a distinct, independently reversible outcome. A live panel shows what currently exists. **Design for evaluation:** the participant predicts the resulting state *before* confirming; the panel then establishes ground truth. **Metrics:** comprehension, completion. **Both R8 and R14 are decided by prediction accuracy, not by whether the click succeeded.**

### Free writing — R6
A full entry with no prompts and no AI. **Design for evaluation:** its own guided task, so "completed without AI" is observed rather than assumed. **Metric:** completion.

### Accessibility — R18
**Design for evaluation:** capture is repeated using only the keyboard. Whether it *completes* is machine-checkable; whether focus order and labelling are usable is not, so R18 is `human_required`.

---

## 5. Requirement traceability

| ID | Requirement | Feature | Primary metric | Collection | Audit level |
|---|---|---|---|---|---|
| R1 | Fast one-line capture | Quick capture | Time, help | Auto + manual | partial |
| R2 | Dismiss an irrelevant prompt | Block skip + undo | Completion | Auto | partial |
| R3 | Persistent prompt default | Preference control | Comprehension | Auto | partial |
| R4 | Generation only on request | Generation boundary | Comprehension | Auto | partial |
| R5 | Source transparency | Source chips | Comprehension | Auto | partial |
| R6 | Complete entry without AI | Free writing | Completion | Auto | partial |
| R7 | Only selected material sent | Source selection | Comprehension + backend test | Auto | partial |
| R8 | Independent deletion | Retention controls | Comprehension (prediction) | Auto | partial |
| R9 | Familiar tap-and-type | Quick capture | Completion by age group | Manual | human_required |
| R10 | Plain-language notice | Privacy notice | Comprehension (3 questions) | Auto | partial |
| R11 | Expert prompt review | Governance panel | Reviewer judgment | Manual | human_required |
| R12 | Generated text editable | Draft editor | Completion | Auto | partial |
| R13 | Block customisation | Palette controls | Completion | Auto | partial |
| R14 | Distinct retention outcomes | Retention + status panel | Comprehension | Auto | partial |
| R15 | Connect and label blocks | Canvas connectors | Completion | Auto | **automated** |
| R16 | Suggestions understood optional | AI panel | Trust calibration | Auto + manual | partial |
| R17 | Blocks remain findable | Canvas pan/zoom | Findability | Manual | human_required |
| R18 | Usable without a mouse | Keyboard capture | Completion | Manual | human_required |

---

## 6. Implementation reference

### Data flow

```
UI interaction
  → trackUsability(event, reflectionId, metadata)     src/lib/usability.ts
  → POST /api/evaluation/events
  → _safe_metadata() allow-list filter                backend/evaluation.py
  → usability_events table
```

Guided tasks additionally `POST .../guided-tasks/start` and `PUT .../guided-tasks/{id}`, the latter carrying `requirement_results` that write requirement checks directly.

### Storage

| Table | Holds |
|---|---|
| `evaluation_sessions` | Participant code, device, age group, experience, consent, SUS |
| `usability_events` | Interaction event stream |
| `evaluation_requirement_checks` | Per-requirement status, evidence, notes |
| `evaluation_governance_reviews` | Privacy + HCAI review |
| `evaluation_guided_tasks` | Task timing and outcomes |
| `automated_evaluation_runs` / `_results` | Audit runs, independent of any session |

### Privacy by construction

Journal text and block answers are **never** stored in the event log. Three allow-lists (`_safe_metadata`, `_safe_evidence`, `_safe_guided_dict`) filter every write down to categorical outcomes and counts. This is what lets the consent form promise that the event log excludes journal content.

> **The trap:** a key not in the matching allow-list is dropped on write with no error. The event saves; the field vanishes. This has happened twice. After adding instrumentation, record one real event and read it back before trusting a session.

### Export

`GET /api/evaluation/sessions/{id}/export` returns JSON; the export button downloads `reflectblocks-evaluation-<code>.json`. **There is no CSV export** — descriptive statistics require flattening the JSON by hand.

### Session data shape

Fixed vocabularies, not free text:

- `device_type` — `desktop`, `tablet`, `mobile`
- `age_group` — `18_24`, `25_44`, `45_59`, `60_plus`, `prefer_not_to_say`
- `text_editing_experience` — `limited`, `some`, `comfortable`, `advanced`
- `status` — `not_tested`, `pass`, `issue`, `critical`

An incomplete session has `completed_at: null`, `sus: null`, and empty `custom`, because `complete_session()` is what writes all three.

---

## 7. Running a session

1. Start backend and frontend.
2. Sign in as moderator; open the evaluation page.
3. **Run the automated audit first** — implementation failures should be found before spending participant time.
4. Enter participant code, device, age group, text-editing experience; record consent.
5. Hand over the device; start participant tasks. Do not point at controls; use neutral prompts only ("What are you thinking now?").
6. Record evidence and notes as the session runs.
7. Complete SUS and the governance review.
8. Export the session JSON.

**Ethics.** Use fictional scenarios; participants need not disclose real experiences. Participants may skip any task or stop at any time. ReflectBlocks is presented as a reflective-writing tool, not therapy, diagnosis, or crisis support.

---

## 8. Analysis

- Completion rate per task, and per requirement status
- Median and range of time on task — not mean
- Help requests and (once instrumented) error counts
- Comprehension accuracy, especially the three privacy questions separately — the aggregate hides which part of the model is wrong
- SUS, reported alongside but never in place of comprehension
- Severity distribution; any `critical` is a redesign trigger regardless of other results

Simulated sessions in `results/` carry a top-level `_simulated` marker, a `SIM-` participant code, and a `simulated-` filename prefix. **Exclude them from any aggregate over real participants.**

---

## 9. Known gaps

- **No error instrumentation.** Error rate is moderator-typed only; `error_occurred` does not exist.
- **Navigation efficiency is not computed.** Pan/zoom is not logged, so actions-vs-shortest-path is unavailable.
- **The capture timer fires repeatedly**, and auto-fill keeps the last value. Fix before quoting R1 timings.
- **Declining AI is scored as failure.** R4 and R14 penalise a participant who legitimately never generates, contradicting R6.
- **R15–R18 have no guided task.** R15 is covered by the audit; R16–R18 depend on moderator observation.
- **Contract checks are label-coupled.** UI copy changes break the audit until contracts are updated in the same commit.
- **Allow-list drops are silent.** See §6.
- **Comprehension is not backend proof.** R7, R8, R10 and R11 also require technical and expert verification; participant understanding never establishes that the production backend deletes data or sends only what was selected.
