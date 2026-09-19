# ReflectBlocks Automated Table 8 Evaluation

The updated project includes a one-click **Automated testing mode** under **Home → Run HCI evaluation**. It executes a synthetic R1–R14 technical audit, stores the result in SQLite automatically, displays every sub-check and human-follow-up reason, keeps run history, and supports JSON export. It does not call Gemini and does not modify the signed-in user's reflections, journals, free-writing entries, or prompt defaults.

The automated suite is intentionally a **technical audit**, not a replacement for the human HCI evaluation. Requirements involving participant comprehension, prediction, discoverability, age-inclusive usability, or qualified expert judgment still need humans. In particular, R9 (aged-45+ inclusive session) and R11 (privacy/domain expert review) are intrinsically human. R1/R2/R3/R4/R5/R6/R7/R8/R10/R12/R13/R14 have meaningful automated checks, but their Table 8 walkthrough/comprehension components still require participant evidence.

## Run it

1. Start FastAPI and the React frontend normally.
2. Sign in.
3. Open **Home → Run HCI evaluation**.
4. Under **Automated testing mode**, press **Run automated R1–R14 audit**.
5. Inspect the R1–R14 sub-checks and the “Why this cannot be fully automated” explanation.
6. Reopen previous runs from **Saved automated runs**, or export a run as JSON.

## Verification run used for this build

```text
python -m unittest discover -s backend -p "test_*.py" -v
26 tests: PASS

npx tsc --noEmit
PASS
```

For the full requirement-by-requirement automation matrix, implementation notes, and human study instructions, see `TABLE8_EVALUATION_GUIDE.md` in the project root.
