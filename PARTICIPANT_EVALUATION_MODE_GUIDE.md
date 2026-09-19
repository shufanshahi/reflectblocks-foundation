# ReflectBlocks — Participant Evaluation Mode

This update turns the Table 8 evaluation into a **guided, evaluation-only participant experience** instead of asking the moderator to manually tick every R1–R14 item.

The existing one-click synthetic checker is still available, but it is now labeled **Developer technical audit**. It tests implementation conformance with synthetic fixtures. The **Participant evaluation mode** is the main HCI study flow: a real signed-in participant receives a task, starts it, performs it in the real ReflectBlocks interface, and the app stores timing, observed actions, automatically scored comprehension responses, and requirement-level results.

## What happens to a participant action

```text
Google sign-in
   ↓
Evaluation session linked to users.google_id
   ↓
Task instruction screen
   ↓
Participant presses Start task
   ↓
evaluation_guided_tasks row starts + timer starts
   ↓
Real ReflectBlocks component opens
   ↓
Normal actions emit privacy-safe usability events
   ↓
Guided controller observes only task/event metadata
   ↓
Optional comprehension checkpoint is auto-scored
   ↓
Task result is calculated
   ↓
evaluation_guided_tasks + evaluation_requirement_checks are stored
   ↓
Next task
```

The participant's Gmail address is not duplicated into every event row. The evaluation session is owned by the authenticated Google user through `evaluation_sessions.user_google_id`. Session export joins that identity back to the signed-in account and exposes `user_email` for study administration.

## Important privacy behavior

- Evaluation telemetry does **not** copy journal text or block answers.
- Allowed telemetry is things such as `duration_ms`, `selected_count`, `help_count`, completion flags, and auto-scored answer flags.
- During an active evaluation session, participant writing is **not sent to Gemini**. Journal generation returns a prepared study fixture so every participant receives controlled, comparable material. Normal Gemini behavior resumes outside study mode.
- Evaluation-created reflections can be cleaned up after the study while measurement records remain in the evaluation tables.

## Guided tasks

### Task 1 — Quick thought capture (R1, R9)

The participant is shown the prepared fictional thought:

> I felt nervous after today's presentation.

The timer starts after **Start task**. The participant uses the real QuickThought screen. Saving automatically stops the capture measurement. An immediate retrospective question asks what they expected Save to do.

Automatic evidence includes:

- completion;
- actual participant elapsed time;
- whether it was within 5 seconds;
- whether the participant pressed **I need help**;
- aged-45+ coverage for the provisional R9 check.

### Task 2 — Optional prompts and customization (R2, R13)

The participant uses the real block workspace and must:

- dismiss a block;
- add a custom block;
- edit a block question;
- reorder a block;
- answer at least two blocks;
- choose **Save blocks only**.

The app watches the actual workspace events. R2 also uses the task-level help count so a task is not reported as “without help” if the participant requested help.

### Task 3 — Persistent prompt preference (R3)

The participant sets **Always add the same 3 starter prompts**. The app then guides them through two new reflections and automatically checks the block count in both. Before the second reflection, the participant predicts what should happen. The preference is restored to the participant's original value after the task.

### Task 4 — Blank writing (R6)

The participant opens the real blank-writing editor and saves a fictional entry without using generation. The save event completes the task automatically.

### Task 5 — Generation boundary and privacy (R4, R7, R10)

The participant opens journal generation, selects only some answered blocks, and opens the privacy notice. Before confirmation, Evaluation Mode pauses and asks three auto-scored questions:

1. Which material is eligible for generation?
2. Who would process it during normal use?
3. Has participant text been sent to Gemini during this study session?

After the checkpoint, the participant explicitly confirms generation. The system verifies that a generated draft occurs only after that request.

### Task 6 — Source transparency and editing (R5, R12)

The prepared generated journal contains controlled source links and deliberately unsuitable wording. The participant:

- clicks a source chip;
- answers what the source chip means;
- edits the unsuitable sentence;
- saves the edited journal.

The source interaction, edit, and save are recorded automatically.

### Task 7 — Retention and deletion (R8, R14)

Before the task starts, the participant predicts what should remain after deleting only the generated journal. The participant then exercises:

- **Save nothing** for an unsaved edit;
- export;
- generated-journal deletion.

After deletion, the backend checks the real stored state: reflection blocks should still exist and the generated journal should be gone. A final auto-scored question checks the participant's mental model of that state.

## “I need help” measurement

Every running guided task has an **I need help** button in the evaluation banner. Pressing it:

1. increments the current task's `help_count`;
2. records `participant_help_requested` as an evaluation event;
3. never changes the product data;
4. lets R1/R2 distinguish independent completion from completion with moderator help.

The moderator can then assist after the participant explicitly asks for help without having to manually remember whether help was given.

## R11 remains expert-facing

R11 is intentionally not converted into a participant task. Table 8 defines it as a privacy/domain stakeholder review of prompt wording. The existing governance-review form remains the correct place to store that evidence.

## Database additions

The update adds the following table with `CREATE TABLE IF NOT EXISTS`:

```sql
evaluation_guided_tasks (
    session_id,
    task_id,
    requirement_ids_json,
    started_at_ms,
    completed_at_ms,
    duration_ms,
    status,
    objective_json,
    comprehension_json,
    reflection_id,
    updated_at
)
```

Existing evaluation tables are reused:

- `evaluation_sessions` — participant/session identity and demographics;
- `evaluation_events` — privacy-safe interaction events;
- `evaluation_requirement_checks` — final R1–R14 evidence/status;
- `evaluation_governance_reviews` — R11 expert review.

No SQLite reset is required.

## New API endpoints

```text
POST /api/evaluation/sessions/{session_id}/guided-tasks/start
PUT  /api/evaluation/sessions/{session_id}/guided-tasks/{task_id}
GET  /api/evaluation/sessions/{session_id}/guided-tasks
```

Completing a guided task also upserts the corresponding rows in `evaluation_requirement_checks`.

## How to run the participant study

1. Start FastAPI and Vite normally.
2. Sign in with the participant's Google account.
3. Go to **Run HCI evaluation**.
4. Under **Participant evaluation mode**, enter participant code, device, age group, text-editing experience, and consent.
5. Press **Start participant evaluation**.
6. Normal app navigation is replaced by the evaluation-only interface.
7. The participant reads each task and presses **Start task**.
8. The timer, event recording, scoring, and database writes happen automatically.
9. At the end, choose whether to remove evaluation-created reflection fixtures.
10. Return to the evaluation dashboard to inspect/export the stored session.

## Verification performed for this update

Backend regression suite:

```text
Ran 27 tests
OK
```

The added regression coverage verifies that a guided task is stored under the authenticated evaluation session, unsafe journal text supplied as telemetry is stripped, the signed-in email is available in session export, and requirement results are persisted.

TypeScript check:

```text
npx tsc --noEmit
PASS
```

The Vite production build could not be run in the Linux inspection container because the supplied `node_modules` was created for Windows and does not contain Rolldown's Linux native optional binding. This is an environment/platform dependency issue; source type checking passes. On the user's Windows project, run `npm install` and `npm run build` normally.
