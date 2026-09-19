import { recordUsabilityEvent } from "../reflections";

const SESSION_KEY = "reflectblocks:evaluation-session";
const QUICK_CAPTURE_TIMER_KEY = "reflectblocks:evaluation-quick-capture-start";
const GUIDED_TASK_KEY = "reflectblocks:evaluation-guided-task";
export const USABILITY_EVENT_NAME = "reflectblocks:usability-event";

export type LocalUsabilityEvent = {
  sessionId: string;
  eventType: string;
  reflectionId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: number;
};

export function getEvaluationSessionId(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setEvaluationSessionId(sessionId: string | null) {
  try {
    if (sessionId) {
      window.localStorage.setItem(SESSION_KEY, sessionId);
      return;
    }
    window.localStorage.removeItem(SESSION_KEY);
    // Ending a study session must also clear transient guided-task state so
    // normal product events cannot be tagged as belonging to an old task.
    window.sessionStorage.removeItem(GUIDED_TASK_KEY);
    window.sessionStorage.removeItem(QUICK_CAPTURE_TIMER_KEY);
  } catch {
    // no-op
  }
}

export function getGuidedEvaluationTaskId(): string | null {
  try {
    return window.sessionStorage.getItem(GUIDED_TASK_KEY);
  } catch {
    return null;
  }
}

export function setGuidedEvaluationTaskId(taskId: string | null) {
  try {
    if (taskId) window.sessionStorage.setItem(GUIDED_TASK_KEY, taskId);
    else window.sessionStorage.removeItem(GUIDED_TASK_KEY);
  } catch {
    // no-op
  }
}

export function clearQuickCaptureTimer() {
  try {
    window.sessionStorage.removeItem(QUICK_CAPTURE_TIMER_KEY);
  } catch {
    // no-op
  }
}

export function clearGuidedEvaluationRuntime() {
  setGuidedEvaluationTaskId(null);
  clearQuickCaptureTimer();
}

export function startQuickCaptureTimer() {
  if (!getEvaluationSessionId()) return;
  try {
    window.sessionStorage.setItem(QUICK_CAPTURE_TIMER_KEY, String(Date.now()));
  } catch {
    // Timing support must never block the writing flow.
  }
}

export function finishQuickCaptureTimer(): number | null {
  if (!getEvaluationSessionId()) return null;
  try {
    const raw = window.sessionStorage.getItem(QUICK_CAPTURE_TIMER_KEY);
    window.sessionStorage.removeItem(QUICK_CAPTURE_TIMER_KEY);
    if (!raw) return null;
    const startedAt = Number(raw);
    if (!Number.isFinite(startedAt)) return null;
    return Math.max(0, Date.now() - startedAt);
  } catch {
    return null;
  }
}

export async function trackUsability(
  eventType: string,
  reflectionId: string | null = null,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const sessionId = getEvaluationSessionId();
  if (!sessionId) return;

  const taskId = getGuidedEvaluationTaskId();
  // While a guided participant task is running, that task is authoritative.
  // Components may have legacy/general task_id values (for example
  // "quick-thought"); allowing those to win prevents the evaluation controller
  // from seeing the event and was the reason Task 1 could save repeatedly
  // without advancing.
  const enrichedMetadata = taskId
    ? { ...metadata, task_id: taskId }
    : metadata;

  // The guided evaluation controller listens locally to the exact same events
  // that are persisted to SQLite. Dispatching never contains journal/block text.
  const detail: LocalUsabilityEvent = {
    sessionId,
    eventType,
    reflectionId,
    metadata: enrichedMetadata,
    occurredAt: Date.now(),
  };
  try {
    window.dispatchEvent(new CustomEvent<LocalUsabilityEvent>(USABILITY_EVENT_NAME, { detail }));
  } catch {
    // Local observation must never interfere with the writing flow.
  }

  try {
    await recordUsabilityEvent(sessionId, eventType, reflectionId, enrichedMetadata);
  } catch {
    // Instrumentation must never interfere with the product task.
  }
}
