import { useEffect, useMemo, useState } from "react";

import { clearRecovery, readRecovery, recoveryKey, writeRecovery } from "../lib/draftRecovery";
import { getEvaluationSessionId, trackUsability } from "../lib/usability";

import {
  getAIConfig,
  getSavedGeneratedEntry,
  requestJournalDraft,
  saveGeneratedEntry,
  type AIConfig,
  type JournalDraft,
  type JournalParagraph,
  type JournalSourceSnapshot,
  type SavedBlock,
  type SavedConnection,
  type SavedGeneratedEntry,
} from "../reflections";

type JournalGeneratorPanelProps = {
  reflectionId: string;
  quickThought: string;
  blocks: SavedBlock[];
  connections: SavedConnection[];
  onPlaySound?: () => void;
  onOpenJournal?: () => void;
};

type Stage = "closed" | "select" | "confirm" | "generating" | "draft";

type InspectedSource = {
  paragraphId: string;
  source: JournalSourceSnapshot;
};

type GeneratedDraftRecovery = {
  draft: JournalDraft;
  sourcesByParagraphId: Record<string, JournalSourceSnapshot[]>;
};

const fallbackConfig: AIConfig = {
  enabled: false,
  model: "",
  suggestionModel: "",
  journalModel: "",
  disclosure: "Gemini is unavailable.",
  freeTierNotice: "",
  keySource: "",
  envFileFound: false,
};

function shortAnswer(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned;
}

function formatSavedTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function sourcesForParagraph(
  paragraph: JournalParagraph,
  sourceById: Map<string, SavedBlock>,
  quickThought: string,
): JournalSourceSnapshot[] {
  const sources: JournalSourceSnapshot[] = [];

  if (paragraph.uses_quick_thought) {
    sources.push({
      kind: "quick_thought",
      block_id: null,
      category: null,
      question: null,
      text: quickThought,
    });
  }

  for (const sourceId of paragraph.source_block_ids) {
    const block = sourceById.get(sourceId);
    if (!block) continue;
    sources.push({
      kind: "block",
      block_id: block.id,
      category: block.category,
      question: block.question,
      text: block.answer,
    });
  }

  return sources;
}

function sourceMapFromSavedEntry(entry: SavedGeneratedEntry) {
  return Object.fromEntries(
    entry.paragraphs.map((paragraph) => [paragraph.id, paragraph.sources]),
  ) as Record<string, JournalSourceSnapshot[]>;
}

function preparedEvaluationDraft(
  selectedBlocks: SavedBlock[],
  includeQuickThought: boolean,
): JournalDraft {
  const paragraphs: JournalParagraph[] = selectedBlocks.map((block, index) => ({
    id: `evaluation-${index + 1}-${block.id}`,
    text: index === 0
      ? `${block.answer.trim()} I clearly handled this perfectly and now know exactly what I should do next.`
      : block.answer.trim(),
    source_block_ids: [block.id],
    uses_quick_thought: includeQuickThought && index === 0,
  }));
  return {
    model: "prepared-evaluation-fixture",
    title: "Prepared evaluation reflection",
    paragraphs,
  };
}

export function JournalGeneratorPanel({
  reflectionId,
  quickThought,
  blocks,
  connections,
  onPlaySound,
  onOpenJournal,
}: JournalGeneratorPanelProps) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [stage, setStage] = useState<Stage>("closed");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeQuickThought, setIncludeQuickThought] = useState(true);
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  const [savedEntry, setSavedEntry] = useState<SavedGeneratedEntry | null>(null);
  const [sourcesByParagraphId, setSourcesByParagraphId] = useState<Record<string, JournalSourceSnapshot[]>>({});
  const [inspectedSource, setInspectedSource] = useState<InspectedSource | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState<GeneratedDraftRecovery | null>(null);
  const generationRecoveryKey = useMemo(() => recoveryKey("generated-draft", reflectionId), [reflectionId]);
  const evaluationMode = Boolean(getEvaluationSessionId());

  const answeredBlocks = useMemo(
    () => blocks.filter((block) => block.answer.trim()),
    [blocks],
  );

  const selectedBlocks = useMemo(
    () => answeredBlocks.filter((block) => selectedIds.has(block.id)),
    [answeredBlocks, selectedIds],
  );

  const selectedConnections = useMemo(() => {
    const ids = new Set(selectedBlocks.map((block) => block.id));
    return connections.filter(
      (connection) => ids.has(connection.source_block_id) && ids.has(connection.target_block_id),
    );
  }, [connections, selectedBlocks]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getAIConfig().catch(() => fallbackConfig),
      getSavedGeneratedEntry(reflectionId).catch(() => null),
    ]).then(([nextConfig, nextSavedEntry]) => {
      if (cancelled) return;
      setConfig(nextConfig);
      setSavedEntry(nextSavedEntry);
      const recovered = readRecovery<GeneratedDraftRecovery>(generationRecoveryKey);
      setRecoveryAvailable(recovered?.value ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [generationRecoveryKey, reflectionId]);

  useEffect(() => {
    if (stage !== "draft" || !draftDirty || !draft) return;
    const timeout = window.setTimeout(() => {
      writeRecovery<GeneratedDraftRecovery>(generationRecoveryKey, { draft, sourcesByParagraphId });
      setRecoveryAvailable({ draft, sourcesByParagraphId });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [draft, draftDirty, generationRecoveryKey, sourcesByParagraphId, stage]);

  function startSelection() {
    setSelectedIds(new Set(answeredBlocks.map((block) => block.id)));
    setIncludeQuickThought(true);
    setError(null);
    setSaveMessage(null);
    setInspectedSource(null);
    setStage("select");
  }

  function openSavedEntry() {
    if (!savedEntry) return;
    setDraft({
      model: savedEntry.model,
      title: savedEntry.title,
      paragraphs: savedEntry.paragraphs.map(({ sources: _sources, ...paragraph }) => paragraph),
    });
    setSourcesByParagraphId(sourceMapFromSavedEntry(savedEntry));
    setDraftDirty(false);
    setSaveMessage(`Saved ${formatSavedTime(savedEntry.updated_at)}`);
    setInspectedSource(null);
    setError(null);
    setStage("draft");
  }

  function recoverGeneratedDraft() {
    if (!recoveryAvailable) return;
    setDraft(recoveryAvailable.draft);
    setSourcesByParagraphId(recoveryAvailable.sourcesByParagraphId);
    setDraftDirty(true);
    setSaveMessage("Recovered unsaved draft from this device");
    setStage("draft");
    void trackUsability("draft_recovered", reflectionId, { action: "generated_journal" });
  }

  function discardGeneratedDraft() {
    clearRecovery(generationRecoveryKey);
    setRecoveryAvailable(null);
    setDraft(null);
    setSourcesByParagraphId({});
    setDraftDirty(false);
    setSaveMessage(null);
    setInspectedSource(null);
    setStage("closed");
    void trackUsability("discard_unsaved", reflectionId, { action: "generated_journal" });
  }

  function toggleBlock(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reviewPrivacy() {
    void trackUsability("generation_privacy_notice_shown", reflectionId, {
      requirement_id: "R10",
      selected_count: selectedBlocks.length,
      unselected_count: answeredBlocks.length - selectedBlocks.length,
      source_count: selectedBlocks.length,
    });
    setStage("confirm");
  }

  async function generate() {
    if (selectedBlocks.length === 0) {
      setError("Select at least one answered block.");
      setStage("select");
      return;
    }

    try {
      setStage("generating");
      setError(null);
      void trackUsability("journal_generation_started", reflectionId, {
        requirement_id: "R4",
        source_count: selectedBlocks.length,
        selected_count: selectedBlocks.length,
        unselected_count: answeredBlocks.length - selectedBlocks.length,
      });
      const next = evaluationMode
        ? preparedEvaluationDraft(selectedBlocks, includeQuickThought)
        : await requestJournalDraft(
            reflectionId,
            selectedBlocks,
            selectedConnections,
            includeQuickThought,
          );

      const sourceById = new Map(selectedBlocks.map((block) => [block.id, block]));
      const nextSources = Object.fromEntries(
        next.paragraphs.map((paragraph) => [
          paragraph.id,
          sourcesForParagraph(paragraph, sourceById, quickThought),
        ]),
      ) as Record<string, JournalSourceSnapshot[]>;

      setDraft(next);
      setSourcesByParagraphId(nextSources);
      setDraftDirty(true);
      setSaveMessage(null);
      setInspectedSource(null);
      setStage("draft");
      setRecoveryAvailable({ draft: next, sourcesByParagraphId: nextSources });
      void trackUsability("journal_generated", reflectionId, { source_count: selectedBlocks.length, success: true });
      onPlaySound?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the journal draft.");
      setStage("confirm");
    }
  }

  function markDraftChanged() {
    setDraftDirty(true);
    setSaveMessage(null);
  }

  function updateParagraph(index: number, text: string) {
    setDraft((current) => current
      ? {
          ...current,
          paragraphs: current.paragraphs.map((paragraph, paragraphIndex) => (
            paragraphIndex === index ? { ...paragraph, text } : paragraph
          )),
        }
      : current);
    markDraftChanged();
    void trackUsability("journal_paragraph_edited", reflectionId, { requirement_id: "R12", success: true });
  }

  function updateTitle(title: string) {
    setDraft((current) => current ? { ...current, title } : current);
    markDraftChanged();
  }

  async function saveEntry() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("Give the journal entry a title before saving.");
      return;
    }
    if (draft.paragraphs.some((paragraph) => !paragraph.text.trim())) {
      setError("Remove empty paragraphs or write something in them before saving.");
      return;
    }

    try {
      setSavingEntry(true);
      setError(null);
      const saved = await saveGeneratedEntry(reflectionId, draft, sourcesByParagraphId);
      setSavedEntry(saved);
      setDraft({
        model: saved.model,
        title: saved.title,
        paragraphs: saved.paragraphs.map(({ sources: _sources, ...paragraph }) => paragraph),
      });
      setSourcesByParagraphId(sourceMapFromSavedEntry(saved));
      setDraftDirty(false);
      clearRecovery(generationRecoveryKey);
      setRecoveryAvailable(null);
      setSaveMessage(`Saved ${formatSavedTime(saved.updated_at)}`);
      void trackUsability("journal_saved", reflectionId, { source_count: saved.paragraphs.reduce((sum, item) => sum + item.sources.length, 0) });
      onPlaySound?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the generated entry.");
    } finally {
      setSavingEntry(false);
    }
  }

  if (!config) return null;

  if (stage === "closed") {
    return (
      <section className="journal-generator collapsed milestone-five" aria-label="Generated journal entry">
        <div>
          <p className="eyebrow">Journal draft</p>
          <h2>Turn selected answers into an editable entry.</h2>
          <p>Generation stays optional. A generated entry is only saved when you explicitly choose Save entry.</p>
          {savedEntry ? (
            <div className="workspace-saved-journal-card">
              <div>
                <span className="journal-ready-badge">Saved journal</span>
                <strong>{savedEntry.title}</strong>
                <small>Updated {formatSavedTime(savedEntry.updated_at)}</small>
              </div>
              <div className="workspace-journal-actions">
                {onOpenJournal ? (
                  <button type="button" className="primary-button" onClick={onOpenJournal}>
                    Open journal →
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={openSavedEntry}>
                    Open saved journal →
                  </button>
                )}
                <button type="button" className="secondary-button" onClick={openSavedEntry}>
                  Edit here
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={savedEntry ? "secondary-button generate-another-button" : "primary-button"}
          onClick={startSelection}
          disabled={(!config.enabled && !evaluationMode) || answeredBlocks.length === 0}
        >
          ✦ {savedEntry ? "Generate another draft" : "Generate journal entry"}
        </button>
        {recoveryAvailable ? (
          <button type="button" className="secondary-button recover-draft-button" onClick={recoverGeneratedDraft}>
            Recover unsaved draft
          </button>
        ) : null}
        {!config.enabled && !evaluationMode ? (
          <span className="journal-disabled-note">
            Gemini is not configured on the server. {config.envFileFound ? "Check GEMINI_API_KEY in the project .env." : "The project .env file was not found."}
          </span>
        ) : null}
        {answeredBlocks.length === 0 ? (
          <span className="journal-disabled-note">Answer at least one reflection block first.</span>
        ) : null}
      </section>
    );
  }

  if (stage === "select") {
    return (
      <section className="journal-generator" aria-label="Select journal sources">
        <div className="journal-generator-heading">
          <div>
            <p className="eyebrow">1 · Select sources</p>
            <h2>What may Gemini use?</h2>
            <p>Only checked material will be sent to the journal-generation endpoint.</p>
          </div>
          <button type="button" className="micro-button" onClick={() => setStage("closed")}>Close</button>
        </div>

        <label className="journal-source-row quick-source">
          <input
            type="checkbox"
            checked={includeQuickThought}
            onChange={(event) => setIncludeQuickThought(event.target.checked)}
          />
          <span>
            <strong>Quick thought</strong>
            <small>{quickThought}</small>
          </span>
        </label>

        <div className="journal-source-list">
          {answeredBlocks.map((block) => (
            <label className="journal-source-row" key={block.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(block.id)}
                onChange={() => toggleBlock(block.id)}
              />
              <span>
                <strong>{block.question}</strong>
                <small>{shortAnswer(block.answer)}</small>
              </span>
            </label>
          ))}
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}

        <div className="journal-generator-actions">
          <span>{selectedBlocks.length} answered block{selectedBlocks.length === 1 ? "" : "s"} selected</span>
          <button
            type="button"
            className="primary-button"
            disabled={selectedBlocks.length === 0}
            onClick={reviewPrivacy}
          >
            Review privacy →
          </button>
        </div>
      </section>
    );
  }

  if (stage === "confirm" || stage === "generating") {
    const generating = stage === "generating";
    return (
      <section className="journal-generator privacy-confirmation" aria-label="AI privacy confirmation">
        <div className="journal-generator-heading">
          <div>
            <p className="eyebrow">2 · Privacy confirmation</p>
            <h2>{evaluationMode ? "Review the planned processing boundary." : "Confirm what leaves ReflectBlocks."}</h2>
          </div>
        </div>

        <div className="privacy-summary-grid">
          <div>
            <strong>{evaluationMode ? "Would be sent to Gemini in normal use" : "Will be sent to Gemini"}</strong>
            <ul>
              {includeQuickThought ? <li>Your quick thought</li> : null}
              <li>{selectedBlocks.length} selected block answer{selectedBlocks.length === 1 ? "" : "s"}</li>
              <li>{selectedConnections.length} relationship{selectedConnections.length === 1 ? "" : "s"} between selected blocks</li>
            </ul>
          </div>
          <div>
            <strong>Will not be sent</strong>
            <ul>
              <li>Unchecked blocks</li>
              <li>Other saved reflections</li>
              <li>Your Google profile or reflection history</li>
            </ul>
          </div>
        </div>

        <div className="selected-source-preview">
          {selectedBlocks.map((block) => <span key={block.id}>{block.question}</span>)}
        </div>

        {evaluationMode ? (
          <p className="provider-notice evaluation-fixture-note">
            Study mode uses prepared fictional output in this browser. No selected reflection text is sent to Gemini during this evaluation session. The notice above shows the production data-flow participants are being asked to understand.
          </p>
        ) : <p className="provider-notice">{config.freeTierNotice}</p>}
        <p className="journal-model-line">Journal model: <strong>{evaluationMode ? "Prepared study fixture" : (config.journalModel || config.model)}</strong></p>
        {error ? <p className="error" role="alert">{error}</p> : null}

        <div className="journal-generator-actions">
          <button type="button" className="secondary-button" onClick={() => setStage("select")} disabled={generating}>← Change selection</button>
          <button type="button" className="primary-button" onClick={generate} disabled={generating}>
            {generating ? "Organizing…" : evaluationMode ? "Confirm & show prepared draft" : "Confirm & generate"}
          </button>
        </div>
      </section>
    );
  }

  if (!draft) return null;

  const inspectedParagraph = inspectedSource
    ? draft.paragraphs.find((paragraph) => paragraph.id === inspectedSource.paragraphId) ?? null
    : null;

  return (
    <section className="journal-generator generated-draft milestone-five" aria-label="Generated journal draft">
      <div className="journal-generator-heading">
        <div>
          <p className="eyebrow">3 · Editable draft</p>
          <h2>Your organized journal entry</h2>
          <p>Edit any wording before saving. Click a source chip to inspect the exact material behind that paragraph.</p>
        </div>
        <div className="draft-heading-actions">
          <span className="draft-model-badge">{draft.model}</span>
          <button type="button" className="micro-button" onClick={() => setStage("closed")}>Close</button>
        </div>
      </div>

      <div className="draft-save-state" aria-live="polite">
        <span className={draftDirty ? "unsaved" : "saved"}>
          {saveMessage ?? (draftDirty ? "Generated entry not saved" : "Saved generated entry")}
        </span>
        <span>Saving this entry does not change or replace your reflection blocks.</span>
      </div>

      <label className="draft-title-field">
        <span>Title</span>
        <input value={draft.title} onChange={(event) => updateTitle(event.target.value)} />
      </label>

      <div className="draft-paragraph-list">
        {draft.paragraphs.map((paragraph, index) => {
          const paragraphSources = sourcesByParagraphId[paragraph.id] ?? [];
          return (
            <article className="draft-paragraph" key={paragraph.id || index}>
              <div className="draft-paragraph-heading">
                <span>Paragraph {index + 1}</span>
                <span>{paragraph.text.length} characters</span>
              </div>
              <textarea
                value={paragraph.text}
                rows={4}
                onChange={(event) => updateParagraph(index, event.target.value)}
                aria-label={`Journal paragraph ${index + 1}`}
              />
              <div className="draft-sources">
                <span className="source-label">Inspect sources</span>
                {paragraphSources.map((source, sourceIndex) => (
                  <button
                    type="button"
                    className={`source-chip ${source.kind === "quick_thought" ? "quick" : ""}`}
                    key={`${source.kind}-${source.block_id ?? "quick"}-${sourceIndex}`}
                    onClick={() => {
                      setInspectedSource({ paragraphId: paragraph.id, source });
                      void trackUsability("journal_source_inspected", reflectionId, { requirement_id: "R5", success: true });
                    }}
                  >
                    {source.kind === "quick_thought" ? "Quick thought" : source.question ?? source.block_id}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {inspectedSource && inspectedParagraph ? (
        <aside className="source-inspector" aria-label="Source inspection">
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
              {inspectedSource.source.kind === "block" && inspectedSource.source.category ? (
                <small>{inspectedSource.source.category}</small>
              ) : null}
              <p>{inspectedSource.source.text}</p>
            </div>
            <div className="source-inspector-arrow" aria-hidden="true">→</div>
            <div className="source-inspector-card generated">
              <span>Current generated passage</span>
              <p>{inspectedParagraph.text}</p>
            </div>
          </div>
          <p className="source-inspector-note">
            The source snapshot is preserved with the saved generated entry, so later edits to the journal do not erase where the passage came from.
          </p>
        </aside>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="journal-generator-actions m5-draft-actions">
        <div className="draft-secondary-actions">
          <button type="button" className="secondary-button" onClick={startSelection}>Choose different sources</button>
          <button type="button" className="secondary-button" onClick={() => setStage("confirm")}>Regenerate</button>
          {draftDirty ? <button type="button" className="secondary-button" onClick={discardGeneratedDraft}>Save nothing</button> : null}
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={saveEntry}
          disabled={savingEntry || !draftDirty}
        >
          {savingEntry ? "Saving entry…" : draftDirty ? "Save generated entry" : "Entry saved"}
        </button>
      </div>
    </section>
  );
}
