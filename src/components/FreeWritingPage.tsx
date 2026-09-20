import { useEffect, useMemo, useState } from "react";

import {
  createFreeWriting,
  deleteFreeWriting,
  getFreeWriting,
  saveFreeWriting,
  type FreeWritingEntry,
} from "../reflections";
import { clearRecovery, readRecovery, recoveryKey, writeRecovery } from "../lib/draftRecovery";
import { trackUsability } from "../lib/usability";
import { ConfirmDialog } from "./ConfirmDialog";
import { RetentionStatus } from "./RetentionStatus";

type FreeWritingPageProps = {
  reflectionId: string | null;
  onBack: () => void;
  onCreated: (reflectionId: string) => void;
  onOpenWorkspace?: () => void;
};

type LocalDraft = { title: string; body: string };

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

function safeFilename(title: string) {
  return (title.trim() || "reflectblocks-free-writing")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "reflectblocks-free-writing";
}

export function FreeWritingPage({ reflectionId, onBack, onCreated, onOpenWorkspace }: FreeWritingPageProps) {
  const [entry, setEntry] = useState<FreeWritingEntry | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(Boolean(reflectionId));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [retentionTick, setRetentionTick] = useState(0);

  const key = useMemo(() => recoveryKey("free-writing", reflectionId ?? "new"), [reflectionId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!reflectionId) {
        const recovery = readRecovery<LocalDraft>(key);
        if (recovery && !cancelled) {
          setTitle(recovery.value.title);
          setBody(recovery.value.body);
          setDirty(Boolean(recovery.value.title || recovery.value.body));
          setRecovered(true);
        }
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const saved = await getFreeWriting(reflectionId);
        if (cancelled) return;
        setEntry(saved);
        setTitle(saved?.title ?? "");
        setBody(saved?.body ?? "");
        const recovery = readRecovery<LocalDraft>(key);
        if (recovery && (!saved || recovery.baseUpdatedAt === saved.updated_at)) {
          setTitle(recovery.value.title);
          setBody(recovery.value.body);
          setDirty(true);
          setRecovered(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open free writing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [reflectionId, key]);

  useEffect(() => {
    if (!dirty) return;
    const timeout = window.setTimeout(() => {
      writeRecovery(key, { title, body }, entry?.updated_at);
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [body, dirty, entry?.updated_at, key, title]);

  function changeTitle(value: string) {
    setTitle(value);
    setDirty(true);
    setSaveMessage(null);
  }

  function changeBody(value: string) {
    setBody(value);
    setDirty(true);
    setSaveMessage(null);
  }

  async function save() {
    if (!title.trim() && !body.trim()) {
      setError("Write something before saving.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (reflectionId) {
        const saved = await saveFreeWriting(reflectionId, title, body);
        setEntry(saved);
        clearRecovery(key);
        setDirty(false);
        setRecovered(false);
        setSaveMessage("Saved. Your blocks and generated entry were not changed.");
        setRetentionTick((tick) => tick + 1);
        void trackUsability("free_writing_saved", reflectionId, { char_count: body.length });
      } else {
        const created = await createFreeWriting(title, body);
        clearRecovery(key);
        setEntry(created.entry);
        setDirty(false);
        setRecovered(false);
        setSaveMessage("Saved");
        void trackUsability("free_writing_created", created.reflection_id, { char_count: body.length });
        onCreated(created.reflection_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save free writing.");
    } finally {
      setSaving(false);
    }
  }

  function exportDocument(format: "txt" | "md") {
    const cleanTitle = title.trim();
    const text = format === "md"
      ? `${cleanTitle ? `# ${cleanTitle}\n\n` : ""}${body}\n`
      : `${cleanTitle ? `${cleanTitle}\n${"=".repeat(Math.min(cleanTitle.length, 60))}\n\n` : ""}${body}\n`;
    downloadText(`${safeFilename(title)}.${format}`, text, format === "md" ? "text/markdown" : "text/plain");
    void trackUsability("export_clicked", reflectionId, { format });
    setSaveMessage(`Exported a copy (.${format}) of the text on screen to your device. Nothing was deleted.`);
  }

  function requestLeave() {
    if (dirty) setConfirmLeave(true);
    else onBack();
  }

  function leaveWithoutSaving() {
    clearRecovery(key);
    setConfirmLeave(false);
    onBack();
  }

  function discardUnsaved() {
    clearRecovery(key);
    if (entry) {
      setTitle(entry.title);
      setBody(entry.body);
      setDirty(false);
      setRecovered(false);
      setSaveMessage("Unsaved changes discarded");
    } else {
      onBack();
    }
    setConfirmDiscard(false);
  }

  async function removeSavedWriting() {
    if (!reflectionId) return;
    try {
      await deleteFreeWriting(reflectionId);
      clearRecovery(key);
      void trackUsability("delete_action", reflectionId, { action: "free_writing" });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete free writing.");
    } finally {
      setConfirmDelete(false);
    }
  }

  if (loading) return <section className="free-writing-page page-enter"><p className="muted">Opening writing…</p></section>;

  return (
    <section className="free-writing-page page-enter" aria-labelledby="free-writing-title">
      <div className="document-page-topbar">
        <button className="back-button" type="button" onClick={requestLeave}>← Reflections</button>
        <div className="document-page-actions">
          {onOpenWorkspace ? <button className="secondary-button" type="button" onClick={onOpenWorkspace}>Open workspace</button> : null}
          <div className="export-menu" aria-label="Export free writing">
            <button className="secondary-button" type="button" onClick={() => exportDocument("txt")}>Export .txt</button>
            <button className="secondary-button" type="button" onClick={() => exportDocument("md")}>Export .md</button>
          </div>
          <button className="primary-button" type="button" onClick={save} disabled={saving || (!dirty && Boolean(entry))}>
            {saving ? "Saving…" : dirty || !entry ? "Save writing" : "Saved"}
          </button>
        </div>
      </div>

      {reflectionId ? <RetentionStatus reflectionId={reflectionId} refreshKey={retentionTick} /> : null}

      {recovered ? (
        <div className="recovery-banner" role="status">
          <div><strong>Recovered an unsaved draft from this device.</strong><span>Review it, save it, or discard the recovery.</span></div>
          <button className="micro-button" type="button" onClick={() => setConfirmDiscard(true)}>Discard recovery</button>
        </div>
      ) : null}

      <article className="writing-document-shell">
        <header>
          <p className="eyebrow">Free writing</p>
          <h1 id="free-writing-title">Write without prompts or AI.</h1>
          <p>Nothing here is sent to Gemini. Your browser keeps a local recovery copy while you have unsaved changes.</p>
        </header>

        <input
          className="writing-title-input"
          value={title}
          onChange={(event) => changeTitle(event.target.value)}
          placeholder="Optional title"
          aria-label="Free-writing title"
        />
        <textarea
          className="writing-body-input"
          value={body}
          onChange={(event) => changeBody(event.target.value)}
          placeholder="Start writing…"
          aria-label="Free-writing body"
          autoFocus={!reflectionId}
        />

        <footer className="writing-document-footer">
          <span aria-live="polite">{saveMessage ?? (dirty ? "Unsaved changes · recovery copy stored on this device" : entry ? "Saved" : "Not saved")}</span>
          <div>
            {dirty ? <button className="secondary-button" type="button" onClick={() => setConfirmDiscard(true)}>Save nothing</button> : null}
            {entry ? <button className="danger-text-button" type="button" onClick={() => setConfirmDelete(true)}>Delete free writing</button> : null}
          </div>
        </footer>
      </article>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        description="Your unsaved writing will be discarded, including the recovery copy on this device. Anything you already saved stays as it is."
        confirmLabel="Leave without saving"
        onConfirm={leaveWithoutSaving}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved writing?"
        description="The unsaved text and its recovery copy on this device will be discarded. Previously saved writing stays unchanged."
        confirmLabel="Discard unsaved changes"
        onConfirm={discardUnsaved}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete saved free writing?"
        description="This permanently deletes the free-writing document for this reflection. Your blocks and saved generated journal are not deleted."
        confirmLabel="Delete free writing"
        danger
        onConfirm={() => { void removeSavedWriting(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
