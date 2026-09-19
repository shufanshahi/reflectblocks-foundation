import { useEffect, useMemo, useState } from "react";

import {
  completeEvaluationSession,
  getAutomatedEvaluationRun,
  getAutomatedEvaluationRuns,
  getEvaluationExport,
  getEvaluationProtocolState,
  runAutomatedEvaluation,
  saveEvaluationGovernanceReview,
  saveEvaluationRequirementCheck,
  startEvaluationSession,
  type AutomatedEvaluationRun,
  type AutomatedEvaluationRunSummary,
  type EvaluationGovernanceReview,
  type RequirementCheckStatus,
} from "../reflections";
import { getEvaluationSessionId, setEvaluationSessionId, trackUsability } from "../lib/usability";

const SUS_STATEMENTS = [
  "I think that I would like to use ReflectBlocks frequently.",
  "I found ReflectBlocks unnecessarily complex.",
  "I thought ReflectBlocks was easy to use.",
  "I think that I would need technical support to use ReflectBlocks.",
  "I found the functions in ReflectBlocks were well integrated.",
  "I thought there was too much inconsistency in ReflectBlocks.",
  "I imagine that most people would learn to use ReflectBlocks very quickly.",
  "I found ReflectBlocks very cumbersome to use.",
  "I felt very confident using ReflectBlocks.",
  "I needed to learn a lot before I could get going with ReflectBlocks.",
];

type EvidenceField = {
  key: string;
  label: string;
  type?: "boolean" | "number";
  suffix?: string;
};

type RequirementProtocol = {
  id: string;
  title: string;
  method: string;
  procedure: string;
  decision: string;
  fields: EvidenceField[];
};

const REQUIREMENTS: RequirementProtocol[] = [
  {
    id: "R1",
    title: "Fast one-line capture",
    method: "Timed capture task; retrospective explanation immediately afterward.",
    procedure: "Open New reflection. Do not use concurrent think-aloud during the timed interval. Timing starts when the quick-thought screen appears and is recorded automatically when the thought saves.",
    decision: "Revise if fewer than 7/8 save within 5 seconds, or if anyone cannot locate the basic capture action without help.",
    fields: [
      { key: "completed", label: "Saved the thought" },
      { key: "without_help", label: "Located and used capture without moderator help" },
      { key: "duration_ms", label: "Capture time", type: "number", suffix: "ms" },
      { key: "hesitation_count", label: "Hesitations observed", type: "number" },
      { key: "error_count", label: "Errors / accidental navigation", type: "number" },
      { key: "help_count", label: "Moderator help instances", type: "number" },
    ],
  },
  {
    id: "R2",
    title: "Dismiss an irrelevant prompt directly",
    method: "Walkthrough task: dismiss a block without leaving the entry screen.",
    procedure: "Add a deliberately irrelevant prompt for the fictional scenario, then ask the participant to continue naturally. Do not tell them which control to use.",
    decision: "Revise if a participant believes a prompt is mandatory or cannot dismiss it directly.",
    fields: [
      { key: "completed", label: "Dismissed the irrelevant block" },
      { key: "without_help", label: "Did so without moderator instruction" },
      { key: "understood", label: "Understood prompts are optional" },
    ],
  },
  {
    id: "R3",
    title: "Persistent per-writer prompt default",
    method: "Two-session walkthrough checking that the default persists.",
    procedure: "On Home, open Reflection defaults and choose the 3 starter prompts. Create a new reflection, then later create a second new reflection. Before the second entry opens, ask what prompts they expect.",
    decision: "Keep this provisional unless at least two participants identify a concrete reason to use it; when used, participants should understand why it persists across entries.",
    fields: [
      { key: "second_session_checked", label: "Second new reflection was tested" },
      { key: "persisted", label: "Chosen default persisted correctly" },
      { key: "predicted_correctly", label: "Participant predicted the persisted behavior" },
      { key: "understood", label: "Participant understood why it persisted" },
    ],
  },
  {
    id: "R4",
    title: "Generation only after explicit request",
    method: "Walkthrough: confirm no draft appears before the explicit organize/generate action.",
    procedure: "Fill several blocks, pause before requesting generation, and ask whether anything has been generated yet and what they expect will happen next.",
    decision: "A belief that generation happens automatically is a critical boundary failure and triggers revision.",
    fields: [
      { key: "no_auto_generation", label: "No draft appeared before explicit generation" },
      { key: "predicted_correctly", label: "Participant correctly predicted when generation occurs" },
      { key: "critical_misunderstanding", label: "Critical misunderstanding occurred" },
    ],
  },
  {
    id: "R5",
    title: "Source transparency",
    method: "Comprehension task: identify the source of a generated passage.",
    procedure: "Open a source chip in the prepared evaluation draft. Ask which block contributed to that passage and which wording is writer-provided versus system-introduced.",
    decision: "Revise if fewer than 7/8 can identify the source and distinguish writer material from system-introduced wording without moderator instruction.",
    fields: [
      { key: "source_identified", label: "Correctly identified the source block" },
      { key: "writer_vs_system_distinguished", label: "Distinguished writer material from system-introduced wording" },
      { key: "without_help", label: "Completed without moderator instruction" },
    ],
  },
  {
    id: "R6",
    title: "Complete a reflection with blank writing only",
    method: "Dedicated blank-writing walkthrough from the same Home entry point.",
    procedure: "From Home choose Write freely, enter neutral fictional content, save it, and do not invoke generation at any point.",
    decision: "Revise the blank-writing path if participants cannot complete and retain an entry without generation.",
    fields: [
      { key: "blank_completed", label: "Completed and saved blank writing" },
      { key: "without_help", label: "Completed without moderator instruction" },
      { key: "no_auto_generation", label: "No AI generation was invoked" },
    ],
  },
  {
    id: "R7",
    title: "Only selected material is processed",
    method: "Explicit block-selection task plus data-flow notice review and technical verification.",
    procedure: "Answer multiple blocks, uncheck at least one, review the processing notice, and ask which material would be processed. The backend test verifies the journal endpoint receives only explicitly selected blocks.",
    decision: "Revise if anyone believes unselected or historical material will be processed. Technical verification must also pass.",
    fields: [
      { key: "selected_only_understood", label: "Participant understood only selected sources are processed" },
      { key: "predicted_correctly", label: "Correctly identified selected vs. unselected material" },
      { key: "technical_check_passed", label: "Selected-only backend test passed" },
      { key: "critical_misunderstanding", label: "Critical data-flow misunderstanding occurred" },
    ],
  },
  {
    id: "R8",
    title: "Independent deletion with confirmation",
    method: "Walkthrough: delete one stored form while another remains; predict scope before confirming.",
    procedure: "Save blocks and a generated entry, then delete the generated entry while keeping blocks (or vice versa). Ask what will remain before confirmation and verify after the action.",
    decision: "Revise if fewer than 7/8 predict the resulting state, or immediately if anyone critically misunderstands an irreversible deletion.",
    fields: [
      { key: "delete_independent", label: "One stored form was deleted while the other remained" },
      { key: "predicted_correctly", label: "Participant correctly predicted deletion scope" },
      { key: "technical_check_passed", label: "Independent-deletion backend test passed" },
      { key: "critical_misunderstanding", label: "Critical deletion misunderstanding occurred" },
    ],
  },
  {
    id: "R9",
    title: "Familiar tap-and-type capture",
    method: "Inclusive quick-capture session, deliberately including participants aged 45+.",
    procedure: "Use the same R1 task. Observe whether capture and save require only visible typing/clicking controls, with no gesture or hidden menu. Record age group in session setup.",
    decision: "Treat scope as provisional; use barriers by age/experience to refine the interaction rather than dismissing them as participant error.",
    fields: [
      { key: "tap_type_only", label: "Only familiar visible tap/click-and-type actions were needed" },
      { key: "age_45_plus", label: "Participant is in the 45+ validation group" },
      { key: "without_help", label: "Capture action was located without help" },
    ],
  },
  {
    id: "R10",
    title: "Plain-language processing notice comprehension",
    method: "Comprehension check immediately before generation.",
    procedure: "At the privacy confirmation, ask in the participant's own words: has generation happened yet, what data is selected, who would process it, why, and what is excluded. In study mode no text is actually sent to Gemini.",
    decision: "A misunderstanding about external processing, selected data, processor, or purpose triggers revision before further implementation.",
    fields: [
      { key: "notice_explained", label: "Participant accurately explained the notice" },
      { key: "predicted_correctly", label: "Correctly predicted what confirmation would do" },
      { key: "critical_misunderstanding", label: "Critical processing/consent misunderstanding occurred" },
    ],
  },
  {
    id: "R11",
    title: "Privacy/domain expert prompt review",
    method: "Stakeholder review, not a writer-facing task.",
    procedure: "Use the Governance review panel below with a privacy or domain reviewer. Review prompt wording for clinical-sounding, harmful, coercive, or misleading phrasing and record unresolved flags.",
    decision: "Do not treat prompt wording as ready while harmful or clinical-sounding wording remains unresolved.",
    fields: [
      { key: "reviewer_completed", label: "Privacy/domain reviewer completed the review" },
      { key: "technical_check_passed", label: "No unresolved prompt wording issue remains" },
    ],
  },
  {
    id: "R12",
    title: "Generated wording remains editable and edits are saved",
    method: "Walkthrough: edit a generated sentence and confirm the saved copy matches.",
    procedure: "In the prepared draft, correct/remove the deliberately unsuitable wording, save the generated entry, reopen it, and compare the saved sentence.",
    decision: "Revise if fewer than 7/8 can correct/remove the unsuitable wording without moderator instruction or the saved copy does not reflect the edit.",
    fields: [
      { key: "completed", label: "Participant edited/removed the unsuitable wording" },
      { key: "edit_saved_matches", label: "Reopened saved copy reflected the edit" },
      { key: "without_help", label: "Completed without moderator instruction" },
    ],
  },
  {
    id: "R13",
    title: "Block customization before generation",
    method: "Walkthrough task: edit a question, add a custom block, and reorder blocks.",
    procedure: "Before generation, use the pencil control on a block, Add your own question in the palette, and Earlier/Later order controls. Ask whether these controls would be useful rather than assuming they must be retained.",
    decision: "Keep provisional unless at least two participants independently identify a concrete reason to use customization.",
    fields: [
      { key: "question_edited", label: "Edited a block question" },
      { key: "custom_block_added", label: "Added a custom block" },
      { key: "reordered", label: "Changed block generation order" },
      { key: "understood", label: "Participant could explain a reason to use customization" },
    ],
  },
  {
    id: "R14",
    title: "Distinct retention outcomes",
    method: "Save, save-blocks-only, export, save-nothing, and deletion walkthrough with resulting-state questions.",
    procedure: "Exercise Save blocks only, Save generated entry, export, and Save nothing on appropriate screens. After each, ask what still exists and whether anything left the application.",
    decision: "Revise if fewer than 7/8 correctly predict each retention outcome or if any critical irreversible-deletion misunderstanding occurs.",
    fields: [
      { key: "save_blocks_only_understood", label: "Understood Save blocks only" },
      { key: "save_entry_understood", label: "Understood Save generated entry" },
      { key: "export_understood", label: "Understood export creates a local copy" },
      { key: "save_nothing_understood", label: "Understood Save nothing discards only unsaved changes" },
      { key: "predicted_correctly", label: "Correctly predicted resulting state across retention choices" },
    ],
  },
];

const TASK_GROUPS = [
  ["Task 1 · Quick thought", "R1, R9", "Timed capture without concurrent think-aloud; record time, hesitation, errors, help, then ask for a brief retrospective explanation."],
  ["Task 2 · Optional structure + blank writing", "R2, R3, R6, R13", "Free-choice walkthrough with an irrelevant prompt, dedicated blank-writing subtask, customization, and a second new reflection when testing preference persistence."],
  ["Task 3 · Generation boundary", "R4, R7, R10", "Explicit source selection, prediction question before generation, and comprehension questions after the processing notice."],
  ["Task 4 · Source + editing", "R5, R12", "Prepared draft with deliberately unsuitable wording; test source identification, writer-vs-system distinction, editing, save, and reopen."],
  ["Task 5 · Retention + deletion", "R8, R14", "Save/export/save-nothing/delete walkthrough followed by questions about the resulting state after each choice."],
  ["Parallel governance review", "R7, R8, R10, R11", "Privacy/domain reviewer checks data flow, retention, processing notice, and prompt wording separately from participant tasks."],
] as const;

type CheckDraft = {
  status: RequirementCheckStatus;
  evidence: Record<string, string | number | boolean | null>;
  notes: string;
  saving?: boolean;
  saved?: boolean;
};

type GovernanceDraft = Omit<EvaluationGovernanceReview, "reviewed_at">;

function defaultChecks(): Record<string, CheckDraft> {
  return Object.fromEntries(REQUIREMENTS.map((item) => [item.id, { status: "not_tested", evidence: {}, notes: "" }]));
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function calculateSus(values: number[]) {
  if (values.length !== 10) return null;
  const total = values.reduce((sum, value, index) => {
    return sum + (index % 2 === 0 ? value - 1 : 5 - value);
  }, 0);
  return total * 2.5;
}

function triStateValue(value: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function parseTriState(value: string): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

type EvaluationPageProps = {
  onBack: () => void;
  onStartTasks: () => void;
};

export function EvaluationPage({ onBack, onStartTasks }: EvaluationPageProps) {
  const [sessionId, setSessionIdState] = useState<string | null>(() => getEvaluationSessionId());
  const [participantCode, setParticipantCode] = useState("");
  const [deviceType, setDeviceType] = useState("desktop");
  const [ageGroup, setAgeGroup] = useState("prefer_not_to_say");
  const [textEditingExperience, setTextEditingExperience] = useState("some");
  const [consented, setConsented] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckDraft>>(defaultChecks);
  const [governance, setGovernance] = useState<GovernanceDraft>({
    reviewer_role: "",
    data_flow_ok: null,
    retention_ok: null,
    processing_notice_ok: null,
    prompt_wording_ok: null,
    prompt_flags_count: 0,
    notes: "",
  });
  const [governanceSaving, setGovernanceSaving] = useState(false);
  const [governanceSaved, setGovernanceSaved] = useState(false);
  const [sus, setSus] = useState<number[]>(Array(10).fill(0));
  const [ease, setEase] = useState(0);
  const [control, setControl] = useState(0);
  const [privacy, setPrivacy] = useState(0);
  const [comments, setComments] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loadingProtocol, setLoadingProtocol] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [automatedRunning, setAutomatedRunning] = useState(false);
  const [automatedRun, setAutomatedRun] = useState<AutomatedEvaluationRun | null>(null);
  const [automatedHistory, setAutomatedHistory] = useState<AutomatedEvaluationRunSummary[]>([]);
  const [automatedHistoryLoading, setAutomatedHistoryLoading] = useState(false);

  const susScore = useMemo(() => calculateSus(sus), [sus]);
  const coveredCount = useMemo(
    () => Object.values(checks).filter((item) => item.status !== "not_tested").length,
    [checks],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadAutomatedHistory() {
      try {
        setAutomatedHistoryLoading(true);
        const runs = await getAutomatedEvaluationRuns(8);
        if (!cancelled) setAutomatedHistory(runs);
      } catch {
        // History is supplementary; a failure here should not block human study mode.
      } finally {
        if (!cancelled) setAutomatedHistoryLoading(false);
      }
    }
    void loadAutomatedHistory();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    async function loadProtocol() {
      try {
        setLoadingProtocol(true);
        const [state, exported] = await Promise.all([
          getEvaluationProtocolState(sessionId!),
          getEvaluationExport(sessionId!),
        ]);
        if (cancelled) return;
        const next = defaultChecks();
        for (const item of state.requirement_checks) {
          next[item.requirement_id] = {
            status: item.status,
            evidence: item.evidence,
            notes: item.notes,
            saved: true,
          };
        }
        const timed = [...exported.events].reverse().find((event) => event.event_type === "quick_capture_timed");
        if (timed && typeof timed.metadata.duration_ms === "number") {
          next.R1 = {
            ...next.R1,
            evidence: {
              ...next.R1.evidence,
              completed: true,
              duration_ms: timed.metadata.duration_ms,
            },
          };
        }
        if (["45_59", "60_plus"].includes(String(exported.session.age_group ?? ""))) {
          next.R9 = {
            ...next.R9,
            evidence: { ...next.R9.evidence, age_45_plus: true },
          };
        }
        setChecks(next);
        if (state.governance_review) {
          const { reviewed_at: _reviewedAt, ...review } = state.governance_review;
          setGovernance(review);
          setGovernanceSaved(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the evaluation protocol.");
      } finally {
        if (!cancelled) setLoadingProtocol(false);
      }
    }
    void loadProtocol();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function runAutomaticAudit() {
    try {
      setAutomatedRunning(true);
      setError(null);
      const result = await runAutomatedEvaluation();
      setAutomatedRun(result);
      setAutomatedHistory((current) => [
        {
          id: result.id,
          started_at: result.started_at,
          completed_at: result.completed_at,
          overall_status: result.overall_status,
          summary: result.summary,
        },
        ...current.filter((item) => item.id !== result.id),
      ].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the automated evaluation.");
    } finally {
      setAutomatedRunning(false);
    }
  }

  async function openAutomatedRun(runId: string) {
    try {
      setError(null);
      setAutomatedRun(await getAutomatedEvaluationRun(runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that automated run.");
    }
  }

  function exportAutomatedRun() {
    if (!automatedRun) return;
    downloadJson(`reflectblocks-automated-evaluation-${automatedRun.id}.json`, automatedRun);
  }

  async function start() {
    if (!participantCode.trim() || !consented) return;
    try {
      setStarting(true);
      setError(null);
      const result = await startEvaluationSession(
        participantCode,
        deviceType,
        ageGroup,
        textEditingExperience,
      );
      setEvaluationSessionId(result.session_id);
      setSessionIdState(result.session_id);
      setChecks(defaultChecks());
      void trackUsability("evaluation_started", null, { screen: "evaluation" });
      onStartTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start evaluation.");
    } finally {
      setStarting(false);
    }
  }

  function updateCheck(id: string, patch: Partial<CheckDraft>) {
    setChecks((current) => ({
      ...current,
      [id]: { ...current[id], ...patch, saved: false },
    }));
  }

  function updateEvidence(id: string, key: string, value: string | number | boolean | null) {
    setChecks((current) => ({
      ...current,
      [id]: {
        ...current[id],
        evidence: { ...current[id].evidence, [key]: value },
        saved: false,
      },
    }));
  }

  async function saveCheck(id: string) {
    if (!sessionId) return;
    const check = checks[id];
    try {
      setChecks((current) => ({ ...current, [id]: { ...current[id], saving: true } }));
      await saveEvaluationRequirementCheck(sessionId, id, check.status, check.evidence, check.notes);
      setChecks((current) => ({ ...current, [id]: { ...current[id], saving: false, saved: true } }));
      void trackUsability("evaluation_requirement_saved", null, { requirement_id: id, success: true });
    } catch (err) {
      setChecks((current) => ({ ...current, [id]: { ...current[id], saving: false } }));
      setError(err instanceof Error ? err.message : `Could not save ${id}.`);
    }
  }

  async function saveGovernance() {
    if (!sessionId || !governance.reviewer_role.trim()) {
      setError("Add the privacy/domain reviewer's role before saving the governance review.");
      return;
    }
    try {
      setGovernanceSaving(true);
      setError(null);
      await saveEvaluationGovernanceReview(sessionId, governance);
      setGovernanceSaved(true);
      void trackUsability("evaluation_governance_saved", null, { requirement_id: "R11", success: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save governance review.");
    } finally {
      setGovernanceSaving(false);
    }
  }

  async function submit() {
    if (!sessionId) return;
    if (sus.some((value) => value < 1 || value > 5) || !ease || !control || !privacy) {
      setError("Please answer all ratings before finishing the evaluation.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await completeEvaluationSession(sessionId, sus, ease, control, privacy, comments);
      setComplete(true);
      void trackUsability("evaluation_completed", null, { success: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save evaluation responses.");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportData() {
    if (!sessionId) return;
    try {
      const data = await getEvaluationExport(sessionId);
      downloadJson(`reflectblocks-evaluation-${data.session.participant_code}.json`, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export evaluation data.");
    }
  }

  function endSession() {
    setEvaluationSessionId(null);
    setSessionIdState(null);
    setComplete(false);
    onBack();
  }

  if (!sessionId) {
    return (
      <section className="evaluation-page page-enter" aria-labelledby="evaluation-title">
        <button className="back-button" type="button" onClick={onBack}>← Back</button>

        <div className="evaluation-card automated-evaluation-card">
          <div className="evaluation-section-heading">
            <div>
              <p className="eyebrow">Developer technical audit</p>
              <h1 id="evaluation-title">Check implementation conformance with synthetic fixtures.</h1>
            </div>
            <span className="automation-badge">Synthetic data only</span>
          </div>
          <p>ReflectBlocks creates a temporary synthetic test user, exercises the real persistence/data-flow paths, checks relevant frontend implementation contracts, stores the R1–R14 results automatically, and deletes the synthetic fixture data afterward. It never sends test content to Gemini and never modifies your reflections or prompt preference.</p>
          <div className="automated-explainer-grid">
            <article><strong>Automatic</strong><span>Persistence, provenance, selection boundaries, deletion independence, edit-save behavior, and implementation contracts.</span></article>
            <article><strong>Still human</strong><span>Discoverability, comprehension, think-aloud evidence, aged-45+ inclusive usability, and expert judgment.</span></article>
            <article><strong>Stored</strong><span>Every run and each requirement result are saved in SQLite and can be reopened or exported as JSON.</span></article>
          </div>
          <div className="evaluation-task-actions">
            <button className="primary-button" type="button" onClick={() => { void runAutomaticAudit(); }} disabled={automatedRunning}>
              {automatedRunning ? "Running R1–R14…" : "Run automated R1–R14 audit"}
            </button>
            {automatedRun ? <button className="secondary-button" type="button" onClick={exportAutomatedRun}>Export this run JSON</button> : null}
          </div>

          {automatedRun ? (
            <div className="automated-results">
              <div className="automated-summary">
                <strong>{automatedRun.overall_status === "fail" ? "Technical audit found failures" : "Technical audit completed"}</strong>
                <span>{automatedRun.summary.failed ?? 0} failed · {automatedRun.summary.passed ?? 0} automated/partial checks passed · {automatedRun.summary.manual_required ?? 0} human-only requirements</span>
              </div>
              <div className="automated-result-list">
                {automatedRun.results.map((result) => (
                  <details className={`automated-result status-${result.status}`} key={result.requirement_id}>
                    <summary>
                      <span className="requirement-id">{result.requirement_id}</span>
                      <span className="requirement-summary-copy"><strong>{result.title}</strong><small>{result.automation_level.replace("_", " ")}</small></span>
                      <span className={`auto-status auto-${result.status}`}>{result.status.replace("_", " ")}</span>
                    </summary>
                    <div className="automated-result-body">
                      {result.checks.map((check) => (
                        <div className="automated-check-row" key={check.name}>
                          <span aria-hidden="true">{check.passed === true ? "✓" : check.passed === false ? "✕" : "—"}</span>
                          <div><strong>{check.name}</strong><p>{check.detail}</p></div>
                        </div>
                      ))}
                      {result.human_reason ? (
                        <div className="manual-reason"><strong>Why this cannot be fully automated</strong><p>{result.human_reason}</p></div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ) : null}

          <div className="automated-history">
            <h2>Saved automated runs</h2>
            {automatedHistoryLoading ? <p className="muted">Loading previous runs…</p> : null}
            {!automatedHistoryLoading && automatedHistory.length === 0 ? <p className="muted">No automated runs yet.</p> : null}
            {automatedHistory.map((run) => (
              <button type="button" className="automated-history-row" key={run.id} onClick={() => { void openAutomatedRun(run.id); }}>
                <span>{new Date(run.completed_at * 1000).toLocaleString()}</span>
                <strong>{run.overall_status.replaceAll("_", " ")}</strong>
                <small>{run.summary.failed ?? 0} failed · {run.summary.partial ?? 0} partial · {run.summary.human_required ?? 0} human-only</small>
              </button>
            ))}
          </div>
        </div>

        <div className="evaluation-card evaluation-setup">
          <p className="eyebrow">Participant evaluation mode</p>
          <h2>Run the guided study one task at a time.</h2>
          <p>After setup, ReflectBlocks switches into an evaluation-only interface. Each task starts from an instruction screen, timing begins when the participant presses Start task, observable actions are logged automatically, comprehension checkpoints are auto-scored, and task results are stored under the signed-in evaluation session.</p>

          <label>
            <span>Participant code</span>
            <input value={participantCode} onChange={(event) => setParticipantCode(event.target.value)} placeholder="e.g. P01" />
          </label>
          <label>
            <span>Device</span>
            <select value={deviceType} onChange={(event) => setDeviceType(event.target.value)}>
              <option value="desktop">Desktop / laptop</option>
              <option value="tablet">Tablet</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <div className="evaluation-setup-grid">
            <label>
              <span>Age group (for R9 inclusive-session coverage)</span>
              <select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}>
                <option value="18_24">18–24</option>
                <option value="25_44">25–44</option>
                <option value="45_59">45–59</option>
                <option value="60_plus">60+</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label>
              <span>Text-editing experience</span>
              <select value={textEditingExperience} onChange={(event) => setTextEditingExperience(event.target.value)}>
                <option value="limited">Limited</option>
                <option value="some">Some</option>
                <option value="comfortable">Comfortable</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
          </div>
          <div className="evaluation-study-note">
            <strong>Study content:</strong> use fictional/prepared material rather than a real sensitive experience. During evaluation mode, journal generation uses a prepared local fixture so participant text is not sent to Gemini.
          </div>
          <label className="evaluation-consent">
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
            <span>I consent to recording interaction events and requirement-check observations for this usability session. I understand the event log excludes journal text and block answers.</span>
          </label>

          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="secondary-button" type="button" onClick={start} disabled={starting || !participantCode.trim() || !consented}>
            {starting ? "Starting…" : "Start participant evaluation →"}
          </button>
        </div>
      </section>
    );
  }

  if (complete) {
    return (
      <section className="evaluation-page page-enter">
        <div className="evaluation-card evaluation-complete">
          <p className="eyebrow">Session complete</p>
          <h1>Evaluation saved.</h1>
          <p>Requirement coverage: <strong>{coveredCount}/14</strong>. SUS score: <strong>{susScore?.toFixed(1)}</strong> / 100. Treat SUS as a standardized usability score, not a percentage grade.</p>
          <div className="evaluation-complete-actions">
            <button className="secondary-button" type="button" onClick={() => { void exportData(); }}>Export full session JSON</button>
            <button className="primary-button" type="button" onClick={endSession}>End session</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="evaluation-page page-enter" aria-labelledby="evaluation-active-title">
      <div className="evaluation-topbar">
        <button className="back-button" type="button" onClick={onBack}>← Reflections</button>
        <div className="evaluation-topbar-actions">
          <span className="evaluation-active-badge">● Evaluation recording active · {coveredCount}/14 checked</span>
          <button className="secondary-button" type="button" onClick={endSession}>Stop study mode</button>
        </div>
      </div>

      <div className="evaluation-card">
        <p className="eyebrow">Moderator protocol</p>
        <h1 id="evaluation-active-title">Run the five participant tasks + parallel governance review.</h1>
        <p><strong>Task 1 is the exception:</strong> do not ask the participant to think aloud during the timed capture. Ask for a retrospective explanation immediately afterward. For Tasks 2–5, use concurrent think-aloud and neutral reminders such as “Please keep talking,” without pointing to controls.</p>
        <div className="evaluation-task-grid">
          {TASK_GROUPS.map(([title, ids, method]) => (
            <article key={title}>
              <span>{ids}</span>
              <strong>{title}</strong>
              <p>{method}</p>
            </article>
          ))}
        </div>
        <div className="evaluation-task-actions">
          <button className="primary-button" type="button" onClick={onStartTasks}>Open ReflectBlocks tasks →</button>
          <button className="secondary-button" type="button" onClick={() => { void exportData(); }}>Export current study JSON</button>
        </div>
      </div>

      <div className="evaluation-card protocol-card">
        <div className="evaluation-section-heading">
          <div>
            <p className="eyebrow">R1–R14 evidence</p>
            <h2>Record every Table 8 check.</h2>
          </div>
          {loadingProtocol ? <span className="muted">Loading saved checks…</span> : <span className="coverage-pill">{coveredCount}/14 recorded</span>}
        </div>
        <p className="muted">Status is a formative study judgment. Use <strong>Critical</strong> for privacy/consent/irreversible-deletion misunderstandings that the paper says should trigger revision after a single occurrence.</p>

        <div className="requirement-check-list">
          {REQUIREMENTS.map((requirement) => {
            const check = checks[requirement.id];
            return (
              <details className={`requirement-check ${check.status}`} key={requirement.id} open={requirement.id === "R1"}>
                <summary>
                  <span className="requirement-id">{requirement.id}</span>
                  <span className="requirement-summary-copy">
                    <strong>{requirement.title}</strong>
                    <small>{requirement.method}</small>
                  </span>
                  <span className={`requirement-status status-${check.status}`}>{check.status.replace("_", " ")}</span>
                </summary>
                <div className="requirement-check-body">
                  <div className="requirement-method-box">
                    <div><strong>How to run it</strong><p>{requirement.procedure}</p></div>
                    <div><strong>Revision rule</strong><p>{requirement.decision}</p></div>
                  </div>

                  <label className="requirement-status-field">
                    <span>Observed status</span>
                    <select value={check.status} onChange={(event) => updateCheck(requirement.id, { status: event.target.value as RequirementCheckStatus })}>
                      <option value="not_tested">Not tested</option>
                      <option value="pass">Pass / understood</option>
                      <option value="issue">Issue / needs revision</option>
                      <option value="critical">Critical misunderstanding</option>
                    </select>
                  </label>

                  <div className="requirement-evidence-grid">
                    {requirement.fields.map((field) => field.type === "number" ? (
                      <label className="requirement-number-field" key={field.key}>
                        <span>{field.label}</span>
                        <div>
                          <input
                            type="number"
                            min={0}
                            value={typeof check.evidence[field.key] === "number" ? Number(check.evidence[field.key]) : ""}
                            onChange={(event) => updateEvidence(requirement.id, field.key, event.target.value === "" ? null : Number(event.target.value))}
                          />
                          {field.suffix ? <small>{field.suffix}</small> : null}
                        </div>
                      </label>
                    ) : (
                      <label className="requirement-checkbox" key={field.key}>
                        <input
                          type="checkbox"
                          checked={check.evidence[field.key] === true}
                          onChange={(event) => updateEvidence(requirement.id, field.key, event.target.checked)}
                        />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>

                  <label className="requirement-notes-field">
                    <span>Moderator notes <small>(do not paste journal content)</small></span>
                    <textarea
                      rows={3}
                      value={check.notes}
                      onChange={(event) => updateCheck(requirement.id, { notes: event.target.value })}
                      placeholder="Hesitation, misunderstanding, workaround, or reason for the status…"
                    />
                  </label>
                  <div className="requirement-save-row">
                    <span aria-live="polite">{check.saved ? "Saved" : "Unsaved check"}</span>
                    <button className="secondary-button" type="button" disabled={check.saving} onClick={() => { void saveCheck(requirement.id); }}>
                      {check.saving ? "Saving…" : `Save ${requirement.id} check`}
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div className="evaluation-card governance-card">
        <p className="eyebrow">Parallel stakeholder review · R7, R8, R10, R11</p>
        <h2>Governance review</h2>
        <p>This is separate from the writer-facing walkthrough. A privacy or domain reviewer should inspect the production data-flow design, retention/deletion rules, processing notice, and all prompt wording.</p>
        <label>
          <span>Reviewer role</span>
          <input value={governance.reviewer_role} onChange={(event) => { setGovernance({ ...governance, reviewer_role: event.target.value }); setGovernanceSaved(false); }} placeholder="e.g. privacy reviewer / counselling-domain reviewer" />
        </label>
        <div className="governance-grid">
          {[
            ["data_flow_ok", "R7 data flow: only explicitly selected material is processed"],
            ["retention_ok", "R8 retention/deletion scope is clear and technically consistent"],
            ["processing_notice_ok", "R10 notice truthfully explains what, who, why, and retention"],
            ["prompt_wording_ok", "R11 prompt wording has no unresolved harmful/clinical-sounding phrasing"],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={triStateValue(governance[key as keyof GovernanceDraft] as boolean | null)}
                onChange={(event) => {
                  setGovernance({ ...governance, [key]: parseTriState(event.target.value) });
                  setGovernanceSaved(false);
                }}
              >
                <option value="">Not reviewed</option>
                <option value="yes">No unresolved issue</option>
                <option value="no">Issue remains</option>
              </select>
            </label>
          ))}
          <label>
            <span>Unresolved prompt wording flags</span>
            <input
              type="number"
              min={0}
              value={governance.prompt_flags_count}
              onChange={(event) => { setGovernance({ ...governance, prompt_flags_count: Number(event.target.value) || 0 }); setGovernanceSaved(false); }}
            />
          </label>
        </div>
        <label>
          <span>Reviewer notes</span>
          <textarea rows={4} value={governance.notes} onChange={(event) => { setGovernance({ ...governance, notes: event.target.value }); setGovernanceSaved(false); }} placeholder="Record unresolved data-flow, retention, notice, or prompt-wording concerns." />
        </label>
        <div className="requirement-save-row">
          <span>{governanceSaved ? "Governance review saved" : "Governance review not yet saved"}</span>
          <button className="secondary-button" type="button" disabled={governanceSaving || !governance.reviewer_role.trim()} onClick={() => { void saveGovernance(); }}>
            {governanceSaving ? "Saving…" : "Save governance review"}
          </button>
        </div>
      </div>

      <div className="evaluation-card survey-card">
        <p className="eyebrow">Post-task questionnaire</p>
        <h2>System Usability Scale</h2>
        <p className="muted">1 = strongly disagree · 5 = strongly agree. SUS is kept from the existing evaluation build as an additional usability measure; the requirement-level checks above remain the Table 8 decision evidence.</p>

        <div className="sus-list">
          {SUS_STATEMENTS.map((statement, index) => (
            <fieldset key={statement}>
              <legend>{index + 1}. {statement}</legend>
              <div className="likert-row">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`sus-${index}`}
                      value={value}
                      checked={sus[index] === value}
                      onChange={() => setSus((current) => current.map((item, i) => i === index ? value : item))}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="evaluation-custom-ratings">
          {[
            ["How easy was it to complete the reflection?", ease, setEase],
            ["How much control did you feel over what was saved or sent to AI?", control, setControl],
            ["How clear was the privacy boundary before AI generation?", privacy, setPrivacy],
          ].map(([label, value, setter]) => (
            <label key={String(label)}>
              <span>{String(label)}</span>
              <select value={Number(value)} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))}>
                <option value={0}>Choose…</option>
                <option value={1}>1 — Very low</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5 — Very high</option>
              </select>
            </label>
          ))}
          <label>
            <span>Final comments / unexpected value / workload or privacy concerns</span>
            <textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={5} />
          </label>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="evaluation-submit-row">
          <span>{susScore !== null && sus.every(Boolean) ? `Current SUS: ${susScore.toFixed(1)}` : `${coveredCount}/14 requirement checks recorded`}</span>
          <button className="primary-button" type="button" onClick={() => { void submit(); }} disabled={submitting}>
            {submitting ? "Saving…" : "Finish evaluation"}
          </button>
        </div>
      </div>
    </section>
  );
}
