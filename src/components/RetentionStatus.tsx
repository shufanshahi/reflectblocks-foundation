import { useEffect, useState } from "react";

import { getFreeWriting, getReflection, getSavedGeneratedEntry } from "../reflections";

type RetentionStatusProps = {
  reflectionId: string;
  refreshKey?: number;
};

type Snapshot = {
  quickThought: boolean;
  blockCount: number;
  generatedEntry: boolean;
  freeWriting: boolean;
};

export function RetentionStatus({ reflectionId, refreshKey = 0 }: RetentionStatusProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getReflection(reflectionId),
      getSavedGeneratedEntry(reflectionId),
      getFreeWriting(reflectionId),
    ])
      .then(([reflection, entry, writing]) => {
        if (cancelled) return;
        setFailed(false);
        setSnapshot({
          quickThought: Boolean(reflection.quick_thought.trim()),
          blockCount: reflection.blocks.length,
          generatedEntry: Boolean(entry),
          freeWriting: Boolean(writing),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reflectionId, refreshKey]);

  if (failed) return <p className="retention-status" role="status">Could not check what is saved.</p>;
  if (!snapshot) return null;

  const items = [
    snapshot.quickThought ? "Quick thought" : null,
    snapshot.blockCount > 0 ? `${snapshot.blockCount} reflection block${snapshot.blockCount === 1 ? "" : "s"}` : null,
    snapshot.generatedEntry ? "Generated entry" : null,
    snapshot.freeWriting ? "Free writing" : null,
  ].filter((item): item is string => item !== null);
  const missing = [
    snapshot.blockCount === 0 ? "reflection blocks" : null,
    snapshot.generatedEntry ? null : "generated entry",
    snapshot.freeWriting ? null : "free writing",
  ].filter((item): item is string => item !== null);

  return (
    <p className="retention-status" role="status" aria-live="polite">
      <strong>Currently saved in your account:</strong> {items.length ? items.join(" · ") : "nothing"}.
      {missing.length ? <span> Not saved: {missing.join(", ")}.</span> : null}
    </p>
  );
}
