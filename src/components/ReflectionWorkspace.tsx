import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BLOCK_CATEGORIES,
  BLOCK_LIBRARY,
  inferRelation,
  type LibraryBlock,
  type PortSide,
  type RelationType,
} from "../lib/blockLibrary";
import { useSoundEffects } from "../lib/useSoundEffects";
import { clearRecovery, readRecovery, recoveryKey, writeRecovery } from "../lib/draftRecovery";
import { trackUsability } from "../lib/usability";
import {
  deleteReflection,
  deleteWorkspaceContent,
  getReflection,
  saveReflectionWorkspace,
  type AISuggestion,
  type ReflectionDetail,
  type SavedBlock,
  type SavedConnection,
} from "../reflections";
import { AISuggestionsPanel } from "./AISuggestionsPanel";
import { BlockPalette } from "./BlockPalette";
import { ConnectionInspector } from "./ConnectionInspector";
import { JournalGeneratorPanel } from "./JournalGeneratorPanel";
import {
  ConnectionLayer,
  WORKSPACE_BLOCK_HEIGHT,
  WORKSPACE_BLOCK_WIDTH,
  getPortPoint,
  type ConnectionDraft,
} from "./ConnectionLayer";
import { ReflectionBlock } from "./ReflectionBlock";
import { ConfirmDialog } from "./ConfirmDialog";

type ReflectionWorkspaceProps = {
  reflectionId: string;
  onBack: () => void;
  onOpenJournal: () => void;
  onOpenFreeWriting: () => void;
};

type Camera = { x: number; y: number; zoom: number };

type DragState = {
  id: string;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
};

type PanState = {
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;
const GRID_SIZE = 24;
const PORTS: PortSide[] = ["top", "right", "bottom", "left"];

function normalizeOrder(blocks: SavedBlock[]): SavedBlock[] {
  return blocks.map((block, index) => ({ ...block, order_index: index }));
}

function newBoardBlock(
  libraryBlock: LibraryBlock,
  index: number,
  x: number,
  y: number,
  libraryBlockId: string | null = libraryBlock.id,
): SavedBlock {
  return {
    id: crypto.randomUUID(),
    library_block_id: libraryBlockId,
    category: libraryBlock.category,
    question: libraryBlock.question,
    answer: "",
    position_x: Math.round(x),
    position_y: Math.round(y),
    order_index: index,
  };
}

function pairExists(sourceId: string, targetId: string, connections: SavedConnection[]) {
  return connections.find(
    (connection) => connection.source_block_id === sourceId && connection.target_block_id === targetId,
  ) ?? null;
}

function nearestPort(block: SavedBlock, x: number, y: number): PortSide {
  let best: { port: PortSide; distance: number } | null = null;
  for (const port of PORTS) {
    const point = getPortPoint(block, port);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (!best || distance < best.distance) best = { port, distance };
  }
  return best?.port ?? "left";
}

function pointInsideBlock(block: SavedBlock, x: number, y: number) {
  return x >= block.position_x
    && x <= block.position_x + WORKSPACE_BLOCK_WIDTH
    && y >= block.position_y
    && y <= block.position_y + WORKSPACE_BLOCK_HEIGHT;
}

function bestPorts(source: SavedBlock, targetX: number, targetY: number): { source: PortSide; target: PortSide } {
  const sx = source.position_x + WORKSPACE_BLOCK_WIDTH / 2;
  const sy = source.position_y + WORKSPACE_BLOCK_HEIGHT / 2;
  const dx = targetX - sx;
  const dy = targetY - sy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: "right", target: "left" } : { source: "left", target: "right" };
  }
  return dy >= 0 ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
}

export function ReflectionWorkspace({ reflectionId, onBack, onOpenJournal, onOpenFreeWriting }: ReflectionWorkspaceProps) {
  const [reflection, setReflection] = useState<ReflectionDetail | null>(null);
  const [blocks, setBlocks] = useState<SavedBlock[]>([]);
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 110, y: 90, zoom: 1 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const connectionDraftRef = useRef<ConnectionDraft | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { soundEnabled, setSoundEnabled, playSound } = useSoundEffects();
  const [recovered, setRecovered] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [confirmClearBlocks, setConfirmClearBlocks] = useState(false);
  const [confirmDeleteReflection, setConfirmDeleteReflection] = useState(false);
  const recoveryStorageKey = useMemo(() => recoveryKey("workspace", reflectionId), [reflectionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getReflection(reflectionId);
        if (cancelled) return;
        setReflection(data);
        setBaseUpdatedAt(data.updated_at);
        const recovery = readRecovery<{ blocks: SavedBlock[]; connections: SavedConnection[] }>(recoveryStorageKey);
        if (recovery && recovery.baseUpdatedAt === data.updated_at) {
          setBlocks(normalizeOrder(recovery.value.blocks));
          setConnections(recovery.value.connections ?? []);
          setSelectedBlockId(recovery.value.blocks[0]?.id ?? null);
          setDirty(true);
          setRecovered(true);
        } else {
          setBlocks(normalizeOrder(data.blocks));
          setConnections(data.connections ?? []);
          setSelectedBlockId(data.blocks[0]?.id ?? null);
          setDirty(false);
          setRecovered(false);
        }
        setSelectedConnectionId(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reflection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [recoveryStorageKey, reflectionId]);

  useEffect(() => {
    if (!dirty || baseUpdatedAt === null) return;
    const timeout = window.setTimeout(() => {
      writeRecovery(recoveryStorageKey, { blocks, connections }, baseUpdatedAt);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [baseUpdatedAt, blocks, connections, dirty, recoveryStorageKey]);

  const markChanged = useCallback(() => {
    setDirty(true);
    setSaveMessage(null);
  }, []);

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );
  const addedLibraryIds = useMemo(
    () => new Set(blocks.map((block) => block.library_block_id).filter((value): value is string => Boolean(value))),
    [blocks],
  );

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    };
  }, [camera]);

  const viewCenterWorld = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 80, y: 80 };
    const rect = viewport.getBoundingClientRect();
    return {
      x: (rect.width / 2 - camera.x) / camera.zoom,
      y: (rect.height / 2 - camera.y) / camera.zoom,
    };
  }, [camera]);

  const addLibraryBlock = useCallback((libraryBlock: LibraryBlock, x?: number, y?: number) => {
    if (addedLibraryIds.has(libraryBlock.id)) return;
    const center = viewCenterWorld();
    const created = newBoardBlock(
      libraryBlock,
      blocks.length,
      x ?? center.x - WORKSPACE_BLOCK_WIDTH / 2 + (blocks.length % 3) * 24,
      y ?? center.y - WORKSPACE_BLOCK_HEIGHT / 2 + (blocks.length % 3) * 24,
    );
    setBlocks((current) => [...current, created]);
    setSelectedBlockId(created.id);
    setSelectedConnectionId(null);
    markChanged();
    playSound("add");
    void trackUsability("block_added", reflectionId, { category: libraryBlock.category, block_count: blocks.length + 1 });
  }, [addedLibraryIds, blocks.length, markChanged, playSound, reflectionId, viewCenterWorld]);

  const addCustomBlock = useCallback((question: string, category: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;
    const safeCategory = BLOCK_CATEGORIES.some((item) => item.id === category) ? category : "situation";
    const center = viewCenterWorld();
    const created = newBoardBlock(
      { id: `custom-${crypto.randomUUID()}`, category: safeCategory, question: cleanQuestion },
      blocks.length,
      center.x - WORKSPACE_BLOCK_WIDTH / 2 + (blocks.length % 3) * 24,
      center.y - WORKSPACE_BLOCK_HEIGHT / 2 + (blocks.length % 3) * 24,
      null,
    );
    setBlocks((current) => [...current, created]);
    setSelectedBlockId(created.id);
    setSelectedConnectionId(null);
    markChanged();
    playSound("add");
    void trackUsability("custom_block_added", reflectionId, {
      requirement_id: "R13",
      category: safeCategory,
      block_count: blocks.length + 1,
    });
  }, [blocks.length, markChanged, playSound, reflectionId, viewCenterWorld]);

  const addAISuggestion = useCallback((suggestion: AISuggestion) => {
    const category = BLOCK_CATEGORIES.some((item) => item.id === suggestion.category) ? suggestion.category : "situation";
    const source = suggestion.connect_from_block_id
      ? blocks.find((block) => block.id === suggestion.connect_from_block_id)
      : null;
    const center = viewCenterWorld();
    const targetX = source ? source.position_x + 420 : center.x - WORKSPACE_BLOCK_WIDTH / 2;
    const targetY = source ? source.position_y + 24 : center.y - WORKSPACE_BLOCK_HEIGHT / 2;
    const created = newBoardBlock(
      { id: `ai-${crypto.randomUUID()}`, category, question: suggestion.question },
      blocks.length,
      targetX,
      targetY,
      null,
    );
    setBlocks((current) => [...current, created]);
    if (source) {
      const ports = bestPorts(source, targetX, targetY);
      setConnections((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source_block_id: source.id,
          target_block_id: created.id,
          relation_type: suggestion.relation_type,
          source_port: ports.source,
          target_port: ports.target,
          relation_label: null,
        },
      ]);
      playSound("connect");
    } else {
      playSound("add");
    }
    setSelectedBlockId(created.id);
    setSelectedConnectionId(null);
    markChanged();
  }, [blocks, markChanged, playSound, viewCenterWorld]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const libraryId = event.dataTransfer.getData("text/reflectblocks-library-id");
    const libraryBlock = BLOCK_LIBRARY.find((item) => item.id === libraryId);
    if (!libraryBlock || addedLibraryIds.has(libraryId)) return;
    const world = clientToWorld(event.clientX, event.clientY);
    addLibraryBlock(libraryBlock, world.x - 24, world.y - 24);
  }, [addLibraryBlock, addedLibraryIds, clientToWorld]);

  const updateAnswer = useCallback((id: string, answer: string) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, answer } : block));
    markChanged();
  }, [markChanged]);

  const updateQuestion = useCallback((id: string, question: string) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, question } : block));
    markChanged();
  }, [markChanged]);

  const finishQuestionEdit = useCallback((_id: string) => {
    void trackUsability("block_question_edited", reflectionId, { requirement_id: "R13", success: true });
  }, [reflectionId]);

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeOrder(next);
    });
    markChanged();
    void trackUsability("block_reordered", reflectionId, { requirement_id: "R13", success: true });
  }, [markChanged, reflectionId]);

  const removeBlock = useCallback((id: string) => {
    setBlocks((current) => normalizeOrder(current.filter((block) => block.id !== id)));
    setConnections((current) => current.filter(
      (connection) => connection.source_block_id !== id && connection.target_block_id !== id,
    ));
    setSelectedBlockId((current) => current === id ? null : current);
    setSelectedConnectionId(null);
    markChanged();
    playSound("disconnect");
    void trackUsability("block_dismissed", reflectionId, { requirement_id: "R2", success: true });
  }, [markChanged, playSound, reflectionId]);

  const connectBlocks = useCallback((
    sourceId: string,
    targetId: string,
    relationType: RelationType,
    sourcePort: PortSide,
    targetPort: PortSide,
  ) => {
    if (sourceId === targetId) return;
    const existing = pairExists(sourceId, targetId, connections);
    if (existing) {
      setSelectedConnectionId(existing.id);
      setSelectedBlockId(null);
      return;
    }
    const created: SavedConnection = {
      id: crypto.randomUUID(),
      source_block_id: sourceId,
      target_block_id: targetId,
      relation_type: relationType,
      source_port: sourcePort,
      target_port: targetPort,
      relation_label: null,
    };
    setConnections((current) => [...current, created]);
    setSelectedConnectionId(created.id);
    setSelectedBlockId(null);
    markChanged();
    playSound("connect");
    void trackUsability("connection_created", reflectionId, { relation_type: relationType, connection_count: connections.length + 1 });
  }, [connections, markChanged, playSound, reflectionId]);

  const changeConnection = useCallback((id: string, patch: Partial<SavedConnection>) => {
    setConnections((current) => current.map((connection) => connection.id === id ? { ...connection, ...patch } : connection));
    markChanged();
  }, [markChanged]);

  const reverseConnection = useCallback((id: string) => {
    setConnections((current) => current.map((connection) => {
      if (connection.id !== id) return connection;
      const symmetric = ["related_to", "contrasts_with", "supports", "reminds_me_of"].includes(connection.relation_type);
      return {
        ...connection,
        source_block_id: connection.target_block_id,
        target_block_id: connection.source_block_id,
        source_port: connection.target_port,
        target_port: connection.source_port,
        relation_type: symmetric ? connection.relation_type : "related_to",
        relation_label: symmetric ? connection.relation_label : null,
      };
    }));
    markChanged();
  }, [markChanged]);

  const disconnect = useCallback((id: string) => {
    setConnections((current) => current.filter((connection) => connection.id !== id));
    setSelectedConnectionId((current) => current === id ? null : current);
    markChanged();
    playSound("disconnect");
  }, [markChanged, playSound]);

  const beginBlockDrag = useCallback((event: React.PointerEvent<HTMLElement>, block: SavedBlock) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const state: DragState = {
      id: block.id,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: block.position_x,
      startY: block.position_y,
    };
    setDragState(state);

    function move(pointerEvent: PointerEvent) {
      const dx = (pointerEvent.clientX - state.startPointerX) / camera.zoom;
      const dy = (pointerEvent.clientY - state.startPointerY) / camera.zoom;
      setBlocks((current) => current.map((item) => item.id === state.id
        ? { ...item, position_x: Math.round(state.startX + dx), position_y: Math.round(state.startY + dy) }
        : item));
      setDirty(true);
      setSaveMessage(null);
    }
    function up() {
      setDragState(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [camera.zoom]);

  const beginConnection = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
    block: SavedBlock,
    port: PortSide,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const sourcePoint = getPortPoint(block, port);
    const initial: ConnectionDraft = {
      sourceId: block.id,
      sourcePort: port,
      pointerX: sourcePoint.x,
      pointerY: sourcePoint.y,
      targetId: null,
      targetPort: null,
    };
    connectionDraftRef.current = initial;
    setConnectionDraft(initial);

    function move(pointerEvent: PointerEvent) {
      const world = clientToWorld(pointerEvent.clientX, pointerEvent.clientY);
      const target = blocks.find((candidate) => candidate.id !== block.id && pointInsideBlock(candidate, world.x, world.y)) ?? null;
      const targetPort = target ? nearestPort(target, world.x, world.y) : null;
      const next: ConnectionDraft = {
        sourceId: block.id,
        sourcePort: port,
        pointerX: world.x,
        pointerY: world.y,
        targetId: target?.id ?? null,
        targetPort,
      };
      connectionDraftRef.current = next;
      setConnectionDraft(next);
    }
    function up() {
      const draft = connectionDraftRef.current;
      if (draft?.targetId && draft.targetPort) {
        const target = blocks.find((candidate) => candidate.id === draft.targetId);
        if (target) {
          connectBlocks(block.id, target.id, inferRelation(block.category, target.category), port, draft.targetPort);
        }
      }
      connectionDraftRef.current = null;
      setConnectionDraft(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [blocks, clientToWorld, connectBlocks]);

  const beginPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".workspace-block") || target.closest(".connection-label-group") || target.closest(".connection-hit-path") || target.closest("button, input, textarea, select")) return;
    event.preventDefault();
    const state: PanState = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: camera.x,
      startY: camera.y,
    };
    setPanState(state);
    setSelectedBlockId(null);
    setSelectedConnectionId(null);

    function move(pointerEvent: PointerEvent) {
      setCamera((current) => ({
        ...current,
        x: state.startX + pointerEvent.clientX - state.startPointerX,
        y: state.startY + pointerEvent.clientY - state.startPointerY,
      }));
    }
    function up() {
      setPanState(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [camera.x, camera.y]);

  const zoomAt = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const py = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setCamera((current) => {
      const worldX = (px - current.x) / current.zoom;
      const worldY = (py - current.y) / current.zoom;
      return { x: px - worldX * z, y: py - worldY * z, zoom: z };
    });
  }, []);

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || blocks.length === 0) {
      setCamera({ x: 110, y: 90, zoom: 1 });
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const minX = Math.min(...blocks.map((block) => block.position_x));
    const minY = Math.min(...blocks.map((block) => block.position_y));
    const maxX = Math.max(...blocks.map((block) => block.position_x + WORKSPACE_BLOCK_WIDTH));
    const maxY = Math.max(...blocks.map((block) => block.position_y + WORKSPACE_BLOCK_HEIGHT));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zoom = Math.max(MIN_ZOOM, Math.min(1.2, Math.min((rect.width - 100) / width, (rect.height - 100) / height)));
    setCamera({
      zoom,
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - height * zoom) / 2 - minY * zoom,
    });
  }, [blocks]);

  async function saveBoard() {
    try {
      setSaving(true);
      setError(null);
      const saved = await saveReflectionWorkspace(reflectionId, normalizeOrder(blocks), connections);
      setBlocks(normalizeOrder(saved.blocks));
      setConnections(saved.connections);
      setDirty(false);
      setRecovered(false);
      clearRecovery(recoveryStorageKey);
      setBaseUpdatedAt(Math.floor(Date.now() / 1000));
      setSaveMessage("Blocks saved");
      void trackUsability("workspace_saved", reflectionId, { block_count: saved.blocks.length, connection_count: saved.connections.length, answered_count: saved.blocks.filter((item) => item.answer.trim()).length });
      playSound("save");
      window.setTimeout(() => setSaveMessage(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save reflection workspace.");
    } finally {
      setSaving(false);
    }
  }

  async function discardUnsavedWorkspace() {
    try {
      setError(null);
      const data = await getReflection(reflectionId);
      setReflection(data);
      setBlocks(normalizeOrder(data.blocks));
      setConnections(data.connections ?? []);
      setSelectedBlockId(data.blocks[0]?.id ?? null);
      setSelectedConnectionId(null);
      setBaseUpdatedAt(data.updated_at);
      setDirty(false);
      setRecovered(false);
      clearRecovery(recoveryStorageKey);
      setSaveMessage("Unsaved workspace changes discarded");
      void trackUsability("discard_unsaved", reflectionId, { action: "workspace" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore saved workspace.");
    }
  }

  async function clearSavedBlocks() {
    try {
      setError(null);
      await deleteWorkspaceContent(reflectionId);
      setBlocks([]);
      setConnections([]);
      setSelectedBlockId(null);
      setSelectedConnectionId(null);
      setDirty(false);
      setRecovered(false);
      clearRecovery(recoveryStorageKey);
      setBaseUpdatedAt(Math.floor(Date.now() / 1000));
      setSaveMessage("Saved blocks deleted");
      void trackUsability("delete_action", reflectionId, { action: "blocks" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete blocks.");
    } finally {
      setConfirmClearBlocks(false);
    }
  }

  async function removeReflection() {
    try {
      await deleteReflection(reflectionId);
      clearRecovery(recoveryStorageKey);
      void trackUsability("delete_action", reflectionId, { action: "reflection" });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete reflection.");
    } finally {
      setConfirmDeleteReflection(false);
    }
  }

  if (loading) {
    return <section className="workspace-loading"><p className="muted">Opening your reflection…</p></section>;
  }

  if (!reflection) {
    return (
      <section className="workspace-loading">
        <p className="error">{error ?? "Reflection not found."}</p>
        <button className="secondary-button" type="button" onClick={onBack}>Back to reflections</button>
      </section>
    );
  }

  const grid = GRID_SIZE * camera.zoom;

  return (
    <section className="reflection-workspace-page">
      <div className="workspace-topline">
        <button className="back-button" type="button" onClick={onBack}>← Reflections</button>
        <div className="workspace-save-area">
          <span className={`save-state ${dirty ? "unsaved" : ""}`} aria-live="polite">
            {saveMessage ?? (dirty ? "Unsaved changes" : "All changes saved")}
          </span>
          <button className="primary-button" type="button" onClick={saveBoard} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save blocks only"}
          </button>
        </div>
      </div>

      <div className="thought-banner">
        <div>
          <p className="eyebrow">Your quick thought</p>
          <p>{reflection.quick_thought}</p>
        </div>
        <span className="block-summary">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} · {connections.length} semantic arrow{connections.length === 1 ? "" : "s"} · {blocks.filter((block) => block.answer.trim()).length} answered
        </span>
      </div>

      {recovered ? (
        <div className="recovery-banner" role="status">
          <div><strong>Recovered unsaved workspace changes from this device.</strong><span>Save the blocks or discard the recovered changes.</span></div>
          <button className="micro-button" type="button" onClick={() => { void discardUnsavedWorkspace(); }}>Discard recovery</button>
        </div>
      ) : null}

      <div className="workspace-control-strip" aria-label="Reflection controls">
        <button className="secondary-button" type="button" onClick={onOpenFreeWriting}>Write freely</button>
        {dirty ? <button className="secondary-button" type="button" onClick={() => { void discardUnsavedWorkspace(); }}>Save nothing</button> : null}
        {blocks.length > 0 ? <button className="danger-text-button" type="button" onClick={() => setConfirmClearBlocks(true)}>Delete saved blocks</button> : null}
        <button className="danger-text-button" type="button" onClick={() => setConfirmDeleteReflection(true)}>Delete reflection</button>
      </div>

      {error ? <p className="error workspace-error" role="alert">{error}</p> : null}

      <JournalGeneratorPanel
        reflectionId={reflectionId}
        quickThought={reflection.quick_thought}
        blocks={blocks}
        connections={connections}
        onPlaySound={() => playSound("ai")}
        onOpenJournal={onOpenJournal}
      />

      <div className="scratch-layout enhanced drawio-layout">
        <BlockPalette
          addedLibraryIds={addedLibraryIds}
          selectedBlock={selectedBlock}
          onAdd={addLibraryBlock}
          onAddCustom={addCustomBlock}
          aiPanel={(
            <AISuggestionsPanel
              reflectionId={reflectionId}
              blocks={blocks}
              connections={connections}
              onAddSuggestion={addAISuggestion}
              onPlaySound={() => playSound("ai")}
            />
          )}
        />

        <section className="whiteboard-panel" aria-label="Infinite semantic reflection canvas">
          <div className="whiteboard-heading drawio-heading">
            <div className="whiteboard-heading-copy">
              <p className="eyebrow">Reflection map</p>
              <h2>Connect ideas the way they relate in your head.</h2>
              <p>Move blocks by dragging their header. Drag from any connector dot to any other block to create an arrow.</p>
            </div>
            <ConnectionInspector
              selectedConnection={selectedConnection}
              selectedBlock={selectedBlock}
              blocks={blocks}
              onChange={changeConnection}
              onReverse={reverseConnection}
              onDisconnect={disconnect}
            />
          </div>

          <div className="canvas-toolbar" aria-label="Canvas controls">
            <button type="button" onClick={() => zoomAt(camera.zoom - 0.1)} aria-label="Zoom out">−</button>
            <button type="button" className="zoom-readout" onClick={() => zoomAt(1)} title="Reset to 100%">{Math.round(camera.zoom * 100)}%</button>
            <button type="button" onClick={() => zoomAt(camera.zoom + 0.1)} aria-label="Zoom in">+</button>
            <button type="button" onClick={fitView}>Fit</button>
            <span className="toolbar-divider" />
            <button
              type="button"
              className={soundEnabled ? "active" : ""}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title="Soft interface sound effects"
            >
              {soundEnabled ? "🔊 Sound" : "🔇 Sound"}
            </button>
            <span className="canvas-tip">Drag empty space to pan · Ctrl/⌘ + wheel to zoom</span>
          </div>

          <div
            ref={viewportRef}
            className={`infinite-canvas ${panState ? "panning" : ""} ${dragState ? "moving-block" : ""}`}
            style={{
              backgroundSize: `${grid}px ${grid}px`,
              backgroundPosition: `${camera.x % grid}px ${camera.y % grid}px`,
            }}
            onPointerDown={beginPan}
            onWheel={(event) => {
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                zoomAt(camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08), event.clientX, event.clientY);
              } else {
                setCamera((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDrop}
          >
            <div
              className="canvas-world"
              style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
            >
              <ConnectionLayer
                blocks={blocks}
                connections={connections}
                selectedConnectionId={selectedConnectionId}
                draft={connectionDraft}
                onSelectConnection={(id) => {
                  setSelectedConnectionId(id);
                  setSelectedBlockId(null);
                }}
              />

              {blocks.length === 0 ? (
                <div className="board-empty-state infinite-empty" style={{ left: 60, top: 50 }}>
                  <div className="empty-board-icon">＋</div>
                  <strong>Start your reflection map</strong>
                  <span>Add a question from the left. The canvas has no fixed edge—pan anywhere and connect ideas with semantic arrows.</span>
                </div>
              ) : null}

              {blocks.map((block, index) => {
                const incoming = connections.filter((connection) => connection.target_block_id === block.id).length;
                const outgoing = connections.filter((connection) => connection.source_block_id === block.id).length;
                const targetPort = connectionDraft?.targetId === block.id ? connectionDraft.targetPort : null;
                return (
                  <ReflectionBlock
                    key={block.id}
                    block={block}
                    selected={selectedBlockId === block.id}
                    incomingCount={incoming}
                    outgoingCount={outgoing}
                    activeTargetPort={targetPort}
                    canMoveEarlier={index > 0}
                    canMoveLater={index < blocks.length - 1}
                    onSelect={(id) => {
                      setSelectedBlockId(id);
                      setSelectedConnectionId(null);
                    }}
                    onAnswerChange={updateAnswer}
                    onQuestionChange={updateQuestion}
                    onQuestionEditComplete={finishQuestionEdit}
                    onMoveEarlier={(id) => moveBlock(id, -1)}
                    onMoveLater={(id) => moveBlock(id, 1)}
                    onRemove={removeBlock}
                    onDragStart={beginBlockDrag}
                    onConnectionStart={beginConnection}
                  />
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmClearBlocks}
        title="Delete all saved blocks?"
        description="This permanently deletes the reflection blocks and semantic arrows. Your quick thought, saved journal, and free writing remain."
        confirmLabel="Delete blocks"
        danger
        onConfirm={() => { void clearSavedBlocks(); }}
        onCancel={() => setConfirmClearBlocks(false)}
      />
      <ConfirmDialog
        open={confirmDeleteReflection}
        title="Delete this entire reflection?"
        description="This permanently deletes the quick thought, blocks, saved generated journal, and free-writing document for this reflection."
        confirmLabel="Delete reflection"
        danger
        onConfirm={() => { void removeReflection(); }}
        onCancel={() => setConfirmDeleteReflection(false)}
      />
    </section>
  );
}
