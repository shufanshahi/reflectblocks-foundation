import { useEffect, useState } from "react";

import { getReflections, type Reflection } from "../reflections";
import { PromptPreferenceControl } from "./PromptPreferenceControl";

type HomeProps = {
  onNewReflection: () => void;
  onNewFreeWriting: () => void;
  onOpenWorkspace: (reflection: Reflection) => void;
  onOpenJournal: (reflection: Reflection) => void;
  onOpenFreeWriting: (reflection: Reflection) => void;
  onOpenEvaluation: () => void;
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatSavedTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function Home({
  onNewReflection,
  onNewFreeWriting,
  onOpenWorkspace,
  onOpenJournal,
  onOpenFreeWriting,
  onOpenEvaluation,
}: HomeProps) {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getReflections();
        if (!cancelled) setReflections(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reflections.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="home page-enter">
      <div className="home-hero">
        <p className="eyebrow">A little space for yourself</p>
        <h1>What's on your mind?</h1>
        <p className="hero-copy">Capture one thought, explore it with blocks, or skip structure and write freely.</p>
        <div className="home-primary-actions">
          <button className="primary-button" type="button" onClick={onNewReflection} data-telemetry="new-reflection">
            + New reflection
          </button>
          <button className="secondary-button large-secondary" type="button" onClick={onNewFreeWriting} data-telemetry="new-free-writing">
            Write freely
          </button>
        </div>
        <PromptPreferenceControl />
      </div>

      <section className="history-section" aria-labelledby="recent-reflections-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your journal</p>
            <h2 id="recent-reflections-title">Recent reflections</h2>
          </div>
          <button className="study-link-button" type="button" onClick={onOpenEvaluation}>Run HCI evaluation</button>
        </div>

        {loading ? <p className="muted">Loading reflections…</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}

        {!loading && !error && reflections.length === 0 ? (
          <div className="empty-state">
            <p>No reflections yet.</p>
            <span>Your first thought or free-writing entry will appear here after you save it.</span>
          </div>
        ) : null}

        <div className="reflection-list">
          {reflections.map((reflection) => {
            const hasJournal = Boolean(reflection.generated_entry_title);
            const hasFreeWriting = Boolean(reflection.free_writing_title || reflection.free_writing_updated_at);
            return (
              <article className={`reflection-row ${hasJournal ? "has-journal" : ""}`} key={reflection.id}>
                <div className="reflection-row-copy">
                  <p className="reflection-preview">{reflection.quick_thought}</p>
                  <time>{formatDate(reflection.updated_at)}</time>
                  <div className="reflection-content-badges" aria-label="Saved content">
                    {hasJournal ? <span className="journal-ready-badge">Generated journal</span> : null}
                    {hasFreeWriting ? <span className="free-writing-badge">Free writing</span> : null}
                    {!hasJournal && !hasFreeWriting ? <span className="home-no-journal">Blocks / thought only</span> : null}
                  </div>
                  {hasJournal ? (
                    <div className="home-journal-summary">
                      <strong>{reflection.generated_entry_title}</strong>
                      {reflection.generated_entry_updated_at ? <small>Updated {formatSavedTime(reflection.generated_entry_updated_at)}</small> : null}
                    </div>
                  ) : null}
                </div>

                <div className="reflection-row-actions">
                  <button className="secondary-button" type="button" onClick={() => onOpenWorkspace(reflection)}>Workspace</button>
                  {hasFreeWriting ? (
                    <button className="secondary-button" type="button" onClick={() => onOpenFreeWriting(reflection)}>Free writing</button>
                  ) : null}
                  {hasJournal ? (
                    <button className="primary-button journal-home-button" type="button" onClick={() => onOpenJournal(reflection)}>
                      Open journal →
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
