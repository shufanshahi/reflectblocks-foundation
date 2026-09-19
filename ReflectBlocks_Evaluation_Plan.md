# ReflectBlocks Evaluation Plan (Enhanced)

## Goal
Check if ReflectBlocks is usable, understandable, and trustworthy — not just whether the built-in study tasks pass. Covers the whole app, including parts the current in-app evaluation module does not test (canvas, arrows, AI suggestions, accessibility).

## Why enhance the existing plan
The app already has a built-in evaluation flow (`EvaluationPage`, guided tasks, automated requirement checks). It only checks R1–R14, which are mostly about capture, prompts, AI-generation notice, and save/delete. It does **not** check:
- the canvas itself (drag, pan, zoom, connect blocks)
- arrow/relationship labeling
- AI next-block suggestions panel
- accessibility (screen reader, keyboard-only use)
- long-term/repeat use
- trust in AI output over time

This plan adds those, using a mix of methods instead of one task list.

## Core usability metrics (apply to every task, every layer)
These are standard usability measures (Wixon & Wilson). Kept front and center, not just a side note:

- **Task completion rate** — did they finish, with or without help
- **Time on task** — how long it took
- **Error rate** — wrong actions per task
- **Findability / navigation** — could they locate the control or block without searching randomly (count clicks/actions vs the shortest path, count backtracking)
- **Help requests** — how many times they asked the moderator
- **Satisfaction** — SUS score + interview comments

Every task in Layer 3 below is scored on all six, not just pass/fail.

## Methods used (4 layers)

| Layer | Method | Needs users? | When |
|---|---|---|---|
| 1 | Heuristic evaluation | No (experts only) | Before user testing |
| 2 | Cognitive walkthrough | No (experts only) | Before user testing |
| 3 | Moderated think-aloud test | Yes | Main study |
| 4 | Short field pilot | Yes | After fixes from layer 3 |

Do them in order. Each layer catches different problems and is cheaper than the next.

---

## Layer 1: Heuristic evaluation

3–5 evaluators (can be classmates/team), each works alone first, using Nielsen's 10 heuristics:
visibility of status, match to real world, user control, consistency, error prevention,
recognition not recall, flexibility, minimal design, error recovery, help/docs.

Walk through: home → quick thought → canvas (add/move/connect blocks) → AI suggestions →
journal generation → free writing → save/export/delete.

Each evaluator lists problems with a severity 0–4 (same scale as existing doc).
Then evaluators meet once to merge and rank the list.

Output: ranked problem list, before any real participant is involved.

---

## Layer 2: Cognitive walkthrough

Pick 3–4 key action sequences not covered well by existing tasks, e.g.:
- add a block, connect it to another with an arrow, label the relationship
- pan/zoom the canvas to find a block placed far away
- accept or reject an AI-suggested next block
- turn on "starter prompts" preference and see it persist next session

For each step in the sequence, ask:
1. Will the user know what to do?
2. Will they notice the control?
3. Will they understand the result?

Output: list of steps that fail any of the 3 questions.

---

## Layer 3: Moderated think-aloud test (main study)

6–8 participants, mixed ages and digital skill, fictional content only.

Use the app's built-in evaluation session to log timing/events automatically, but run **more tasks** than the default 5:

**Core tasks (existing, keep):**
1. Capture a quick thought
2. Handle optional/irrelevant prompts, find blank writing
3. Generate journal entry, understand the processing notice
4. Edit AI-generated text using the source link
5. Save/export/delete and predict what remains

**New tasks (canvas + AI + accessibility, add these):**
6. **Build a connected reflection** — add 3 blocks, connect them with arrows, and label one relationship. Check if they find the connector points and label control without help.
7. **Use AI suggestions** — open the suggestions panel, accept one suggestion, reject another. Check if they understand it's optional and where it came from.
8. **Find a moved/far block** — place a block off-screen (zoom out or scroll), ask them to find it again. Check pan/zoom discoverability.
9. **Keyboard-only pass** — ask them to do one full task (e.g. task 1) using only keyboard/screen reader. Check focus order and labels.
10. **Return after a break** — close and reopen the app, ask them to find and continue an earlier reflection. Check persistence and re-orientation.

### What to record
- All 6 core metrics above, per task (completion, time, errors, findability, help requests, satisfaction)
- Comprehension answers (tasks 3, 4, 5)
- Confusion quotes, exact words
- Accessibility issues (task 9): anything unreachable or unlabeled

### Fail conditions (must fix before shipping)
- Prompt believed mandatory, can't dismiss
- AI believed to run before pressing generate
- Can't tell what data goes to AI
- Wrong belief about what was deleted vs kept
- Can't complete task 9 (keyboard-only) at all

### After tasks: short interview + SUS
Same questions as before, plus:
- Did the AI suggestions feel useful or annoying?
- Did connecting blocks with arrows make sense?
- Would you use this again after a week?

Give the System Usability Scale (SUS) at the end for a comparable score.

---

## Layer 4: Short field pilot (after layer 3 fixes)

3–5 participants use the app on their own for 3–5 days, real (or semi-real) journaling.

Collect:
- Return rate (did they come back on their own?)
- Number of reflections created, blocks used, AI suggestions accepted/rejected
- One short end-of-week interview: did it feel useful, did trust in AI change over time

This checks things a single lab session can't: habit formation, long-term trust, fatigue with prompts.

---

## HCAI checklist (run once, alongside layers 1–4)
Since the app uses AI (Gemini), check these separately from plain usability:

- **Explainability**: can user say why a suggestion appeared?
- **Trust**: do users check/verify AI text, or blindly accept it?
- **Human control**: can user always override or turn off AI features?
- **Fairness**: do prompts/categories feel neutral, not biased toward one group?
- **Safety**: no prompt implies diagnosis, crisis handling, or clinical advice
- **Long-term**: does reliance on AI increase or decrease with repeated use (layer 4 data)

---

## Analysis
- Completion rate per task, target 7/8 pass unaided (lab tasks)
- Median time on task, per task
- Error count and findability score, per task
- Severity-ranked problem list from heuristic eval + walkthrough
- Theme list from think-aloud comments and interviews
- SUS score
- Field pilot: usage stats + trust/return themes
- Final report: one row per task — completion rate, time, errors, findability, status (works / needs fix / broken)

## Out of scope (needs separate technical check, not user testing)
- Backend actually deletes data permanently
- Only selected blocks get sent to Gemini, nothing else
- Server-side data security
