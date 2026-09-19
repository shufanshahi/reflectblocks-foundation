import { useEffect, useState } from "react";

import { RELATION_OPTIONS, getRelationLabel, type PortSide, type RelationType } from "../lib/blockLibrary";
import type { SavedBlock, SavedConnection } from "../reflections";

type ConnectionInspectorProps = {
  selectedConnection: SavedConnection | null;
  selectedBlock: SavedBlock | null;
  blocks: SavedBlock[];
  onChange: (id: string, patch: Partial<SavedConnection>) => void;
  onReverse: (id: string) => void;
  onDisconnect: (id: string) => void;
};

export function ConnectionInspector({
  selectedConnection,
  selectedBlock,
  blocks,
  onChange,
  onReverse,
  onDisconnect,
}: ConnectionInspectorProps) {
  const [customLabel, setCustomLabel] = useState("");

  useEffect(() => {
    setCustomLabel(selectedConnection?.relation_label ?? "");
  }, [selectedConnection]);

  if (!selectedConnection) {
    return (
      <aside className="connection-inspector drawio-inspector muted-inspector">
        <strong>{selectedBlock ? "Connect this block" : "Semantic arrows"}</strong>
        <span>
          {selectedBlock
            ? "Drag from any connector dot to another block. Release anywhere on the target block."
            : "Select a block or click an arrow to edit its meaning."}
        </span>
      </aside>
    );
  }

  const source = blocks.find((block) => block.id === selectedConnection.source_block_id);
  const target = blocks.find((block) => block.id === selectedConnection.target_block_id);
  const isCustom = selectedConnection.relation_type === "custom";

  return (
    <aside className="connection-inspector drawio-inspector" aria-label="Edit semantic arrow">
      <div className="inspector-heading">
        <div>
          <span className="inspector-role">Selected arrow</span>
          <strong>{getRelationLabel(selectedConnection.relation_type, selectedConnection.relation_label)}</strong>
        </div>
        <button type="button" className="disconnect-button" onClick={() => onDisconnect(selectedConnection.id)} title="Delete arrow">×</button>
      </div>

      <div className="edge-route-summary">
        <span>{source?.question ?? "Source"}</span>
        <b>→</b>
        <span>{target?.question ?? "Target"}</span>
      </div>

      <div className="edge-edit-grid">
        <label>
          Relationship
          <select
            value={selectedConnection.relation_type}
            onChange={(event) => {
              const relation = event.target.value as RelationType;
              onChange(selectedConnection.id, {
                relation_type: relation,
                relation_label: relation === "custom" ? (customLabel || "relates in my own way") : null,
              });
            }}
          >
            {Array.from(new Set(RELATION_OPTIONS.map((option) => option.group))).map((group) => (
              <optgroup key={group} label={group}>
                {RELATION_OPTIONS.filter((option) => option.group === group).map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <button type="button" className="micro-button reverse-edge-button" onClick={() => onReverse(selectedConnection.id)}>
          ⇄ Reverse arrow
        </button>
      </div>

      {isCustom ? (
        <label className="custom-relation-label">
          Your relationship label
          <input
            value={customLabel}
            maxLength={100}
            placeholder="e.g. made this harder because…"
            onChange={(event) => setCustomLabel(event.target.value)}
            onBlur={() => {
              const next = customLabel.trim() || "is related to";
              setCustomLabel(next);
              onChange(selectedConnection.id, { relation_label: next });
            }}
          />
        </label>
      ) : null}

      <div className="port-summary" aria-label="Arrow attachment points">
        <span>from {selectedConnection.source_port}</span>
        <span>to {selectedConnection.target_port}</span>
      </div>
    </aside>
  );
}
