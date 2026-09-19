import { useEffect, useState } from "react";

import { getPromptPreferences, savePromptPreferences, type PromptPreferences } from "../reflections";
import { trackUsability } from "../lib/usability";

export function PromptPreferenceControl() {
  const [behavior, setBehavior] = useState<PromptPreferences["prompt_behavior"]>("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getPromptPreferences();
        if (!cancelled) setBehavior(value.prompt_behavior);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reflection defaults.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function update(next: PromptPreferences["prompt_behavior"]) {
    const previous = behavior;
    setBehavior(next);
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await savePromptPreferences(next);
      setBehavior(saved.prompt_behavior);
      setMessage("Saved. This will apply to your next new reflection.");
      void trackUsability("prompt_default_changed", null, {
        requirement_id: "R3",
        action: saved.prompt_behavior,
        success: true,
      });
    } catch (err) {
      setBehavior(previous);
      setError(err instanceof Error ? err.message : "Could not save reflection defaults.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="prompt-preference-card">
      <summary>Reflection defaults</summary>
      <div className="prompt-preference-body">
        <p>Choose what appears when you start a <em>new</em> reflection. Existing reflections are never changed.</p>
        <label>
          <span>Prompt behavior</span>
          <select
            value={behavior}
            disabled={loading || saving}
            onChange={(event) => { void update(event.target.value as PromptPreferences["prompt_behavior"]); }}
          >
            <option value="manual">Start with no blocks — I choose prompts myself</option>
            <option value="starter">Always add the same 3 starter prompts</option>
          </select>
        </label>
        <small>The starter set is: What happened? · How did you feel in the moment? · Why did this matter to you?</small>
        {message ? <p className="success-note" aria-live="polite">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
