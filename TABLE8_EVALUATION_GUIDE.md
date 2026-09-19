# ReflectBlocks — Table 8 Evaluation Integration Guide

> **Participant Evaluation Mode update:** The main Table 8 study can now be run as a guided evaluation-only flow. A signed-in participant receives one task at a time, starts a real timer, uses the real ReflectBlocks UI, answers auto-scored comprehension checkpoints, and has objective evidence/results stored automatically. The former one-click synthetic evaluator remains available as **Developer technical audit**. See `PARTICIPANT_EVALUATION_MODE_GUIDE.md` for the exact event → scoring → database flow.


This update implements the complete **R1–R14 evaluation protocol from Table 8** inside the existing ReflectBlocks project while keeping normal product behavior intact.

The evaluation UI is available from **Home → Run HCI evaluation**. Study instrumentation is off until a participant explicitly consents and starts a session.

## Important safety / compatibility choices

- Normal ReflectBlocks behavior remains the default.
- The new persistent prompt preference defaults to **manual**, which is the pre-update behavior.
- Existing reflections are not changed when a prompt preference is changed.
- Database changes are additive (`CREATE TABLE IF NOT EXISTS` / safe column migrations). Do **not** delete the existing SQLite database.
- Outside an evaluation session, Gemini suggestions and Gemini journal generation work exactly as before.
- While a Table 8 evaluation session is active, participant writing is **not sent to Gemini**: Gemini block suggestions are paused and journal generation uses a prepared local study fixture. Stop study mode to return to normal Gemini behavior.
- Usability logs and requirement checks use allow-lists and do not store journal text or block answers.

---

## Run the project

Backend, from PowerShell:

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Frontend, in another terminal:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

Keep your current project-root `.env`. The update package intentionally does not replace or redistribute it.

---

# How to run and check every Table 8 method

Start with **Home → Run HCI evaluation**. Enter a participant code, device, age group, text-editing experience, check consent, and press **Start Table 8 evaluation**. The app then shows the five participant-task groups, all 14 requirement checks, the governance review, and the existing SUS questionnaire.

Use neutral/fictional text such as “I felt nervous after a presentation.” Do not ask for real sensitive experiences.

## R1 — Timed one-line thought capture

**Method:** timed capture task.

1. Start the evaluation session.
2. Press **Open ReflectBlocks tasks**.
3. Press **+ New reflection**.
4. Do **not** use concurrent think-aloud during the timed interval.
5. Participant types a short thought and presses **Save & explore blocks**.
6. Return to **Run HCI evaluation**.

The app automatically records `quick_capture_timed` and fills the R1 capture duration when the protocol reloads. Manually record hesitation, errors, and moderator help.

**Paper decision rule implemented in the moderator UI:** revise if fewer than 7/8 participants save within 5 seconds, or if anyone cannot locate the basic capture action without help.

## R2 — Dismiss a prompt directly

**Method:** walkthrough task.

1. In a reflection workspace, add a prompt that is intentionally irrelevant to the fictional situation.
2. Ask the participant to continue naturally without telling them where the dismiss control is.
3. The participant should remove that block with the visible **×** action without leaving the workspace.
4. Record whether they understood prompts are optional and whether help was needed under R2.

The app also logs a privacy-safe `block_dismissed` event during an active study session.

## R3 — Persistent per-writer default across two sessions

**Method:** two-session walkthrough.

1. On Home, expand **Reflection defaults**.
2. Choose **Always add the same 3 starter prompts**.
3. Create a new reflection and verify the three starter blocks appear.
4. Return Home.
5. Before making another reflection, ask the participant what they expect.
6. Create a second reflection and verify the same default is applied.
7. Record prediction, persistence, and understanding under R3.

The preference is stored per signed-in writer in SQLite. Switching back to **Start with no blocks** restores the old/default behavior for future reflections only.

## R4 — No generation before explicit request

**Method:** walkthrough checking the generation boundary.

1. Answer several reflection blocks.
2. Pause before pressing **Generate journal entry**.
3. Ask whether a draft has already been generated and what they think will happen next.
4. Verify there is no generated draft until the separate generation action is requested and confirmed.
5. Record the observation under R4.

## R5 — Source identification comprehension

**Method:** source-comprehension task.

1. During study mode, select answered blocks and confirm generation.
2. ReflectBlocks uses the prepared study draft.
3. In the draft, click an **Inspect sources** chip.
4. Ask the participant which original block contributed to the passage and which wording is writer-provided versus system-introduced.
5. Record source identification, writer-vs-system distinction, and moderator help under R5.

## R6 — Blank-writing-only completion

**Method:** dedicated blank-writing walkthrough.

1. From Home choose **Write freely** (it is at the same main entry point as **+ New reflection**).
2. Enter fictional text.
3. Save it without entering the block workspace or invoking generation.
4. Verify it appears in history and can be reopened.
5. Record completion/no-generation under R6.

## R7 — Selected-only AI data flow

**Method:** selection comprehension + data-flow review + technical verification.

1. Answer multiple blocks.
2. Press **Generate journal entry**.
3. Uncheck at least one answered block.
4. Continue to **Review privacy**.
5. Ask which blocks would be processed and which material is excluded.
6. In study mode, the notice explicitly says no participant text is actually sent to Gemini.
7. Record participant understanding under R7.

Technical verification is covered by the backend test `test_journal_endpoint_sends_only_explicitly_selected_blocks`.

## R8 — Independent deletion and confirmation

**Method:** retention/deletion walkthrough plus technical verification.

1. Have both blocks and a saved generated journal for the same reflection.
2. Delete the generated journal and confirm the scope before deletion.
3. Verify the blocks remain.
4. You can repeat in the opposite direction by deleting saved blocks while keeping the journal.
5. Ask the participant what they expect to remain before they confirm.
6. Record prediction, independent deletion, and any critical misunderstanding under R8.

Technical verification is covered by `test_generated_journal_and_blocks_can_be_deleted_independently`.

## R9 — Inclusive familiar tap/type capture

**Method:** inclusive session with 45+ participants.

1. Record age group when starting the evaluation session.
2. Run the same R1 quick-capture task.
3. Observe whether the participant only needs visible click/tap-and-type controls and whether they need help.
4. For participants in 45–59 or 60+ groups, the R9 age-coverage field is prefilled when the evaluation page reloads.
5. Record R9 as provisional evidence, not as a universal age claim.

## R10 — Processing-notice comprehension

**Method:** comprehension check immediately before generation.

At the **Privacy confirmation** screen, ask the participant in their own words:

- Has generation happened yet?
- Which selected material would be processed?
- What is excluded?
- Who normally processes it?
- Why is it processed?

Record their explanation and any critical consent/data-flow misunderstanding under R10. In study mode the app makes the production boundary visible while keeping the actual participant text local.

## R11 — Privacy/domain expert review

**Method:** stakeholder review, separate from writer-facing tasks.

1. Return to **Run HCI evaluation**.
2. Use the **Governance review** section.
3. Enter the reviewer role (for example privacy reviewer or domain reviewer).
4. Review the fixed reflection prompts for harmful, coercive, misleading, or clinical-sounding wording.
5. Record whether prompt wording has unresolved issues, the number of unresolved flags, and reviewer notes.
6. The same panel also records the parallel R7/R8/R10 data-flow, retention, and notice review.

Do not mark R11 ready while harmful/clinical-sounding prompt wording remains unresolved.

## R12 — Edit generated wording and verify saved copy

**Method:** source/editing correction task.

1. Generate the prepared study draft.
2. Its first passage intentionally contains unsuitable system-introduced wording.
3. Ask the participant to correct/remove/replace it without pointing to the textarea.
4. Press **Save generated entry**.
5. Open/reopen the journal and confirm the saved text is the participant's edited version.
6. Record editing success, saved-copy match, and help under R12.

The backend regression suite also covers edit persistence with `test_saving_edits_updates_same_generated_entry`.

## R13 — Edit question, custom block, reorder

**Method:** customization walkthrough.

Before generation:

1. Press the **pencil** on a block and edit its question.
2. In the block palette press **+ Add your own question** and add a custom block.
3. Use **← Earlier / Later →** on a block to change generation order.
4. Ask why/when the participant would actually use these controls.
5. Record each action and whether a concrete use case was identified under R13.

This remains a provisional requirement; the evaluation UI explicitly says not to keep the feature merely because it was built.

## R14 — Distinct retention outcomes

**Method:** save/export/save-nothing walkthrough with resulting-state questions.

Exercise these outcomes separately:

- **Save blocks only** in the workspace.
- **Save generated entry** in the journal-generation panel.
- **Export .txt / .md** from a saved journal (or free writing where appropriate).
- **Save nothing** for unsaved workspace/journal/free-writing changes.

After each action, ask what still exists, what changed, and whether anything left the application. Record the result under R14.

For deletion, use the R8 confirmation flow and treat a critical irreversible-deletion misunderstanding as an immediate revision trigger.

---

# Evaluation evidence and export

Each R1–R14 card in **Run HCI evaluation** has:

- exact method / procedure guidance,
- the paper's formative revision rule,
- requirement-specific evidence checkboxes/numeric fields,
- status (`Not tested`, `Pass`, `Issue`, `Critical`),
- moderator notes,
- its own **Save R# check** action.

The **Governance review** is stored separately. The existing SUS questionnaire remains available as an additional usability measure.

Press **Export current study JSON** at any point, or **Export full session JSON** after completing the session. The export contains participant code, study demographics, privacy-safe interaction events, requirement checks, governance review, SUS, and custom ratings.

The evidence API deliberately drops arbitrary text fields such as journal content or block answers.

---

# Automated verification

Run:

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
npm run typecheck
```

Expected for this update:

```text
26 backend tests: PASS
TypeScript typecheck: PASS
```

Three added regression tests specifically cover:

- persistent R3 prompt defaults and non-retroactive behavior;
- R1–R14 human-evaluation evidence/governance persistence, export, demographics, and evidence allow-listing;
- the one-click automated Table 8 audit, stored run history, R7 selected-only verification, and isolation of synthetic test data from the signed-in user.

The existing suite continues to cover selected-only AI payloads, independent deletion, source snapshots/provenance, saved edits, auth isolation, workspace ownership, and the other existing functionality.

---

# Files changed

| File | What changed |
|---|---|
| `backend/app.py` | Registers the preferences API; API version bumped to 0.8.0. |
| `backend/preferences.py` | **New.** Per-user persistent prompt-default API for R3. |
| `backend/reflections.py` | Additive `user_preferences` table and optional starter-block creation for new reflections. Default remains manual. |
| `backend/evaluation.py` | Expanded evaluation DB/API: demographics, R1–R14 requirement checks, governance review, privacy-safe evidence allow-list, protocol state and richer export. |
| `backend/test_controls_evaluation.py` | Added regression tests for R3 preference persistence and Table 8 evaluation/governance storage/export. |
| `src/components/EvaluationPage.tsx` | Rebuilt the study page around all R1–R14 Table 8 checks, five task groups, decision rules, governance review, export, and existing SUS. |
| `src/components/QuickThought.tsx` | Evaluation-only automatic R1 capture timing. |
| `src/lib/usability.ts` | Evaluation timer plus existing privacy-safe event tracking. |
| `src/components/Home.tsx` | Adds the unobtrusive `Reflection defaults` control. |
| `src/components/PromptPreferenceControl.tsx` | **New.** UI for the persistent R3 manual/starter default. |
| `src/components/BlockPalette.tsx` | Adds custom-block creation for R13. |
| `src/components/ReflectionBlock.tsx` | Adds question editing and Earlier/Later order controls for R13; existing remove/connect/answer behavior retained. |
| `src/components/ReflectionWorkspace.tsx` | Wires R2/R13 actions and safe usability events without changing connection/canvas behavior. |
| `src/components/JournalGeneratorPanel.tsx` | Evaluation mode uses a prepared local draft, source-comparison task, and no Gemini journal call; normal mode still uses Gemini. |
| `src/components/AISuggestionsPanel.tsx` | Pauses Gemini block suggestions only while study mode is active so participant writing stays local. |
| `src/reflections.ts` | Client types/API helpers for preferences, requirement checks, governance, demographics, and protocol state. |
| `src/styles.css` | Styling/responsive rules for the new evaluation protocol, preference control, custom blocks, and R13 controls. |
| `src/auth.tsx` | TypeScript narrowing fix around the already-existing Google client ID; runtime auth behavior unchanged. |
| `TABLE8_EVALUATION_GUIDE.md` | **New.** This runbook. |

No existing endpoint was removed, no existing reflection/journal/free-writing table was replaced, and no current user data needs to be reset.

## Build-environment note

In the supplied ZIP, `node_modules` and `.venv` were copied from Windows. The source passes `npm run typecheck` in the inspection environment. A Vite production build cannot be executed there using that copied `node_modules` because it contains the Windows Rolldown native binding rather than the Linux one. On your Windows machine, run `npm install` (or reinstall dependencies if needed) before `npm run build`.


---

# One-click automated testing mode

The project now has **two complementary evaluation modes** under **Home → Run HCI evaluation**:

1. **Automated testing mode** — runs an R1–R14 technical audit with synthetic data, stores the run automatically, shows sub-check evidence, and lets you reopen or export the result.
2. **Human Table 8 evaluation** — preserves the paper-faithful moderated walkthrough for the parts that are genuinely about human comprehension, discoverability, inclusive usability, and expert judgment.

Press **Run automated R1–R14 audit** to start the technical audit. The run:

- uses a temporary synthetic account and prepared non-sensitive text;
- never sends content to Gemini;
- exercises the real reflection/default/workspace/generated-entry persistence paths where possible;
- performs source-contract checks for required UI controls/notices;
- automatically stores one result row for every R1–R14 requirement;
- deletes the temporary synthetic account after the run, causing its test reflections/preferences to cascade away;
- leaves the signed-in user's reflections, journals, preferences, and free-writing content untouched.

The automated run is deliberately reported as **technical pass + human follow-up** rather than pretending that a software test can replace an HCI study.

## What can and cannot be automated

| Requirement | Automated coverage | Why human evidence still matters |
|---|---|---|
| R1 | Saves a synthetic one-line thought with no starter blocks and measures the real backend save path; verifies quick-capture UI markers. | The paper measures time from screen appearance through a person's successful action. Software cannot measure human noticing, hesitation, or ability to locate the control. |
| R2 | Exercises block removal while preserving the rest of the reflection; verifies the direct remove control exists. | Whether a participant realizes prompts are optional and finds dismiss without help is a discoverability/mental-model question. |
| R3 | Sets the fixed-starter preference, creates two new reflections, verifies persistence, and confirms old reflections do not change. | The two-session study also asks what the participant expects and whether they understand/value the persisted behavior. |
| R4 | Saves filled blocks and confirms no generated entry exists before an explicit request; verifies the explicit generation stages in the UI. | A participant can still *believe* generation is automatic even when the implementation is correct; that belief must be elicited from the participant. |
| R5 | Creates a generated entry with source snapshots and verifies source-inspection UI support. | Correct source attribution in the database does not prove that a writer can interpret the source link or distinguish writer-provided from system-introduced wording. |
| R6 | Creates/saves a blank-writing fixture without generated content and verifies the first-class Write freely route. | The walkthrough asks whether a person can discover and complete this route without being directed to it. |
| R7 | Strong technical check: builds selected and unselected blocks plus other saved context and verifies the provider-bound payload contains only explicitly selected material. No Gemini request is made. | Table 8 also calls for data-flow/policy review and user understanding of what will be processed. Technical minimization and human comprehension are separate evidence. |
| R8 | Deletes a generated entry while blocks remain, then clears blocks while a generated entry remains; verifies confirmation UI markers. | The HCI criterion asks the participant to predict the irreversible deletion scope before committing. A program cannot observe that mental model. |
| R9 | Verifies that a visible textarea/button implementation exists. | **Cannot be fully automated.** Table 8 explicitly requires an inclusive session with participants aged 45+. Familiarity, motor interaction, discoverability, and experience cannot be validly simulated by code. |
| R10 | Verifies that the processing notice contains the required sent/not-sent/processor/model information before confirmation. | **Comprehension cannot be automated.** The paper requires participants to explain the notice in their own words; presence of correct text is not proof it was understood. |
| R11 | Runs a small heuristic pre-screen for clearly clinical/high-risk terms. | **Cannot be fully automated.** R11 is a privacy/domain-expert review. Context, possible harm, coerciveness, policy implications, and reviewer accountability require qualified human judgment. |
| R12 | Saves generated text, edits it through the real persistence helper, reopens it, and verifies the corrected version replaced the prior saved wording. | The walkthrough additionally tests whether a participant can discover and use editing without moderator instruction. |
| R13 | Persists an edited question, a custom block, and changed ordering; verifies the relevant controls exist. | R13 is provisional in the paper. Whether people discover these controls and have a concrete reason to use them is participant evidence. |
| R14 | Verifies separate retention controls exist and reuses the independent-state test from R8. | The study asks users to predict what remains after each outcome and whether the options are equally understandable/visible; those are human-facing properties. |

## Stored automated results

Automated runs are stored in two additive SQLite tables:

- `automated_evaluation_runs` — owner, timestamps, overall status, aggregate counts;
- `automated_evaluation_results` — R1–R14 status, automation level, sub-check evidence, duration, and the reason human follow-up is still required.

API endpoints:

```text
POST /api/evaluation/automated-runs
GET  /api/evaluation/automated-runs
GET  /api/evaluation/automated-runs/{run_id}
```

The UI shows run history and provides **Export JSON** for the selected automated run.

## Interpretation of statuses

- **Pass** means the available technical checks passed. It does **not** automatically mean the HCI requirement has been empirically validated.
- **Fail** means at least one deterministic implementation/data-flow check failed and should be fixed before the relevant human study.
- **Manual required** is used where the Table 8 method fundamentally depends on real participants or expert review (currently R9 and R11).
- The run-level status **technical_pass_human_followup** means no technical failure was found, but participant/expert evidence is still required before claiming the complete Table 8 evaluation passed.

This separation is intentional: it gives the team a fast regression suite before every study while preserving the validity of the human-centered evaluation described in the report.
