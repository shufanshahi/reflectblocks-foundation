# ReflectBlocks Milestone 3 — Scratch-like Reflection Blocks

This milestone adds the core block interaction on top of Milestones 1 and 2.

## What it adds

- 60 fixed reflection questions across 10 categories
- Scratch-like category rail + question palette
- click `+` to add a block
- drag a palette item onto the canvas on desktop
- freeform whiteboard/canvas
- drag existing blocks around by the `⠿` handle
- short answer field inside every block
- remove blocks
- logical reflection order with `Earlier` / `Later` controls
- explicit **Save blocks** button
- block answers, positions, and order persisted in SQLite
- ownership checks on every reflection/block request

## Add these NEW files to your existing project

```text
backend/reflections.py
backend/test_reflections.py
src/reflections.ts
src/lib/blockLibrary.ts
src/components/Home.tsx
src/components/QuickThought.tsx
src/components/BlockPalette.tsx
src/components/ReflectionBlock.tsx
src/components/ReflectionWorkspace.tsx
```

## Replace/edit these EXISTING files

```text
backend/app.py
src/App.tsx
src/styles.css
```

Keep these Milestone 1 files unchanged:

```text
backend/auth.py
src/auth.tsx
src/google-identity.d.ts
src/main.tsx
```

## Database

The existing `.data/reflectblocks.sqlite3` is reused. No reset is needed.

Two tables are added automatically if they do not exist:

```text
reflections
reflection_blocks
```

`reflection_blocks` stores:

```text
id
reflection_id
library_block_id
category
question
answer
position_x
position_y
order_index
created_at
updated_at
```

## Run

Backend:

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
npm run dev
```

Open:

```text
http://localhost:5173
```

## Test

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

Expected result for this bundle: **8 tests, OK**.

## Milestone 3 success checklist

1. Sign in with Google.
2. Create a new quick thought.
3. The app opens the reflection workspace.
4. Choose categories from the left rail.
5. Add questions with `+` or drag them to the canvas.
6. Drag canvas blocks around using `⠿`.
7. Write short answers.
8. Remove blocks.
9. Change logical order using Earlier/Later.
10. Press **Save blocks**.
11. Go back to history and reopen the reflection.
12. Answers, positions, selected blocks, and order are restored.
13. A second Google account cannot read or edit the first account's reflection.
