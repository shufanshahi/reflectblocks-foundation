# Evaluation Enhancement — What Changed and Why (HCI grounding)

Record of the code changes made to extend ReflectBlocks' evaluation system, and which HCI principle each change implements. Written after the fact, from the actual diff, not from a plan.

## 1. What changed (files)

| File | Change |
|---|---|
| `backend/evaluation.py` | `REQUIREMENT_IDS` R1–R14 → R1–R18. 4 new governance columns (`explainability_ok`, `trust_calibration_ok`, `human_control_ok`, `fairness_ok`), migrated in-place via `_ensure_column`. Evidence/metadata allow-lists extended. |
| `src/reflections.ts` | `EvaluationGovernanceReview` type gets the 4 new fields. |
| `src/components/EvaluationPage.tsx` | 4 new requirement protocols (R15–R18) added to the existing table, same shape as R1–R14 (method/procedure/decision/fields). Governance form gets 4 new HCAI rows. R15/R16 evidence auto-fills from the event log, same mechanism already used for R1/R9. |
| `src/components/AISuggestionsPanel.tsx` | Was untracked. Now logs `suggestions_requested`, `suggestion_accepted`, `suggestion_rejected`. |
| `src/components/ReflectionWorkspace.tsx` | Now logs `connection_labeled` alongside the existing `connection_created`. |

Deliberately not changed: `ParticipantEvaluationMode.tsx`'s guided-task wizard. Explained in §4.

## 2. Why these four requirements

The original R1–R14 cover capture, prompts, AI-generation notice, and save/delete. They never touch the app's actual novel surface: the canvas, arrows, AI suggestions, or accessibility. R15–R18 close that:

- **R15** — connect two blocks, label the relationship
- **R16** — AI suggestions are understood as optional
- **R17** — a block placed off-screen can still be found
- **R18** — quick-capture works with keyboard only

## 3. Mapping to HCI principles (Lecture 10)

### Dependent variables, not vibes
The lecture defines a DV as "a measured human behaviour," and lists task completion time, error rate, and retries as examples. Every new requirement's `fields` array (in `EvaluationPage.tsx`) is a DV list, same as the R1–R14 pattern already in the app: `duration_ms`, `without_help`, `completed`, `error_count`. Nothing new was invented here — just extended to cover connections, suggestions, findability, accessibility.

### Formative, not summative evaluation
The lecture separates evaluation done *throughout design* (formative) from evaluation of a finished product (summative). This whole system — decision rules like "revise if X" attached to each requirement — is formative: every task has a redesign trigger, not a pass/fail grade. R15–R18 keep that shape.

### Nielsen's heuristics, applied per requirement
- **R15** (connect+label) → *Visibility of system status* / *match between system and the real world*: can the user see the connector dots and understand what an arrow means.
- **R16** (AI suggestions optional) → *User control and freedom*: the user must be able to ignore a suggestion without penalty. This is also why `suggestion_rejected` is tracked, not just accepted — a heuristic eval only looking at acceptance would miss whether rejection is actually easy.
- **R17** (findability) → *Recognition rather than recall*: the user should not have to remember where a block is, the interface should make it findable (pan/zoom affordance visible, not hidden).
- **R18** (keyboard-only) → *Flexibility and efficiency of use* + *Help and documentation* (focus labels reachable without a mouse) — this is also the app's version of the InMyDay-style inclusive-access requirement referenced in the original evaluation method doc.

### Usability testing vs. analytical evaluation (the lecture's table)
The lecture splits methods by whether users are involved (usability testing: quantitative, controlled) vs not (analytical: expert judgment, no users needed). This is exactly why `automated_evaluation.py`'s `automation_level` field exists, and why R17/R18 are marked `human_required` the same way R11 already was:

| Requirement | automation_level | Why |
|---|---|---|
| R15 | automated | Connection + label round-trip is mechanical — a script can create one and check it persisted |
| R16 | partial | Endpoint shape is checkable; suggestion *quality* and whether a person feels free to ignore it is not |
| R17 | human_required | Whether a person can *find* something is a perception question, not a script question |
| R18 | human_required | Whether a screen-reader/keyboard flow is actually usable needs a human, same reasoning as the lecture's "users need not be present [for analytical], but it has limitations" — the limitation is exactly this: some things can't be judged without a user |

This is also why the guided-task wizard in `ParticipantEvaluationMode.tsx` was **not** extended with hardcoded flows for R17/R18. Faking an automated success signal for something that is, by the lecture's own framework, a human-judgment question would misrepresent analytical coverage as usability-testing coverage.

### HCAI evaluation dimensions (lecture slide 40)
The lecture lists explainability, trust & reliance, human control, fairness & bias, safety & accountability, long-term interaction as HCAI-specific dimensions beyond plain usability — needed because the app uses an AI feature (Gemini suggestions). The 4 new governance columns map directly:

| Governance field | HCAI dimension |
|---|---|
| `explainability_ok` | Explainability |
| `trust_calibration_ok` | Trust & reliance |
| `human_control_ok` | Human control |
| `fairness_ok` | Fairness & bias |

Safety/accountability and long-term interaction are intentionally left out of this checklist — safety is already covered by R11's existing prompt-wording review, and long-term interaction needs repeated-use data a single governance checkbox can't produce (would need the field-pilot layer described separately, not built here).

### Independent variable discipline
The lecture stresses naming both the factor and its levels. Every new field added to the evidence/metadata allow-lists in `evaluation.py` is a fixed categorical value (`connection_labeled: true/false`, not free text) — same discipline the existing R1–R14 evidence already follows, so results stay comparable across sessions instead of drifting into unstructured notes.

## 4. What stayed manual, and why that's correct, not incomplete

Per the lecture's usability-testing/analytical split, three things stay human by design:

- **Whether a person finds/reaches something** (R17, R18) — perception, not a loggable event
- **Heuristic evaluation and cognitive walkthrough** — by definition expert judgment, no code involved
- **Comprehension answers, SUS, interview** — self-report, already fully built, untouched

Automating these would not make the evaluation "more automated" — it would make it wrong, by having code assert something only a human observation can support.
