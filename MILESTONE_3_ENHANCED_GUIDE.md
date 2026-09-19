# ReflectBlocks — Enhanced Milestone 3

This version upgrades the Milestone 3 whiteboard from **independent draggable cards** into **Scratch-inspired semantic reflection threads**.

## What changed

A reflection block can now be connected to another block. The connection is not a programming instruction; it records how the writer sees two parts of the reflection as related.

Examples:

```text
Situation ── made me feel ──> Feeling
Situation ── made me think ─> Thought
Challenge ─ helped me realize ─> Learning
Learning ── next time ──────> Next step
```

Threads may branch:

```text
                  ┌─> Feeling
Situation ────────┤
                  └─> Thought ─> Learning ─> Next step
```

They may not loop back into themselves. That keeps the authored structure understandable and makes it suitable for later AI organization.

## Files to copy onto your existing M1 + M2 + M3 project

### Replace

- `backend/reflections.py`
- `backend/test_reflections.py`
- `backend/app.py` (only the API version changed; safe to replace)
- `src/reflections.ts`
- `src/lib/blockLibrary.ts`
- `src/components/BlockPalette.tsx`
- `src/components/ReflectionBlock.tsx`
- `src/components/ReflectionWorkspace.tsx`
- `src/styles.css`

### New files

- `src/components/ConnectionLayer.tsx`
- `src/components/ConnectionInspector.tsx`

### Leave unchanged

- `backend/auth.py`
- `src/auth.tsx`
- `src/main.tsx`
- `src/components/Home.tsx`
- `src/components/QuickThought.tsx`
- `.env`

## Database migration

Do **not** delete `.data/reflectblocks.sqlite3`.

The backend automatically adds this table on startup:

```sql
CREATE TABLE IF NOT EXISTS block_connections (
    id TEXT PRIMARY KEY,
    reflection_id TEXT NOT NULL,
    source_block_id TEXT NOT NULL,
    target_block_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (reflection_id) REFERENCES reflections(id) ON DELETE CASCADE,
    FOREIGN KEY (source_block_id) REFERENCES reflection_blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (target_block_id) REFERENCES reflection_blocks(id) ON DELETE CASCADE,
    UNIQUE (reflection_id, source_block_id, target_block_id)
);
```

Existing Milestone 3 reflections still load; they simply begin with zero connections.

## Relationship vocabulary

The first version intentionally uses a small vocabulary:

- `then / led to`
- `made me feel`
- `made me think`
- `because / influenced by`
- `helped me realize`
- `next time`

When blocks snap, ReflectBlocks infers a sensible default relation from the two block categories. The writer can change that relationship afterwards.

## Semantic roles

The 60-question library still has ten visible categories, but categories now also have a broader role:

```text
Experience → Reaction → Explore → Meaning → Reflect → Action
```

This is a **soft progression**, not a required template. A writer may skip stages, branch, keep disconnected blocks, or create more than one thread.

## How snapping works

1. Add at least two blocks.
2. Grab a block using its `⠿` drag handle.
3. Move its **top connector** close to another block's **bottom connector**.
4. Both blocks highlight and a dashed preview connection appears.
5. Release the mouse.
6. The block aligns near the other block and a semantic connection is created.

Connections stay attached while blocks are repositioned.

## Non-drag alternative

Dragging is never required.

Select any block. In the **Reflection threads** panel above the canvas:

1. Choose another block.
2. Choose/change the relationship.
3. Press `Connect →`.

Existing links also appear there and can be changed or disconnected with `×`.

## Suggested next blocks

When a block is selected, the library can show **Good next questions** based only on the semantic role of the selected block. This is local deterministic metadata, not AI analysis.

## Saving

The Save button now writes the whole workspace atomically:

```json
{
  "blocks": [...],
  "connections": [
    {
      "id": "...",
      "source_block_id": "...",
      "target_block_id": "...",
      "relation_type": "made_me_feel"
    }
  ]
}
```

Endpoint:

```text
PUT /api/reflections/{reflection_id}/workspace
```

The backend validates that:

- every connected block actually belongs to the submitted board,
- there are no self-connections,
- relationship types are recognized,
- duplicate source → target links are rejected,
- threads do not contain cycles,
- the reflection belongs to the authenticated Google user.

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

## Tests

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

Expected for this bundle: **10 tests, OK**.

## Milestone completion test

Build this thread and save it:

```text
What happened?
      ↓ made me feel
How did you feel?
      ↓ helped me realize
What did you learn?
      ↓ next time
What is one next step you can take?
```

Then:

1. return Home,
2. reopen the reflection,
3. verify answers, block positions, relationship labels, and lines are restored,
4. branch `What happened?` into a separate `What was going through your mind?` block,
5. save/reopen again,
6. sign in as another Google account and confirm the reflection is not visible.

At that point the enhanced Milestone 3 is complete.
