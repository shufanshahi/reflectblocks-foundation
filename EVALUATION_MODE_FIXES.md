# Participant Evaluation Mode — Reliability Fixes

This patch was made from the uploaded current project state `reflectblocks-foundation-m1(3).zip`.

## Main Task 1 bug fixed

The quick-capture component emitted `task_id: "quick-thought"`, while the guided evaluation controller expected `task_id: "quick-capture"`. The reflection was therefore saved successfully, but the controller ignored the completion event and the screen never advanced.

The active guided evaluation task is now authoritative in `src/lib/usability.ts`, and `QuickThought.tsx` no longer hard-codes the conflicting task id.

## Additional reliability fixes

- Ending an evaluation session clears stale guided-task/timer state.
- Participant-mode mount/unmount clears stale runtime task state so a reload starts cleanly.
- The prepared Task 1 sentence remains visible while the timer is running.
- The visible task timer continues through comprehension checkpoints so it matches stored task duration more closely.
- Help requests now show feedback and remain automatically counted.
- Source-comprehension questions are asked once; an incorrect answer is stored as an issue instead of trapping the participant in a loop.
- R9 now considers whether an aged-45+ participant completed the capture independently instead of passing solely because of age group.
- R10 only becomes `critical` after an actual incorrect comprehension response; an incomplete task is an `issue`.
- R8 only becomes `critical` for an actual deletion-scope misunderstanding; an incomplete task is an `issue`.
- Task-specific comprehension state is reset before each new attempt.
- Returning/backing out of a task clears the active guided-task marker.
- The original prompt-default preference is restored safely after the R3 task/exit/cleanup.
- A controlled **End task attempt** action is available where it is safe to continue the study even if the participant did not discover every expected control. This prevents failed usability attempts from becoming impossible-to-finish screens.

## Verification performed

- `npx tsc --noEmit` — PASS
- `python -m unittest discover -s backend -p 'test_*.py'` — 27 tests PASS
- `npm run build` could not be executed in the Linux inspection environment because the uploaded `node_modules` contains the Windows Rolldown native dependency. On Windows, reinstalling/using the project's normal npm dependencies resolves that environment mismatch.

## Quick Task 1 check

1. Restart Vite after applying the patch.
2. Start a fresh participant evaluation session.
3. Start Task 1.
4. Confirm the prepared sentence is visible in the evaluation banner.
5. Type a thought and click **Save & explore blocks** once.
6. You should immediately see the **Immediate retrospective** checkpoint.
7. After answering it, Task 1 should be stored and the **Next task** screen should appear.

In the backend log, one Task 1 attempt should normally create one `POST /api/reflections` request rather than requiring repeated clicks.
