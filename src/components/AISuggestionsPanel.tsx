import { useEffect, useMemo, useState } from "react";

import { BLOCK_CATEGORIES, type RelationType } from "../lib/blockLibrary";
import { getEvaluationSessionId, trackUsability } from "../lib/usability";
import {
  getAIConfig,
  requestAISuggestions,
  type AIConfig,
  type AISuggestion,
  type SavedBlock,
  type SavedConnection,
} from "../reflections";

type AISuggestionsPanelProps = {
  reflectionId: string;
  blocks: SavedBlock[];
  connections: SavedConnection[];
  onAddSuggestion: (suggestion: AISuggestion) => void;
  onPlaySound?: () => void;
};

const unavailableConfig: AIConfig = {
  enabled: false,
  model: "",
  suggestionModel: "",
  journalModel: "",
  disclosure: "Gemini is unavailable.",
  freeTierNotice: "",
  keySource: "",
  envFileFound: false,
};

export function AISuggestionsPanel({
  reflectionId,
  blocks,
  connections,
  onAddSuggestion,
  onPlaySound,
}: AISuggestionsPanelProps) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answeredCount = useMemo(() => blocks.filter((block) => block.answer.trim()).length, [blocks]);
  const evaluationMode = Boolean(getEvaluationSessionId());

  useEffect(() => {
    if (evaluationMode) {
      setConfig(unavailableConfig);
      return;
    }
    let cancelled = false;
    getAIConfig()
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {
        if (!cancelled) setConfig(unavailableConfig);
      });
    return () => {
      cancelled = true;
    };
  }, [evaluationMode]);

  async function generate() {
    try {
      setLoading(true);
      setError(null);
      const next = await requestAISuggestions(reflectionId, blocks, connections);
      setSuggestions(next);
      setConfirming(false);
      onPlaySound?.();
      void trackUsability("suggestions_requested", reflectionId, { requirement_id: "R16", success: true, source_count: next.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get AI suggestions.");
    } finally {
      setLoading(false);
    }
  }

  if (evaluationMode) {
    return (
      <section className="ai-suggestion-panel disabled" aria-label="AI suggestions disabled during evaluation">
        <div className="ai-panel-heading">
          <span className="ai-spark">✦</span>
          <div>
            <strong>Gemini suggestions paused in study mode</strong>
            <span>Use the fixed library or a custom block during the Table 8 walkthrough. Participant writing is not sent to Gemini while the evaluation session is active.</span>
          </div>
        </div>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="ai-suggestion-panel disabled" aria-label="AI suggestions">
        <div className="ai-panel-heading">
          <span className="ai-spark">✦</span>
          <div>
            <strong>Gemini suggestions</strong>
            <span>Checking server configuration…</span>
          </div>
        </div>
      </section>
    );
  }

  if (!config.enabled) {
    const message = config.envFileFound
      ? "The project .env file was found, but GEMINI_API_KEY / GOOGLE_API_KEY is missing or blank."
      : "No project-root .env file was found by FastAPI.";
    return (
      <section className="ai-suggestion-panel disabled" aria-label="AI suggestions">
        <div className="ai-panel-heading">
          <span className="ai-spark">✦</span>
          <div>
            <strong>Gemini suggestions</strong>
            <span>{message}</span>
            <span className="ai-config-hint">Put the key in <code>reflectblocks/.env</code>, not <code>backend/.env</code>, then refresh. A backend restart is still recommended.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ai-suggestion-panel" aria-label="AI suggestions">
      <div className="ai-panel-heading">
        <span className="ai-spark">✦</span>
        <div>
          <strong>Need another angle?</strong>
          <span>Gemini can suggest optional next questions from this reflection.</span>
          <span className="ai-model-note">{config.suggestionModel || config.model}</span>
        </div>
      </div>

      {!confirming && suggestions.length === 0 ? (
        <button type="button" className="ai-suggest-button" onClick={() => setConfirming(true)} disabled={loading}>
          ✦ Suggest next blocks
        </button>
      ) : null}

      {confirming ? (
        <div className="ai-consent-box">
          <strong>Before sending</strong>
          <p>{config.disclosure}</p>
          <p className="ai-context-count">
            Current workspace: {blocks.length} blocks · {answeredCount} answered · {connections.length} links
          </p>
          <div className="ai-consent-actions">
            <button type="button" className="micro-button" onClick={() => setConfirming(false)} disabled={loading}>Cancel</button>
            <button type="button" className="thread-button" onClick={generate} disabled={loading}>
              {loading ? "Thinking…" : "Send current reflection"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="error ai-error" role="alert">{error}</p> : null}

      {suggestions.length > 0 ? (
        <div className="ai-suggestion-list">
          <div className="ai-results-heading">
            <strong>Gemini ideas</strong>
            <button
              type="button"
              className="micro-button"
              onClick={() => {
                void trackUsability("suggestion_rejected", reflectionId, { requirement_id: "R16", success: true, source_count: suggestions.length });
                setConfirming(true);
              }}
            >
              Refresh
            </button>
          </div>
          {suggestions.map((suggestion, index) => {
            const category = BLOCK_CATEGORIES.find((item) => item.id === suggestion.category) ?? BLOCK_CATEGORIES[0];
            return (
              <article className="ai-suggestion-card" key={`${suggestion.question}-${index}`}>
                <div className="ai-suggestion-category" style={{ color: category.color }}>
                  {category.icon} {category.shortLabel}
                </div>
                <strong>{suggestion.question}</strong>
                <p>{suggestion.why}</p>
                <button
                  type="button"
                  className="add-ai-block-button"
                  onClick={() => {
                    void trackUsability("suggestion_accepted", reflectionId, { requirement_id: "R16", success: true, category: suggestion.category });
                    onAddSuggestion({
                      ...suggestion,
                      relation_type: suggestion.relation_type as RelationType,
                    });
                  }}
                >
                  + Add to canvas
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
