import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth";
import {
  completeGuidedEvaluationTask,
  deleteReflection,
  getEvaluationExport,
  getGuidedEvaluationTasks,
  getPromptPreferences,
  getReflection,
  getSavedGeneratedEntry,
  savePromptPreferences,
  startGuidedEvaluationTask,
  type GuidedRequirementResultInput,
  type PromptPreferences,
  type Reflection,
} from "../reflections";
import {
  clearGuidedEvaluationRuntime,
  getEvaluationSessionId,
  setGuidedEvaluationTaskId,
  trackUsability,
  USABILITY_EVENT_NAME,
  type LocalUsabilityEvent,
} from "../lib/usability";
import { FreeWritingPage } from "./FreeWritingPage";
import { JournalEntryPage } from "./JournalEntryPage";
import { PromptPreferenceControl } from "./PromptPreferenceControl";
import { QuickThought } from "./QuickThought";
import { ReflectionWorkspace } from "./ReflectionWorkspace";

type TaskDefinition = {
  id: string;
  title: string;
  requirements: string[];
  instruction: string;
  details: string[];
};

const TASKS: TaskDefinition[] = [
  {
    id: "quick-capture",
    title: "Quick thought capture",
    requirements: ["R1", "R9"],
    instruction: "Record and save the prepared thought as quickly as you can.",
    details: [
      "Prepared thought: “I felt nervous after today's presentation.”",
      "The timer starts only after you press Start task.",
      "For this first task, do not think aloud while the timer is running.",
    ],
  },
  {
    id: "optional-structure",
    title: "Optional prompts and block customization",
    requirements: ["R2", "R13"],
    instruction: "Use the reflection workspace and show that the prompts are optional and customizable.",
    details: [
      "Add at least two prompt blocks and answer at least two blocks.",
      "Dismiss one block you do not want to use.",
      "Add one custom question, edit a block question, and move a block Earlier/Later.",
      "Finish by pressing Save blocks only.",
    ],
  },
  {
    id: "persistent-default",
    title: "Persistent prompt preference",
    requirements: ["R3"],
    instruction: "Set the starter-prompt default and check whether it persists across two new reflections.",
    details: [
      "Set Reflection defaults to “Always add the same 3 starter prompts.”",
      "Create two new reflections when prompted.",
      "The system will automatically check how many starter blocks each new reflection receives.",
    ],
  },
  {
    id: "blank-writing",
    title: "Blank writing without AI",
    requirements: ["R6"],
    instruction: "Complete and save a short entry using only the blank writing mode.",
    details: [
      "Use fictional text rather than a real sensitive experience.",
      "Save the writing without opening the block workspace or generating a journal.",
    ],
  },
  {
    id: "generation-boundary",
    title: "Selection, privacy notice, and explicit generation",
    requirements: ["R4", "R7", "R10"],
    instruction: "Generate a prepared journal only after explicitly selecting what may contribute.",
    details: [
      "Open Generate journal entry.",
      "Leave at least one answered block selected and uncheck at least one answered block.",
      "Read the privacy notice. A short comprehension checkpoint will appear before you continue.",
      "Confirm generation and save the prepared draft without correcting its wording yet.",
    ],
  },
  {
    id: "source-editing",
    title: "Source transparency and editing",
    requirements: ["R5", "R12"],
    instruction: "Inspect the source of a generated passage, fix the deliberately unsuitable wording, and save your edit.",
    details: [
      "Click at least one source chip.",
      "Answer the source-transparency checkpoint.",
      "Edit the unsuitable sentence and save the updated journal.",
    ],
  },
  {
    id: "retention-deletion",
    title: "Retention, export, save-nothing, and deletion",
    requirements: ["R8", "R14"],
    instruction: "Exercise the distinct end-of-session retention choices.",
    details: [
      "Before starting, predict what remains if only the generated journal is deleted.",
      "Make a small journal edit and choose Save nothing to discard that edit.",
      "Export the journal once.",
      "Delete the generated journal and confirm what remains.",
    ],
  },
];

type Phase = "intro" | "running" | "checkpoint" | "task-complete" | "finished";
type Primitive = string | number | boolean | null;
type Evidence = Record<string, Primitive>;

type Checkpoint = "quick-retrospective" | "privacy" | "source" | "retention" | null;

type PreferenceStage = "preference" | "entry1" | "prediction" | "entry2";

const PREPARED_QUICK_THOUGHT = "I felt nervous after today's presentation.";

function formatElapsed(ms: number) {
  const seconds = Math.max(0, ms) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function requirement(
  requirementId: string,
  status: "not_tested" | "pass" | "issue" | "critical",
  evidence: Evidence,
  notes: string,
): GuidedRequirementResultInput {
  return { requirement_id: requirementId, status, evidence, notes };
}

function addUnique(values: string[], value: string | null) {
  if (!value || values.includes(value)) return values;
  return [...values, value];
}

export function ParticipantEvaluationMode({ onExit, onFinish }: { onExit: () => void; onFinish: () => void }) {
  const { user } = useAuth();
  const sessionId = getEvaluationSessionId();
  const [taskIndex, setTaskIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [taskStartedAt, setTaskStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [objective, setObjective] = useState<Evidence>({});
  const [comprehension, setComprehension] = useState<Evidence>({});
  const [checkpoint, setCheckpoint] = useState<Checkpoint>(null);
  const [activeReflectionId, setActiveReflectionId] = useState<string | null>(null);
  const [mainReflectionId, setMainReflectionId] = useState<string | null>(null);
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const [age45Plus, setAge45Plus] = useState(false);
  const [originalPreference, setOriginalPreference] = useState<PromptPreferences["prompt_behavior"]>("manual");
  const [originalPreferenceLoaded, setOriginalPreferenceLoaded] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [preferenceStage, setPreferenceStage] = useState<PreferenceStage>("preference");
  const [predictionAnswer, setPredictionAnswer] = useState("");
  const [deletePrediction, setDeletePrediction] = useState("");
  const [privacyAnswers, setPrivacyAnswers] = useState({ selected: "", processor: "", sent: "" });
  const [sourceAnswer, setSourceAnswer] = useState("");
  const [retentionAnswer, setRetentionAnswer] = useState("");
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpNotice, setHelpNotice] = useState<string | null>(null);
  const observationsRef = useRef<Evidence>({});

  const task = TASKS[taskIndex];
  const progress = Math.round(((taskIndex + (phase === "task-complete" || phase === "finished" ? 1 : 0)) / TASKS.length) * 100);

  useEffect(() => {
    if (!sessionId) return;
    clearGuidedEvaluationRuntime();
    let cancelled = false;
    async function load() {
      try {
        const [exported, preference, guided] = await Promise.all([
          getEvaluationExport(sessionId!),
          getPromptPreferences(),
          getGuidedEvaluationTasks(sessionId!),
        ]);
        if (cancelled) return;
        setAge45Plus(["45_59", "60_plus"].includes(String(exported.session.age_group ?? "")));
        setOriginalPreference(preference.prompt_behavior);
        setOriginalPreferenceLoaded(true);
        setPreferenceReady(preference.prompt_behavior === "starter");
        const completed = guided.filter((item) => item.completed_at_ms != null).map((item) => item.task_id);
        setCompletedTaskIds(completed);
        const storedArtifacts = guided.map((item) => item.reflection_id).filter((value): value is string => Boolean(value));
        setArtifactIds((current) => [...new Set([...current, ...storedArtifacts])]);
        const mainArtifact = guided.find((item) => item.task_id === "quick-capture")?.reflection_id ?? null;
        if (mainArtifact) {
          setMainReflectionId(mainArtifact);
          setActiveReflectionId(mainArtifact);
        }
        const nextIndex = TASKS.findIndex((item) => !completed.includes(item.id));
        if (nextIndex === -1 && guided.length > 0) {
          setTaskIndex(TASKS.length - 1);
          setPhase("finished");
        } else if (nextIndex > 0) {
          setTaskIndex(nextIndex);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the evaluation session.");
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearGuidedEvaluationRuntime();
    };
  }, [sessionId]);

  useEffect(() => {
    if ((phase !== "running" && phase !== "checkpoint") || taskStartedAt == null) return;
    const update = () => setElapsedMs(Date.now() - taskStartedAt);
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [phase, taskStartedAt]);

  useEffect(() => {
    function handle(raw: Event) {
      if (phase !== "running" || !task) return;
      const event = raw as CustomEvent<LocalUsabilityEvent>;
      const detail = event.detail;
      if (!detail || detail.metadata.task_id !== task.id) return;

      const next = { ...observationsRef.current };
      switch (task.id) {
        case "quick-capture":
          if (detail.eventType === "quick_capture_timed") {
            next.completed = true;
            next.duration_ms = typeof detail.metadata.duration_ms === "number" ? detail.metadata.duration_ms : Date.now() - (taskStartedAt ?? Date.now());
            next.within_5s = Number(next.duration_ms) <= 5000;
            if (detail.reflectionId) {
              setMainReflectionId(detail.reflectionId);
              setActiveReflectionId(detail.reflectionId);
              setArtifactIds((current) => addUnique(current, detail.reflectionId));
            }
            setCheckpoint("quick-retrospective");
            setPhase("checkpoint");
          }
          break;
        case "optional-structure":
          if (detail.eventType === "block_dismissed") next.dismissed_block = true;
          if (detail.eventType === "custom_block_added") next.custom_block_added = true;
          if (detail.eventType === "block_question_edited") next.question_edited = true;
          if (detail.eventType === "block_reordered") next.reordered = true;
          if (detail.eventType === "workspace_saved") {
            next.workspace_saved = true;
            next.answered_count = Number(detail.metadata.answered_count ?? 0);
          }
          break;
        case "persistent-default":
          if (detail.eventType === "prompt_default_changed" && detail.metadata.action === "starter") {
            next.preference_changed = true;
            setPreferenceReady(true);
          }
          break;
        case "blank-writing":
          if (detail.eventType === "free_writing_created" || detail.eventType === "free_writing_saved") {
            next.blank_saved = true;
            next.completed = true;
            if (detail.reflectionId) setArtifactIds((current) => addUnique(current, detail.reflectionId));
          }
          break;
        case "generation-boundary":
          if (detail.eventType === "generation_privacy_notice_shown") {
            next.privacy_notice_seen = true;
            next.selected_count = Number(detail.metadata.selected_count ?? 0);
            next.unselected_count = Number(detail.metadata.unselected_count ?? 0);
            setCheckpoint("privacy");
            setPhase("checkpoint");
          }
          if (detail.eventType === "journal_generation_started") next.generation_requested = true;
          if (detail.eventType === "journal_generated") {
            next.journal_generated = true;
            next.generated_after_request = Boolean(next.generation_requested);
          }
          if (detail.eventType === "journal_saved") next.journal_saved = true;
          break;
        case "source-editing":
          if (detail.eventType === "journal_source_inspected") {
            next.source_inspected = true;
            if (comprehension.source_checkpoint_answered !== true) {
              setCheckpoint("source");
              setPhase("checkpoint");
            }
          }
          if (detail.eventType === "journal_paragraph_edited") next.paragraph_edited = true;
          if (detail.eventType === "journal_saved") next.journal_saved = true;
          break;
        case "retention-deletion":
          if (detail.eventType === "discard_unsaved" && detail.metadata.action === "journal") next.save_nothing_used = true;
          if (detail.eventType === "export_clicked") next.exported = true;
          if (detail.eventType === "delete_action" && detail.metadata.action === "generated_journal") {
            next.journal_deleted = true;
            void verifyDeletionAndAskRetention();
          }
          break;
      }
      observationsRef.current = next;
      setObjective(next);
    }

    window.addEventListener(USABILITY_EVENT_NAME, handle as EventListener);
    return () => window.removeEventListener(USABILITY_EVENT_NAME, handle as EventListener);
  }, [comprehension.source_checkpoint_answered, phase, task, taskStartedAt]);

  useEffect(() => {
    if (phase !== "running" || !task) return;
    const o = objective;
    if (task.id === "optional-structure") {
      const ready = Boolean(o.dismissed_block && o.custom_block_added && o.question_edited && o.reordered && o.workspace_saved && Number(o.answered_count ?? 0) >= 2);
      if (ready) void finishCurrentTask();
    }
    if (task.id === "blank-writing" && o.blank_saved) void finishCurrentTask();
    if (task.id === "generation-boundary" && o.journal_saved && o.journal_generated && o.generated_after_request && comprehension.selected_data_correct != null) {
      void finishCurrentTask();
    }
    if (task.id === "source-editing" && o.source_inspected && o.paragraph_edited && o.journal_saved && comprehension.source_checkpoint_answered === true) {
      void finishCurrentTask();
    }
  }, [comprehension, objective, phase, task]);

  async function startTask() {
    if (!sessionId || !task) return;
    try {
      setError(null);
      setHelpNotice(null);
      setObjective({});
      observationsRef.current = {};
      setComprehension({});
      setCheckpoint(null);
      setPrivacyAnswers({ selected: "", processor: "", sent: "" });
      setSourceAnswer("");
      setRetentionAnswer("");
      if (task.id === "persistent-default") {
        setPreferenceStage("preference");
        setPredictionAnswer("");
      }
      await startGuidedEvaluationTask(sessionId, task.id, task.requirements);
      setGuidedEvaluationTaskId(task.id);
      const started = Date.now();
      setTaskStartedAt(started);
      setElapsedMs(0);
      setPhase("running");
      if (task.id === "quick-capture") setActiveReflectionId(null);
      if (["optional-structure", "generation-boundary"].includes(task.id)) setActiveReflectionId(mainReflectionId);
      if (["source-editing", "retention-deletion"].includes(task.id)) setActiveReflectionId(mainReflectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this evaluation task.");
    }
  }

  async function finishCurrentTask(extraObjective: Evidence = {}, extraComprehension: Evidence = {}) {
    if (!sessionId || !task || savingTask || taskStartedAt == null) return;
    const mergedObjective: Evidence = { ...observationsRef.current, ...objective, ...extraObjective, completed: true };
    const mergedComprehension: Evidence = { ...comprehension, ...extraComprehension };
    const durationMs = Date.now() - taskStartedAt;
    const results = buildRequirementResults(task.id, mergedObjective, mergedComprehension);
    const hasCritical = results.some((item) => item.status === "critical");
    const hasIssue = results.some((item) => item.status === "issue");
    try {
      setSavingTask(true);
      setError(null);
      await completeGuidedEvaluationTask(
        sessionId,
        task.id,
        durationMs,
        hasCritical ? "critical" : hasIssue ? "issue" : "pass",
        { ...mergedObjective, duration_ms: Number(mergedObjective.duration_ms ?? durationMs) },
        mergedComprehension,
        task.id === "blank-writing" ? null : activeReflectionId,
        results,
      );
      setGuidedEvaluationTaskId(null);
      setObjective(mergedObjective);
      setComprehension(mergedComprehension);
      setCompletedTaskIds((current) => addUnique(current, task.id));
      setPhase(taskIndex === TASKS.length - 1 ? "finished" : "task-complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not store the task result.");
    } finally {
      setSavingTask(false);
    }
  }

  function buildRequirementResults(taskId: string, o: Evidence, c: Evidence): GuidedRequirementResultInput[] {
    if (taskId === "quick-capture") {
      const within = Boolean(o.within_5s);
      const withoutHelp = Number(o.help_count ?? 0) === 0;
      const r1Pass = within && withoutHelp;
      return [
        requirement(
          "R1",
          r1Pass ? "pass" : "issue",
          { completed: true, duration_ms: Number(o.duration_ms ?? 0), help_count: Number(o.help_count ?? 0) },
          !within
            ? "Capture exceeded the five-second acceptance threshold."
            : withoutHelp
              ? "Captured within five seconds without requesting moderator help."
              : "Captured within five seconds, but the participant requested help during the task.",
        ),
        requirement(
          "R9",
          !age45Plus ? "not_tested" : Boolean(o.completed) && withoutHelp ? "pass" : "issue",
          { completed: Boolean(o.completed), tap_type_only: true, age_45_plus: age45Plus, help_count: Number(o.help_count ?? 0) },
          !age45Plus
            ? "Behavior recorded, but R9 requires aged-45+ coverage before it is treated as validated."
            : withoutHelp && Boolean(o.completed)
              ? "An aged-45+ participant completed the visible tap/type capture path without requesting help."
              : "The aged-45+ participant did not complete the capture path independently.",
        ),
      ];
    }
    if (taskId === "optional-structure") {
      const withoutHelp = Number(o.help_count ?? 0) === 0;
      return [
        requirement("R2", o.dismissed_block && o.workspace_saved && withoutHelp ? "pass" : "issue", { completed: Boolean(o.dismissed_block), without_help: withoutHelp, help_count: Number(o.help_count ?? 0) }, withoutHelp ? "Direct block dismissal was observed inside the entry screen without a help request." : "Block dismissal was observed, but the participant requested help during the task."),
        requirement("R13", o.custom_block_added && o.question_edited && o.reordered ? "pass" : "issue", { custom_block_added: Boolean(o.custom_block_added), question_edited: Boolean(o.question_edited), reordered: Boolean(o.reordered) }, "Customization actions were observed before generation."),
      ];
    }
    if (taskId === "persistent-default") {
      const persisted = Number(o.first_entry_starter_count ?? 0) >= 3 && Number(o.second_entry_starter_count ?? 0) >= 3;
      return [requirement("R3", persisted && c.expected_behavior_correct ? "pass" : "issue", { persisted, second_session_checked: true, predicted_correctly: Boolean(c.expected_behavior_correct) }, "Starter preference was checked across two newly created reflections.")];
    }
    if (taskId === "blank-writing") {
      return [requirement("R6", o.blank_saved ? "pass" : "issue", { blank_completed: Boolean(o.blank_saved), completed: Boolean(o.blank_saved) }, "A complete entry was saved through blank writing without generation.")];
    }
    if (taskId === "generation-boundary") {
      const selectionObserved = Number(o.selected_count ?? 0) >= 1 && Number(o.unselected_count ?? 0) >= 1;
      const privacyAnswered = Number(c.total_count ?? 0) === 3;
      const privacyCorrect = Boolean(c.selected_data_correct && c.processor_correct && c.sent_already_correct);
      const privacyStatus = privacyCorrect ? "pass" : privacyAnswered ? "critical" : "issue";
      return [
        requirement("R4", o.generated_after_request ? "pass" : "issue", { no_auto_generation: Boolean(o.generated_after_request), completed: Boolean(o.journal_generated) }, "The prepared journal appeared only after the explicit generation action."),
        requirement("R7", selectionObserved && c.selected_data_correct ? "pass" : "issue", { selected_only_understood: Boolean(c.selected_data_correct), selected_count: Number(o.selected_count ?? 0), unselected_count: Number(o.unselected_count ?? 0) }, "Participant selected a subset and answered the selected-data comprehension check."),
        requirement("R10", privacyStatus, { notice_explained: privacyCorrect, predicted_correctly: Boolean(c.sent_already_correct), critical_misunderstanding: privacyAnswered && !privacyCorrect }, privacyAnswered ? "Processing-boundary comprehension was auto-scored from the participant checkpoint." : "The participant ended the task before completing the processing-notice comprehension checkpoint."),
      ];
    }
    if (taskId === "source-editing") {
      return [
        requirement("R5", o.source_inspected && c.source_meaning_correct ? "pass" : "issue", { source_identified: Boolean(o.source_inspected), writer_vs_system_distinguished: Boolean(c.source_meaning_correct) }, "A source chip was inspected and the source relationship was understood."),
        requirement("R12", o.paragraph_edited && o.journal_saved ? "pass" : "issue", { edit_saved_matches: Boolean(o.paragraph_edited && o.journal_saved), completed: Boolean(o.journal_saved) }, "A generated passage was edited and the edited journal was saved."),
      ];
    }
    if (taskId === "retention-deletion") {
      const deletionSafe = Boolean(o.journal_deleted && o.blocks_remained && o.generated_entry_removed && c.delete_scope_correct && c.retention_state_correct);
      const deletionAnswered = c.delete_scope_correct != null || c.retention_state_correct != null;
      const deletionMisunderstood = c.delete_scope_correct === false || c.retention_state_correct === false;
      const retentionActions = Boolean(o.save_blocks_only_done && o.save_entry_done && o.save_nothing_used && o.exported);
      return [
        requirement("R8", deletionSafe ? "pass" : deletionAnswered && deletionMisunderstood ? "critical" : "issue", { delete_independent: Boolean(o.journal_deleted && o.blocks_remained), predicted_correctly: Boolean(c.delete_scope_correct && c.retention_state_correct), critical_misunderstanding: deletionMisunderstood }, deletionSafe ? "Deletion was checked against the resulting stored state and participant prediction." : deletionMisunderstood ? "The participant showed a critical misunderstanding of the deletion scope." : "The deletion task was incomplete or its resulting state was not fully verified."),
        requirement("R14", retentionActions && c.retention_state_correct ? "pass" : "issue", { save_blocks_only_understood: Boolean(o.save_blocks_only_done), save_entry_understood: Boolean(o.save_entry_done), export_understood: Boolean(o.exported), save_nothing_understood: Boolean(o.save_nothing_used), predicted_correctly: Boolean(c.retention_state_correct) }, "Distinct save/export/save-nothing outcomes were observed across the guided tasks."),
      ];
    }
    return [];
  }

  async function verifyDeletionAndAskRetention() {
    if (!mainReflectionId) return;
    try {
      const [detail, generated] = await Promise.all([
        getReflection(mainReflectionId),
        getSavedGeneratedEntry(mainReflectionId),
      ]);
      const next = {
        ...observationsRef.current,
        blocks_remained: detail.blocks.length > 0,
        generated_entry_removed: generated == null,
        save_blocks_only_done: completedTaskIds.includes("optional-structure"),
        save_entry_done: completedTaskIds.includes("generation-boundary") || completedTaskIds.includes("source-editing"),
      };
      observationsRef.current = next;
      setObjective(next);
      setCheckpoint("retention");
      setPhase("checkpoint");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the resulting retention state.");
    }
  }

  async function handlePreferenceReflectionSaved(reflection: Reflection) {
    setArtifactIds((current) => addUnique(current, reflection.id));
    setActiveReflectionId(reflection.id);
    try {
      const detail = await getReflection(reflection.id);
      if (preferenceStage === "entry1") {
        const next = { ...observationsRef.current, first_entry_starter_count: detail.blocks.length };
        observationsRef.current = next;
        setObjective(next);
        setPreferenceStage("prediction");
      } else if (preferenceStage === "entry2") {
        const next = { ...observationsRef.current, second_entry_starter_count: detail.blocks.length };
        observationsRef.current = next;
        setObjective(next);
        const correct = predictionAnswer === "starter";
        setComprehension((current) => ({ ...current, expected_behavior_correct: correct }));
        await savePromptPreferences(originalPreference);
        setPreferenceReady(originalPreference === "starter");
        await finishCurrentTask(next, { expected_behavior_correct: correct });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the starter prompts.");
    }
  }

  function answerQuickRetrospective(value: string) {
    const correct = value === "save-and-continue";
    setComprehension({ expected_behavior_correct: correct });
    void finishCurrentTask({}, { expected_behavior_correct: correct });
  }

  function finishPrivacyCheckpoint() {
    const result = {
      selected_data_correct: privacyAnswers.selected === "selected-only",
      processor_correct: privacyAnswers.processor === "gemini-normal-use",
      sent_already_correct: privacyAnswers.sent === "not-sent-in-study",
      correct_count: [privacyAnswers.selected === "selected-only", privacyAnswers.processor === "gemini-normal-use", privacyAnswers.sent === "not-sent-in-study"].filter(Boolean).length,
      total_count: 3,
    };
    setComprehension((current) => ({ ...current, ...result }));
    setCheckpoint(null);
    setPhase("running");
  }

  function finishSourceCheckpoint() {
    const correct = sourceAnswer === "selected-material";
    setComprehension((current) => ({ ...current, source_meaning_correct: correct, source_checkpoint_answered: true }));
    setCheckpoint(null);
    setPhase("running");
  }

  function finishRetentionCheckpoint() {
    const correct = retentionAnswer === "blocks-remain";
    const deleteCorrect = deletePrediction === "blocks-remain";
    const next = { ...comprehension, retention_state_correct: correct, delete_scope_correct: deleteCorrect };
    setComprehension(next);
    setCheckpoint(null);
    void finishCurrentTask({}, next);
  }

  async function cancelCurrentAttempt() {
    clearGuidedEvaluationRuntime();
    if (task.id === "persistent-default" && originalPreferenceLoaded) {
      await savePromptPreferences(originalPreference).catch(() => undefined);
      setPreferenceReady(originalPreference === "starter");
    }
    setPhase("intro");
    setTaskStartedAt(null);
    setElapsedMs(0);
    setCheckpoint(null);
  }

  async function finishAttempt() {
    if (task.id === "persistent-default" && originalPreferenceLoaded) {
      await savePromptPreferences(originalPreference).catch(() => undefined);
      setPreferenceReady(originalPreference === "starter");
    }
    await finishCurrentTask({ task_success: false });
  }

  function nextTask() {
    const next = taskIndex + 1;
    setTaskIndex(next);
    setPhase("intro");
    setTaskStartedAt(null);
    setElapsedMs(0);
    setObjective({});
    observationsRef.current = {};
    setComprehension({});
    setCheckpoint(null);
    setActiveReflectionId(next >= 1 ? mainReflectionId : null);
  }

  async function cleanupAndFinish() {
    try {
      setCleaning(true);
      setError(null);
      clearGuidedEvaluationRuntime();
      if (originalPreferenceLoaded) await savePromptPreferences(originalPreference).catch(() => undefined);
      for (const reflectionId of artifactIds) {
        await deleteReflection(reflectionId).catch(() => undefined);
      }
      onFinish();
    } finally {
      setCleaning(false);
    }
  }

  function exitEvaluation() {
    clearGuidedEvaluationRuntime();
    if (originalPreferenceLoaded) void savePromptPreferences(originalPreference).catch(() => undefined);
    onExit();
  }

  function taskIntro() {
    const needsDeletePrediction = task.id === "retention-deletion";
    return (
      <section className="participant-task-intro page-enter">
        <div className="participant-task-card">
          <div className="participant-task-number">Task {taskIndex + 1} of {TASKS.length}</div>
          <p className="eyebrow">{task.requirements.join(" · ")}</p>
          <h1>{task.title}</h1>
          <p className="participant-task-instruction">{task.instruction}</p>
          <ul>{task.details.map((item) => <li key={item}>{item}</li>)}</ul>
          {needsDeletePrediction ? (
            <fieldset className="participant-checkpoint-question">
              <legend>Before you start: if you delete only the generated journal, what should remain?</legend>
              <label><input type="radio" name="delete-prediction" checked={deletePrediction === "blocks-remain"} onChange={() => setDeletePrediction("blocks-remain")} /> The original thought and reflection blocks remain</label>
              <label><input type="radio" name="delete-prediction" checked={deletePrediction === "nothing"} onChange={() => setDeletePrediction("nothing")} /> Nothing remains</label>
              <label><input type="radio" name="delete-prediction" checked={deletePrediction === "journal-remains"} onChange={() => setDeletePrediction("journal-remains")} /> Only the generated journal remains</label>
            </fieldset>
          ) : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="participant-task-intro-actions">
            <button className="secondary-button" type="button" onClick={exitEvaluation}>Exit evaluation</button>
            <button className="primary-button" type="button" onClick={() => { void startTask(); }} disabled={needsDeletePrediction && !deletePrediction}>Start task →</button>
          </div>
        </div>
      </section>
    );
  }

  function requestHelp() {
    const nextCount = Number(observationsRef.current.help_count ?? 0) + 1;
    const next = { ...observationsRef.current, help_count: nextCount };
    observationsRef.current = next;
    setObjective(next);
    setHelpNotice("Help request recorded. Ask the moderator for neutral assistance; the task timer continues.");
    void trackUsability("participant_help_requested", activeReflectionId, { help_count: nextCount });
  }

  function taskBanner() {
    return (
      <div className="participant-task-banner" role="status">
        <div>
          <span>Task {taskIndex + 1}/{TASKS.length} · {task.requirements.join(", ")}</span>
          <strong>{task.instruction}</strong>
          {task.id === "quick-capture" ? <em className="participant-prepared-thought">Prepared thought: “{PREPARED_QUICK_THOUGHT}”</em> : null}
          {helpNotice ? <em className="participant-help-notice" role="status">{helpNotice}</em> : null}
        </div>
        <div className="participant-task-banner-actions">
          <button className="participant-help-button" type="button" onClick={requestHelp}>I need help</button>
          {(() => {
            const canEnd = task.id === "persistent-default"
              || task.id === "blank-writing"
              || task.id === "source-editing"
              || task.id === "retention-deletion"
              || (task.id === "optional-structure" && Boolean(objective.workspace_saved) && Number(objective.answered_count ?? 0) >= 1);
            return canEnd ? (
              <button className="participant-finish-attempt-button" type="button" onClick={() => { void finishAttempt(); }} disabled={savingTask}>End task attempt</button>
            ) : null;
          })()}
          <div className="participant-timer" aria-label={`Elapsed time ${formatElapsed(elapsedMs)}`}>{formatElapsed(elapsedMs)}</div>
        </div>
      </div>
    );
  }

  function renderPreferenceTask() {
    if (preferenceStage === "preference") {
      return (
        <section className="participant-inline-task-card">
          <p className="eyebrow">Step 1 of 3</p>
          <h2>Set the reflection default.</h2>
          <p>Open Reflection defaults and choose <strong>Always add the same 3 starter prompts</strong>.</p>
          <PromptPreferenceControl />
          <button className="primary-button" type="button" disabled={!preferenceReady} onClick={() => setPreferenceStage("entry1")}>Create first test reflection →</button>
        </section>
      );
    }
    if (preferenceStage === "entry1") {
      return <QuickThought onCancel={() => setPreferenceStage("preference")} onSaved={(reflection) => { void handlePreferenceReflectionSaved(reflection); }} />;
    }
    if (preferenceStage === "prediction") {
      return (
        <section className="participant-inline-task-card">
          <p className="eyebrow">Step 2 of 3</p>
          <h2>Predict the next entry.</h2>
          <fieldset className="participant-checkpoint-question">
            <legend>When you create another new reflection, what do you expect?</legend>
            <label><input type="radio" name="pref-prediction" checked={predictionAnswer === "starter"} onChange={() => setPredictionAnswer("starter")} /> The same 3 starter prompts will appear again</label>
            <label><input type="radio" name="pref-prediction" checked={predictionAnswer === "manual"} onChange={() => setPredictionAnswer("manual")} /> No prompts will appear</label>
            <label><input type="radio" name="pref-prediction" checked={predictionAnswer === "unknown"} onChange={() => setPredictionAnswer("unknown")} /> I am not sure</label>
          </fieldset>
          <button className="primary-button" type="button" disabled={!predictionAnswer} onClick={() => setPreferenceStage("entry2")}>Create second test reflection →</button>
        </section>
      );
    }
    return <QuickThought onCancel={() => setPreferenceStage("prediction")} onSaved={(reflection) => { void handlePreferenceReflectionSaved(reflection); }} />;
  }

  function renderTaskUI() {
    if (task.id === "quick-capture") {
      return <QuickThought onCancel={() => { void cancelCurrentAttempt(); }} onSaved={(reflection) => { setActiveReflectionId(reflection.id); }} />;
    }
    if (task.id === "optional-structure" && mainReflectionId) {
      return <ReflectionWorkspace reflectionId={mainReflectionId} onBack={() => { void cancelCurrentAttempt(); }} onOpenJournal={() => undefined} onOpenFreeWriting={() => undefined} />;
    }
    if (task.id === "persistent-default") return renderPreferenceTask();
    if (task.id === "blank-writing") {
      return <FreeWritingPage reflectionId={null} onBack={() => { void cancelCurrentAttempt(); }} onCreated={(reflectionId) => { setArtifactIds((current) => addUnique(current, reflectionId)); }} />;
    }
    if (task.id === "generation-boundary" && mainReflectionId) {
      return <ReflectionWorkspace reflectionId={mainReflectionId} onBack={() => { void cancelCurrentAttempt(); }} onOpenJournal={() => undefined} onOpenFreeWriting={() => undefined} />;
    }
    if ((task.id === "source-editing" || task.id === "retention-deletion") && mainReflectionId) {
      return <JournalEntryPage reflectionId={mainReflectionId} onBack={() => { void cancelCurrentAttempt(); }} onOpenWorkspace={() => undefined} onOpenFreeWriting={() => undefined} />;
    }
    return <div className="participant-inline-task-card"><p className="error">The required evaluation artifact is unavailable. Restart this evaluation session.</p></div>;
  }

  function checkpointOverlay() {
    if (!checkpoint) return null;
    if (checkpoint === "quick-retrospective") {
      return (
        <div className="participant-checkpoint-overlay"><div className="participant-checkpoint-card">
          <p className="eyebrow">Immediate retrospective</p><h2>What did you expect the Save action to do?</h2>
          <button onClick={() => answerQuickRetrospective("save-and-continue")}>Save my thought and continue to reflection blocks</button>
          <button onClick={() => answerQuickRetrospective("send-ai")}>Send my thought to AI automatically</button>
          <button onClick={() => answerQuickRetrospective("unsure")}>I was not sure</button>
        </div></div>
      );
    }
    if (checkpoint === "privacy") {
      const complete = privacyAnswers.selected && privacyAnswers.processor && privacyAnswers.sent;
      return (
        <div className="participant-checkpoint-overlay"><div className="participant-checkpoint-card wide">
          <p className="eyebrow">Privacy comprehension checkpoint</p><h2>Answer before confirming generation.</h2>
          <fieldset><legend>Which reflection material is eligible for generation?</legend>
            <label><input type="radio" name="privacy-selected" onChange={() => setPrivacyAnswers({ ...privacyAnswers, selected: "selected-only" })} /> Only the sources I explicitly selected</label>
            <label><input type="radio" name="privacy-selected" onChange={() => setPrivacyAnswers({ ...privacyAnswers, selected: "everything" })} /> Everything saved in my account</label>
            <label><input type="radio" name="privacy-selected" onChange={() => setPrivacyAnswers({ ...privacyAnswers, selected: "all-reflection" })} /> Every block in this reflection</label>
          </fieldset>
          <fieldset><legend>In normal use, who would process the selected material?</legend>
            <label><input type="radio" name="privacy-processor" onChange={() => setPrivacyAnswers({ ...privacyAnswers, processor: "gemini-normal-use" })} /> Google Gemini</label>
            <label><input type="radio" name="privacy-processor" onChange={() => setPrivacyAnswers({ ...privacyAnswers, processor: "browser" })} /> Only my browser</label>
            <label><input type="radio" name="privacy-processor" onChange={() => setPrivacyAnswers({ ...privacyAnswers, processor: "other-users" })} /> Other ReflectBlocks users</label>
          </fieldset>
          <fieldset><legend>During this evaluation session, has your selected reflection text been sent to Gemini?</legend>
            <label><input type="radio" name="privacy-sent" onChange={() => setPrivacyAnswers({ ...privacyAnswers, sent: "not-sent-in-study" })} /> No — study mode uses prepared local output</label>
            <label><input type="radio" name="privacy-sent" onChange={() => setPrivacyAnswers({ ...privacyAnswers, sent: "already-sent" })} /> Yes — it was sent when I opened the notice</label>
          </fieldset>
          <button className="primary-button" type="button" disabled={!complete} onClick={finishPrivacyCheckpoint}>Continue to confirmation →</button>
        </div></div>
      );
    }
    if (checkpoint === "source") {
      return (
        <div className="participant-checkpoint-overlay"><div className="participant-checkpoint-card">
          <p className="eyebrow">Source comprehension</p><h2>What does the source chip tell you?</h2>
          <label><input type="radio" name="source-meaning" onChange={() => setSourceAnswer("selected-material")} /> The passage is linked to original material I selected</label>
          <label><input type="radio" name="source-meaning" onChange={() => setSourceAnswer("history")} /> The passage came from my previous journal history</label>
          <label><input type="radio" name="source-meaning" onChange={() => setSourceAnswer("unsourced")} /> The passage has no identifiable source</label>
          <button className="primary-button" type="button" disabled={!sourceAnswer} onClick={finishSourceCheckpoint}>Continue editing →</button>
        </div></div>
      );
    }
    return (
      <div className="participant-checkpoint-overlay"><div className="participant-checkpoint-card">
        <p className="eyebrow">Resulting-state check</p><h2>After deleting the generated journal, what remains?</h2>
        <label><input type="radio" name="retention-result" onChange={() => setRetentionAnswer("blocks-remain")} /> The original thought and reflection blocks remain</label>
        <label><input type="radio" name="retention-result" onChange={() => setRetentionAnswer("nothing")} /> Nothing remains</label>
        <label><input type="radio" name="retention-result" onChange={() => setRetentionAnswer("journal-remains")} /> The generated journal remains</label>
        <button className="primary-button" type="button" disabled={!retentionAnswer} onClick={finishRetentionCheckpoint}>Store task result →</button>
      </div></div>
    );
  }

  if (!sessionId) {
    return <section className="participant-task-intro"><div className="participant-task-card"><h1>No active evaluation session.</h1><button className="primary-button" onClick={() => { clearGuidedEvaluationRuntime(); onExit(); }}>Return to evaluation setup</button></div></section>;
  }

  if (phase === "finished") {
    return (
      <section className="participant-task-intro page-enter">
        <div className="participant-task-card participant-finished-card">
          <p className="eyebrow">Participant evaluation complete</p>
          <h1>All guided participant tasks are stored.</h1>
          <p>Results are linked to the signed-in account <strong>{user?.email}</strong> through this evaluation session. Reflection text is not copied into the evaluation telemetry.</p>
          <div className="participant-finish-summary">
            <span><strong>{completedTaskIds.length || TASKS.length}</strong><small>guided tasks stored</small></span>
            <span><strong>R1–R10, R12–R14</strong><small>participant-facing evidence</small></span>
            <span><strong>R11</strong><small>still requires privacy/domain expert review</small></span>
          </div>
          <p className="evaluation-study-note">Evaluation-created reflections can now be removed from the normal journal history while the measurements and requirement results remain in the evaluation database.</p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="participant-task-intro-actions">
            <button className="secondary-button" type="button" onClick={onFinish}>Keep fixtures for now</button>
            <button className="primary-button" type="button" onClick={() => { void cleanupAndFinish(); }} disabled={cleaning}>{cleaning ? "Cleaning up…" : "Clean evaluation fixtures & continue →"}</button>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "intro") return taskIntro();

  if (phase === "task-complete") {
    return (
      <section className="participant-task-intro page-enter">
        <div className="participant-task-card task-complete-card">
          <p className="eyebrow">Task {taskIndex + 1} stored</p>
          <h1>{task.title} complete.</h1>
          <p>Timing, observed actions, and any scored comprehension responses were saved automatically under the current evaluation session.</p>
          <div className="task-complete-metrics"><span>{formatElapsed(Number(objective.duration_ms ?? (taskStartedAt ? Date.now() - taskStartedAt : 0)))}</span><span>{task.requirements.join(" · ")}</span></div>
          <button className="primary-button" type="button" onClick={nextTask}>Next task →</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`participant-evaluation participant-task-${task.id}`}>
      {taskBanner()}
      <div className="participant-task-app">{renderTaskUI()}</div>
      {checkpointOverlay()}
      {savingTask ? <div className="participant-saving-toast">Saving evaluation result…</div> : null}
      {error ? <div className="participant-error-toast" role="alert">{error}</div> : null}
    </section>
  );
}
