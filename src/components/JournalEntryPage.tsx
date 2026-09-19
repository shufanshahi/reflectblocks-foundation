import { useEffect, useMemo, useState } from "react";

import {
  deleteGeneratedEntry,
  getReflection,
  getSavedGeneratedEntry,
  saveGeneratedEntry,
  type ReflectionDetail,
  type SavedGeneratedEntry,
  type JournalSourceSnapshot,
} from "../reflections";
import { clearRecovery, readRecovery, recoveryKey, writeRecovery } from "../lib/draftRecovery";
import { trackUsability } from "../lib/usability";
import { ConfirmDialog } from "./ConfirmDialog";

type JournalEntryPageProps = {
  reflectionId: string;
  onBack: () => void;
  onOpenWorkspace: () => void;
  onOpenFreeWriting: () => void;
};

type InspectedSource = {
  paragraphId: string;
  source: JournalSourceSnapshot;
};

type JournalRecovery = {
  title: string;
  paragraphs: Array<{ id: string; text: string }>;
};

function formatSavedTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function safeFilename(title: string) {
  return (title.trim() || "reflectblocks-journal")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reflectblocks-journal";
}

function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function JournalEntryPage({
  reflectionId,
  onBack,
  onOpenWorkspace,
  onOpenFreeWriting,
}: JournalEntryPageProps) {
  const [reflection, setReflection] = useState<ReflectionDetail | null>(null);
  const [entry, setEntry] = useState<SavedGeneratedEntry | null>(null);
  const [savedBaseline, setSavedBaseline] = useState<SavedGeneratedEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [inspectedSource, setInspectedSource] = useState<InspectedSource | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const key = useMemo(() => recoveryKey("journal", reflectionId), [reflectionId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [nextReflection, nextEntry] = await Promise.all([
          getReflection(reflectionId),
          getSavedGeneratedEntry(reflectionId),
        ]);
        if (cancelled) return;
        setReflection(nextReflection);
        setSavedBaseline(nextEntry);

        if (nextEntry) {
          const recovery = readRecovery<JournalRecovery>(key);
          if (recovery && recovery.baseUpdatedAt === nextEntry.updated_at) {
            const recoveredText = new Map(recovery.value.paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
            setEntry({
              ...nextEntry,
              title: recovery.value.title,
              paragraphs: nextEntry.paragraphs.map((paragraph) => ({
                ...paragraph,
                text: recoveredText.get(paragraph.id) ?? paragraph.text,
              })),
            });
            setDirty(true);
            setRecovered(true);
            setSaveMessage(null);
          } else {
            setEntry(nextEntry);
            setDirty(false);
            setSaveMessage(`Saved ${formatSavedTime(nextEntry.updated_at)}`);
          }
        } else {
          setEntry(null);
          setDirty(false);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open journal entry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [reflectionId, key]);

  useEffect(() => {
    if (!dirty || !entry || !savedBaseline) return;
    const timeout = window.setTimeout(() => {
      writeRecovery<JournalRecovery>(key, {
        title: entry.title,
        paragraphs: entry.paragraphs.map((paragraph) => ({ id: paragraph.id, text: paragraph.text })),
      }, savedBaseline.updated_at);
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [dirty, entry, key, savedBaseline]);

  const inspectedParagraph = useMemo(() => {
    if (!entry || !inspectedSource) return null;
    return entry.paragraphs.find((paragraph) => paragraph.id === inspectedSource.paragraphId) ?? null;
  }, [entry, inspectedSource]);

  function markChanged() {
    setDirty(true);
    setSaveMessage(null);
  }

  function updateTitle(title: string) {
    setEntry((current) => current ? { ...current, title } : current);
    markChanged();
  }

  function updateParagraph(index: number, text: string) {
    setEntry((current) => current
      ? {
          ...current,
          paragraphs: current.paragraphs.map((paragraph, paragraphIndex) => (
            paragraphIndex === index ? { ...paragraph, text } : paragraph
          )),
        }
      : current);
    markChanged();
    void trackUsability("journal_paragraph_edited", reflectionId, { requirement_id: "R12", success: true });
  }

  async function saveChanges() {
    if (!entry) return;
    if (!entry.title.trim()) {
      setError("Give the journal entry a title before saving.");
      return;
    }
    if (entry.paragraphs.some((paragraph) => !paragraph.text.trim())) {
      setError("Journal paragraphs cannot be empty.");
      return;
    }

    const sourcesByParagraphId = Object.fromEntries(
      entry.paragraphs.map((paragraph) => [paragraph.id, paragraph.sources]),
    );

    try {
      setSaving(true);
      setError(null);
      const saved = await saveGeneratedEntry(
        reflectionId,
        {
          model: entry.model,
          title: entry.title,
          paragraphs: entry.paragraphs.map(({ sources: _sources, ...paragraph }) => paragraph),
        },
        sourcesByParagraphId,
      );
      setEntry(saved);
      setSavedBaseline(saved);
      clearRecovery(key);
      setDirty(false);
      setRecovered(false);
      setSaveMessage(`Saved ${formatSavedTime(saved.updated_at)}`);
      void trackUsability("journal_saved", reflectionId, { source_count: saved.paragraphs.reduce((sum, item) => sum + item.sources.length, 0) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update journal entry.");
    } finally {
      setSaving(false);
    }
  }

  function discardUnsaved() {
    if (savedBaseline) setEntry(savedBaseline);
    clearRecovery(key);
    setDirty(false);
    setRecovered(false);
    setSaveMessage(savedBaseline ? `Saved ${formatSavedTime(savedBaseline.updated_at)}` : null);
    setConfirmDiscard(false);
    void trackUsability("discard_unsaved", reflectionId, { action: "journal" });
  }

  async function removeJournal() {
    try {
      await deleteGeneratedEntry(reflectionId);
      clearRecovery(key);
      void trackUsability("delete_action", reflectionId, { action: "generated_journal" });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete journal entry.");
    } finally {
      setConfirmDelete(false);
    }
  }

  function exportJournal(format: "txt" | "md") {
    if (!entry) return;
    const paragraphs = entry.paragraphs.map((paragraph) => paragraph.text.trim()).filter(Boolean);
    const text = format === "md"
      ? `# ${entry.title.trim()}\n\n${paragraphs.join("\n\n")}\n`
      : `${entry.title.trim()}\n${"=".repeat(Math.min(entry.title.trim().length, 60))}\n\n${paragraphs.join("\n\n")}\n`;
    downloadText(`${safeFilename(entry.title)}.${format}`, text, format === "md" ? "text/markdown" : "text/plain");
    void trackUsability("export_clicked", reflectionId, { format });
  }

  if (loading) {
    return <section className="journal-page journal-page-loading page-enter"><p className="muted">Opening your journal…</p></section>;
  }

  if (!entry) {
    return (
      <section className="journal-page page-enter">
        <div className="journal-page-topbar">
          <button className="back-button" type="button" onClick={onBack}>← Reflections</button>
          <div className="journal-page-actions">
            <button className="secondary-button" type="button" onClick={onOpenFreeWriting}>Write freely</button>
            <button className="secondary-button" type="button" onClick={onOpenWorkspace}>Open workspace</button>
          </div>
        </div>
        <div className="journal-empty-card">
          <p className="eyebrow">Journal</p>
          <h1>No saved journal entry yet.</h1>
          <p>Open the reflection workspace, choose your sources, and generate an entry when you're ready—or write freely without AI.</p>
          <div className="empty-journal-actions">
            <button className="secondary-button" type="button" onClick={onOpenFreeWriting}>Write freely</button>
            <button className="primary-button" type="button" onClick={onOpenWorkspace}>Go to workspace →</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="journal-page page-enter">
      <div className="journal-page-topbar">
        <button className="back-button" type="button" onClick={onBack}>← Reflections</button>
        <div className="journal-page-actions">
          <button className="secondary-button" type="button" onClick={onOpenFreeWriting}>Free writing</button>
          <button className="secondary-button" type="button" onClick={onOpenWorkspace}>Workspace</button>
          <button className="secondary-button" type="button" onClick={() => exportJournal("txt")}>Export .txt</button>
          <button className="secondary-button" type="button" onClick={() => exportJournal("md")}>Export .md</button>
          <button className="primary-button" type="button" onClick={saveChanges} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {recovered ? (
        <div className="recovery-banner" role="status">
          <div><strong>Recovered unsaved journal edits from this device.</strong><span>Review them before saving or choose Save nothing to restore the last saved version.</span></div>
          <button className="micro-button" type="button" onClick={() => setConfirmDiscard(true)}>Save nothing</button>
        </div>
      ) : null}

      {reflection ? (
        <div className="journal-context-strip">
          <span>Original thought</span>
          <p>{reflection.quick_thought}</p>
        </div>
      ) : null}

      <div className="journal-document-shell">
        <header className="journal-document-header">
          <div>
            <p className="eyebrow">Saved journal</p>
            <p className="journal-save-status" aria-live="polite">
              {saveMessage ?? (dirty ? "Unsaved changes · recovery copy stored locally" : `Saved ${formatSavedTime(entry.updated_at)}`)}
            </p>
          </div>
          <span className="draft-model-badge">{entry.model}</span>
        </header>

        <input
          className="journal-document-title"
          value={entry.title}
          onChange={(event) => updateTitle(event.target.value)}
          aria-label="Journal title"
        />

        <div className="journal-document-body">
          {entry.paragraphs.map((paragraph, index) => (
            <article className="journal-document-paragraph" key={paragraph.id}>
              <textarea
                value={paragraph.text}
                rows={Math.max(4, Math.ceil(paragraph.text.length / 90))}
                onChange={(event) => updateParagraph(index, event.target.value)}
                aria-label={`Journal paragraph ${index + 1}`}
              />
              <div className="journal-document-sources">
                <span>Sources</span>
                {paragraph.sources.map((source, sourceIndex) => (
                  <button
                    type="button"
                    className={`source-chip ${source.kind === "quick_thought" ? "quick" : ""}`}
                    key={`${source.kind}-${source.block_id ?? "quick"}-${sourceIndex}`}
                    onClick={() => {
                      setInspectedSource({ paragraphId: paragraph.id, source });
                      void trackUsability("journal_source_inspected", reflectionId, { requirement_id: "R5", success: true });
                    }}
                  >
                    {source.kind === "quick_thought" ? "Quick thought" : source.question ?? "Reflection block"}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>

        <footer className="journal-document-footer">
          <span>Your edits update the saved journal only. Reflection blocks stay unchanged.</span>
          <div className="journal-retention-actions">
            {dirty ? <button className="secondary-button" type="button" onClick={() => setConfirmDiscard(true)}>Save nothing</button> : null}
            <button className="danger-text-button" type="button" onClick={() => setConfirmDelete(true)}>Delete journal</button>
            <button className="primary-button" type="button" onClick={saveChanges} disabled={!dirty || saving}>
              {saving ? "Saving changes…" : dirty ? "Update journal" : "Journal up to date"}
            </button>
          </div>
        </footer>
      </div>

      {inspectedSource && inspectedParagraph ? (
        <aside className="source-inspector journal-page-inspector" aria-label="Source inspection">
          <div className="source-inspector-heading">
            <div>
              <p className="eyebrow">Source inspection</p>
              <h3>{inspectedSource.source.kind === "quick_thought" ? "Quick thought" : inspectedSource.source.question}</h3>
            </div>
            <button type="button" className="micro-button" onClick={() => setInspectedSource(null)}>Close</button>
          </div>
          <div className="source-inspector-grid">
            <div className="source-inspector-card original">
              <span>Original writer material</span>
              <p>{inspectedSource.source.text}</p>
            </div>
            <div className="source-inspector-arrow" aria-hidden="true">→</div>
            <div className="source-inspector-card generated">
              <span>Current journal wording</span>
              <p>{inspectedParagraph.text}</p>
            </div>
          </div>
        </aside>
      ) : null}

      {error ? <p className="error journal-page-error" role="alert">{error}</p> : null}

      <ConfirmDialog
        open={confirmDiscard}
        title="Save nothing from these edits?"
        description="Your unsaved journal edits and local recovery copy will be discarded. The last saved journal stays unchanged."
        confirmLabel="Discard unsaved edits"
        onConfirm={discardUnsaved}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete the saved journal?"
        description="This permanently deletes only the generated journal entry. Your quick thought, blocks, semantic map, and free writing remain."
        confirmLabel="Delete journal"
        danger
        onConfirm={() => { void removeJournal(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
