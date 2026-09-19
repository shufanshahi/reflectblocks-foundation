import { useEffect, useState } from "react";

import { createReflection, type Reflection } from "../reflections";
import { finishQuickCaptureTimer, getGuidedEvaluationTaskId, startQuickCaptureTimer, trackUsability } from "../lib/usability";

type QuickThoughtProps = {
  onCancel: () => void;
  onSaved: (reflection: Reflection) => void;
};

export function QuickThought({ onCancel, onSaved }: QuickThoughtProps) {
  const [thought, setThought] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startQuickCaptureTimer();
    const guidedTaskId = getGuidedEvaluationTaskId();
    void trackUsability(
      "quick_capture_screen_shown",
      null,
      guidedTaskId && guidedTaskId !== "quick-capture" ? {} : { requirement_id: "R1" },
    );
  }, []);

  async function handleSave() {
    const cleanThought = thought.trim();
    if (!cleanThought) {
      setError("Write something before saving.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const reflection = await createReflection(cleanThought);
      const durationMs = finishQuickCaptureTimer();
      const guidedTaskId = getGuidedEvaluationTaskId();
      void trackUsability("quick_capture_timed", reflection.id, {
        ...(guidedTaskId && guidedTaskId !== "quick-capture" ? {} : { requirement_id: "R1" }),
        char_count: cleanThought.length,
        duration_ms: durationMs,
        success: true,
      });
      onSaved(reflection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your reflection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quick-thought-page">
      <button className="back-button" type="button" onClick={onCancel}>← Back</button>

      <div className="quick-thought-card">
        <p className="eyebrow">Quick thought</p>
        <h1>What's on your mind?</h1>
        <p className="hero-copy">One sentence is enough. You can add structure afterwards.</p>

        <label className="thought-label" htmlFor="quick-thought">Your thought</label>
        <textarea
          id="quick-thought"
          className="thought-input"
          value={thought}
          onChange={(event) => setThought(event.target.value)}
          placeholder="I felt nervous during today's presentation..."
          autoFocus
          rows={7}
          maxLength={5000}
        />

        <div className="thought-meta"><span>{thought.length} / 5000</span></div>
        {error ? <p className="error" role="alert">{error}</p> : null}

        <div className="thought-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="primary-button" type="button" onClick={handleSave} disabled={saving || !thought.trim()}>
            {saving ? "Saving…" : "Save & explore blocks"}
          </button>
        </div>
      </div>
    </section>
  );
}
