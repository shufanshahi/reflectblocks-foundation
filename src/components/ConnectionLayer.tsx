import { getRelationLabel, type PortSide } from "../lib/blockLibrary";
import type { SavedBlock, SavedConnection } from "../reflections";

export const WORKSPACE_BLOCK_WIDTH = 320;
export const WORKSPACE_BLOCK_HEIGHT = 238;

export type ConnectionDraft = {
  sourceId: string;
  sourcePort: PortSide;
  pointerX: number;
  pointerY: number;
  targetId: string | null;
  targetPort: PortSide | null;
};

type ConnectionLayerProps = {
  blocks: SavedBlock[];
  connections: SavedConnection[];
  selectedConnectionId: string | null;
  draft: ConnectionDraft | null;
  onSelectConnection: (id: string) => void;
};

const PORT_VECTOR: Record<PortSide, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function getPortPoint(block: SavedBlock, port: PortSide) {
  if (port === "top") return { x: block.position_x + WORKSPACE_BLOCK_WIDTH / 2, y: block.position_y };
  if (port === "right") return { x: block.position_x + WORKSPACE_BLOCK_WIDTH, y: block.position_y + WORKSPACE_BLOCK_HEIGHT / 2 };
  if (port === "bottom") return { x: block.position_x + WORKSPACE_BLOCK_WIDTH / 2, y: block.position_y + WORKSPACE_BLOCK_HEIGHT };
  return { x: block.position_x, y: block.position_y + WORKSPACE_BLOCK_HEIGHT / 2 };
}

function connectionPath(
  source: { x: number; y: number },
  sourcePort: PortSide,
  target: { x: number; y: number },
  targetPort: PortSide,
) {
  const sv = PORT_VECTOR[sourcePort];
  const tv = PORT_VECTOR[targetPort];
  const span = Math.hypot(target.x - source.x, target.y - source.y);
  const control = Math.max(56, Math.min(180, span * 0.38));
  const c1 = { x: source.x + sv.x * control, y: source.y + sv.y * control };
  const c2 = { x: target.x + tv.x * control, y: target.y + tv.y * control };
  return `M ${source.x} ${source.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${target.x} ${target.y}`;
}

export function ConnectionLayer({
  blocks,
  connections,
  selectedConnectionId,
  draft,
  onSelectConnection,
}: ConnectionLayerProps) {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return (
    <svg className="connection-layer drawio-layer" viewBox="-100000 -100000 200000 200000" aria-label="Semantic relationships">
      <defs>
        <marker id="reflection-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 9 4.5 L 0 9 z" className="connection-arrow" />
        </marker>
        <marker id="reflection-arrow-selected" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 9 4.5 L 0 9 z" className="connection-arrow selected" />
        </marker>
        <marker id="reflection-arrow-preview" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 9 4.5 L 0 9 z" className="connection-arrow preview" />
        </marker>
      </defs>

      {connections.map((connection) => {
        const sourceBlock = blockMap.get(connection.source_block_id);
        const targetBlock = blockMap.get(connection.target_block_id);
        if (!sourceBlock || !targetBlock) return null;
        const source = getPortPoint(sourceBlock, connection.source_port);
        const target = getPortPoint(targetBlock, connection.target_port);
        const path = connectionPath(source, connection.source_port, target, connection.target_port);
        const label = getRelationLabel(connection.relation_type, connection.relation_label);
        const labelX = (source.x + target.x) / 2;
        const labelY = (source.y + target.y) / 2;
        const selected = selectedConnectionId === connection.id;
        const width = Math.max(86, Math.min(190, label.length * 6.4 + 26));
        return (
          <g key={connection.id} className={`connection-group ${selected ? "selected" : ""}`}>
            <path
              className="connection-hit-path"
              d={path}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectConnection(connection.id);
              }}
            />
            <path
              className={`connection-path ${selected ? "selected" : ""}`}
              d={path}
              markerEnd={selected ? "url(#reflection-arrow-selected)" : "url(#reflection-arrow)"}
            />
            <g
              className="connection-label-group"
              transform={`translate(${labelX - width / 2} ${labelY - 13})`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectConnection(connection.id);
              }}
            >
              <rect className={`connection-label-bg ${selected ? "selected" : ""}`} width={width} height="26" rx="13" />
              <text className={`connection-label-text ${selected ? "selected" : ""}`} x={width / 2} y="17" textAnchor="middle">{label}</text>
            </g>
          </g>
        );
      })}

      {draft ? (() => {
        const sourceBlock = blockMap.get(draft.sourceId);
        if (!sourceBlock) return null;
        const source = getPortPoint(sourceBlock, draft.sourcePort);
        const targetBlock = draft.targetId ? blockMap.get(draft.targetId) : null;
        const target = targetBlock && draft.targetPort
          ? getPortPoint(targetBlock, draft.targetPort)
          : { x: draft.pointerX, y: draft.pointerY };
        const targetPort = draft.targetPort ?? (draft.sourcePort === "right" ? "left" : draft.sourcePort === "left" ? "right" : draft.sourcePort === "top" ? "bottom" : "top");
        return (
          <path
            className="connection-path preview"
            d={connectionPath(source, draft.sourcePort, target, targetPort)}
            markerEnd="url(#reflection-arrow-preview)"
          />
        );
      })() : null}
    </svg>
  );
}
