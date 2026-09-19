import { useMemo, useState } from "react";

import { getCategory, ROLE_LABELS, type PortSide } from "../lib/blockLibrary";
import type { SavedBlock } from "../reflections";

type ReflectionBlockProps = {
  block: SavedBlock;
  selected: boolean;
  incomingCount: number;
  outgoingCount: number;
  activeTargetPort: PortSide | null;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onSelect: (id: string) => void;
  onAnswerChange: (id: string, answer: string) => void;
  onQuestionChange: (id: string, question: string) => void;
  onQuestionEditComplete: (id: string) => void;
  onMoveEarlier: (id: string) => void;
  onMoveLater: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>, block: SavedBlock) => void;
  onConnectionStart: (event: React.PointerEvent<HTMLButtonElement>, block: SavedBlock, port: PortSide) => void;
};

const PORTS: PortSide[] = ["top", "right", "bottom", "left"];

export function ReflectionBlock({
  block,
  selected,
  incomingCount,
  outgoingCount,
  activeTargetPort,
  canMoveEarlier,
  canMoveLater,
  onSelect,
  onAnswerChange,
  onQuestionChange,
  onQuestionEditComplete,
  onMoveEarlier,
  onMoveLater,
  onRemove,
  onDragStart,
  onConnectionStart,
}: ReflectionBlockProps) {
  const category = useMemo(() => getCategory(block.category), [block.category]);
  const [editingQuestion, setEditingQuestion] = useState(false);

  return (
    <article
      className={`workspace-block ${selected ? "selected" : ""}`}
      style={{
        left: `${block.position_x}px`,
        top: `${block.position_y}px`,
        borderTopColor: category.color,
      }}
      data-block-id={block.id}
      onPointerDown={() => onSelect(block.id)}
    >
      {PORTS.map((port) => (
        <button
          key={port}
          type="button"
          className={`connector-port port-${port} ${activeTargetPort === port ? "active-target" : ""}`}
          data-connection-port={port}
          aria-label={`Start connection from ${port} of ${block.question}`}
          title={`Drag from this ${port} connector to another block`}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect(block.id);
            onConnectionStart(event, block, port);
          }}
        />
      ))}

      <header
        className="workspace-block-header draggable-header"
        style={{ background: category.tint }}
        title="Drag anywhere on this header to move the block"
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button")) return;
          event.stopPropagation();
          onSelect(block.id);
          onDragStart(event, block);
        }}
      >
        <div className="workspace-block-label">
          <span className="workspace-block-icon" style={{ color: category.color }}>{category.icon}</span>
          <span style={{ color: category.color }}>{category.shortLabel}</span>
          <span className="role-pill">{ROLE_LABELS[category.role]}</span>
        </div>

        <div className="block-header-actions">
          <button
            type="button"
            className="tiny-icon-button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setEditingQuestion((current) => !current);
            }}
            aria-label={`Edit question: ${block.question}`}
            title="Edit block question"
          >
            ✎
          </button>
          <button
            type="button"
            className="tiny-icon-button danger"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(block.id);
            }}
            aria-label={`Remove ${block.question}`}
            title="Remove block"
          >
            ×
          </button>
        </div>
      </header>

      <div className="workspace-block-body">
        {editingQuestion ? (
          <div className="block-question-editor">
            <label className="sr-only" htmlFor={`question-${block.id}`}>Edit block question</label>
            <input
              id={`question-${block.id}`}
              value={block.question}
              maxLength={500}
              autoFocus
              onChange={(event) => onQuestionChange(block.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && block.question.trim()) {
                  setEditingQuestion(false);
                  onQuestionEditComplete(block.id);
                }
                if (event.key === "Escape") setEditingQuestion(false);
              }}
            />
            <button
              type="button"
              className="micro-button"
              disabled={!block.question.trim()}
              onClick={() => {
                setEditingQuestion(false);
                onQuestionEditComplete(block.id);
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <h3>{block.question}</h3>
        )}
        <label className="sr-only" htmlFor={`answer-${block.id}`}>Answer: {block.question}</label>
        <textarea
          id={`answer-${block.id}`}
          className="block-answer"
          value={block.answer}
          onFocus={() => onSelect(block.id)}
          onChange={(event) => onAnswerChange(block.id, event.target.value)}
          placeholder="Write a short answer…"
          rows={3}
          maxLength={5000}
        />

        <div className="block-footer simple">
          <div className="block-order-actions" aria-label="Block order">
            <button type="button" className="micro-button compact" disabled={!canMoveEarlier} onClick={() => onMoveEarlier(block.id)} title="Move earlier in generation order">← Earlier</button>
            <button type="button" className="micro-button compact" disabled={!canMoveLater} onClick={() => onMoveLater(block.id)} title="Move later in generation order">Later →</button>
          </div>
          <span className="thread-count" title="Incoming and outgoing semantic links">
            {incomingCount}← · →{outgoingCount}
          </span>
        </div>
      </div>
    </article>
  );
}
