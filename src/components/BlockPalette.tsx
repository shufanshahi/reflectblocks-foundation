import { useMemo, useState, type ReactNode } from "react";

import {
  BLOCK_CATEGORIES,
  BLOCK_LIBRARY,
  ROLE_LABELS,
  suggestedNextCategories,
  type LibraryBlock,
} from "../lib/blockLibrary";
import type { SavedBlock } from "../reflections";

type BlockPaletteProps = {
  addedLibraryIds: Set<string>;
  selectedBlock: SavedBlock | null;
  onAdd: (block: LibraryBlock) => void;
  onAddCustom: (question: string, category: string) => void;
  aiPanel?: ReactNode;
};

export function BlockPalette({ addedLibraryIds, selectedBlock, onAdd, onAddCustom, aiPanel }: BlockPaletteProps) {
  const [category, setCategory] = useState(BLOCK_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customCategory, setCustomCategory] = useState(BLOCK_CATEGORIES[0].id);

  const blocks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return BLOCK_LIBRARY.filter((block) => {
      if (normalized) return block.question.toLowerCase().includes(normalized);
      return block.category === category;
    });
  }, [category, query]);

  const suggestions = useMemo(() => {
    if (!selectedBlock) return [];
    const nextCategories = new Set(suggestedNextCategories(selectedBlock.category));
    return BLOCK_LIBRARY.filter(
      (block) => nextCategories.has(block.category) && !addedLibraryIds.has(block.id),
    ).slice(0, 3);
  }, [addedLibraryIds, selectedBlock]);

  function addCustom() {
    const question = customQuestion.trim();
    if (!question) return;
    onAddCustom(question, customCategory);
    setCustomQuestion("");
    setCustomOpen(false);
  }

  return (
    <aside className="block-toolbox" aria-label="Reflection block library">
      <nav className="category-rail" aria-label="Block categories">
        {BLOCK_CATEGORIES.map((item) => (
          <button
            type="button"
            className={`category-button ${category === item.id && !query ? "active" : ""}`}
            key={item.id}
            onClick={() => {
              setCategory(item.id);
              setQuery("");
            }}
            title={`${item.label} · ${ROLE_LABELS[item.role]}`}
          >
            <span className="category-dot" style={{ background: item.color }} />
            <span>{item.shortLabel}</span>
          </button>
        ))}
      </nav>

      <div className="palette-panel">
        <div className="palette-heading">
          <div>
            <p className="eyebrow">Block library</p>
            <h2>{query ? "Search" : BLOCK_CATEGORIES.find((item) => item.id === category)?.label}</h2>
          </div>
          <span className="library-count">60 blocks</span>
        </div>

        <button
          className="custom-block-toggle"
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((current) => !current)}
        >
          + Add your own question
        </button>
        {customOpen ? (
          <div className="custom-block-form">
            <label>
              <span>Question</span>
              <input
                value={customQuestion}
                maxLength={500}
                autoFocus
                placeholder="What do I want to explore?"
                onChange={(event) => setCustomQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customQuestion.trim()) addCustom();
                }}
              />
            </label>
            <label>
              <span>Category</span>
              <select value={customCategory} onChange={(event) => setCustomCategory(event.target.value)}>
                {BLOCK_CATEGORIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
            <div className="custom-block-actions">
              <button className="micro-button" type="button" onClick={() => setCustomOpen(false)}>Cancel</button>
              <button className="primary-button compact-primary" type="button" disabled={!customQuestion.trim()} onClick={addCustom}>Add block</button>
            </div>
          </div>
        ) : null}

        {selectedBlock && suggestions.length > 0 && !query ? (
          <section className="next-suggestions" aria-label="Suggested next blocks">
            <div className="suggestion-heading">
              <strong>Good next questions</strong>
              <span>based on the selected block</span>
            </div>
            {suggestions.map((block) => {
              const categoryInfo = BLOCK_CATEGORIES.find((item) => item.id === block.category)!;
              return (
                <button
                  className="suggestion-block"
                  key={block.id}
                  type="button"
                  onClick={() => onAdd(block)}
                >
                  <span style={{ color: categoryInfo.color }}>{categoryInfo.icon}</span>
                  <span>{block.question}</span>
                  <b>+</b>
                </button>
              );
            })}
          </section>
        ) : null}

        {aiPanel ? <div className="palette-ai-slot">{aiPanel}</div> : null}

        <label className="search-label" htmlFor="block-search">Find a question</label>
        <input
          id="block-search"
          className="block-search"
          type="search"
          placeholder="Search all blocks…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="palette-list">
          {blocks.map((block) => {
            const categoryInfo = BLOCK_CATEGORIES.find((item) => item.id === block.category)!;
            const added = addedLibraryIds.has(block.id);
            return (
              <article
                className={`palette-block ${added ? "added" : ""}`}
                key={block.id}
                draggable={!added}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/reflectblocks-library-id", block.id);
                }}
                style={{ borderLeftColor: categoryInfo.color }}
              >
                <div className="palette-block-copy">
                  <span className="palette-category" style={{ color: categoryInfo.color }}>
                    {categoryInfo.shortLabel} · {ROLE_LABELS[categoryInfo.role]}
                  </span>
                  <p>{block.question}</p>
                </div>
                <button
                  className="add-block-button"
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(block)}
                  aria-label={added ? `${block.question} already added` : `Add ${block.question}`}
                >
                  {added ? "✓" : "+"}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
