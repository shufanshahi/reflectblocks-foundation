import type { PortSide, RelationType } from "./lib/blockLibrary";

export type Reflection = {
  id: string;
  quick_thought: string;
  created_at: number;
  updated_at: number;
  generated_entry_title: string | null;
  generated_entry_updated_at: number | null;
  free_writing_title: string | null;
  free_writing_updated_at: number | null;
};

export type SavedBlock = {
  id: string;
  library_block_id: string | null;
  category: string;
  question: string;
  answer: string;
  position_x: number;
  position_y: number;
  order_index: number;
  created_at?: number;
  updated_at?: number;
};

export type SavedConnection = {
  id: string;
  source_block_id: string;
  target_block_id: string;
  relation_type: RelationType;
  source_port: PortSide;
  target_port: PortSide;
  relation_label: string | null;
  created_at?: number;
  updated_at?: number;
};

export type ReflectionDetail = Reflection & {
  blocks: SavedBlock[];
  connections: SavedConnection[];
};

export type WorkspaceSaveResult = {
  blocks: SavedBlock[];
  connections: SavedConnection[];
};


export type FreeWritingEntry = {
  id: string;
  reflection_id: string;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
};

export type RequirementCheckStatus = "not_tested" | "pass" | "issue" | "critical";

export type EvaluationRequirementCheck = {
  requirement_id: string;
  status: RequirementCheckStatus;
  evidence: Record<string, string | number | boolean | null>;
  notes: string;
  updated_at: number;
};

export type EvaluationGovernanceReview = {
  reviewer_role: string;
  data_flow_ok: boolean | null;
  retention_ok: boolean | null;
  processing_notice_ok: boolean | null;
  prompt_wording_ok: boolean | null;
  explainability_ok: boolean | null;
  trust_calibration_ok: boolean | null;
  human_control_ok: boolean | null;
  fairness_ok: boolean | null;
  prompt_flags_count: number;
  notes: string;
  reviewed_at: number;
};

export type EvaluationSessionExport = {
  session: {
    id: string;
    user_email?: string;
    participant_code: string;
    device_type: string;
    age_group: string;
    text_editing_experience: string;
    started_at: number;
    completed_at: number | null;
    sus: number[] | null;
    custom: Record<string, unknown> | null;
  };
  events: Array<{
    event_type: string;
    reflection_id: string | null;
    metadata: Record<string, string | number | boolean | null>;
    created_at: number;
  }>;
  requirement_checks: EvaluationRequirementCheck[];
  governance_review: EvaluationGovernanceReview | null;
  guided_tasks?: GuidedEvaluationTask[];
};

export type EvaluationProtocolState = {
  requirement_checks: EvaluationRequirementCheck[];
  governance_review: EvaluationGovernanceReview | null;
};

export type GuidedRequirementResultInput = {
  requirement_id: string;
  status: RequirementCheckStatus;
  evidence: Record<string, string | number | boolean | null>;
  notes?: string;
};

export type GuidedEvaluationTask = {
  task_id: string;
  requirement_ids: string[];
  started_at_ms: number;
  completed_at_ms: number | null;
  duration_ms: number | null;
  status: string;
  objective: Record<string, string | number | boolean | null>;
  comprehension: Record<string, string | number | boolean | null>;
  reflection_id: string | null;
};

export type AutomatedEvaluationCheck = {
  name: string;
  passed: boolean | null;
  detail: string;
};

export type AutomatedEvaluationResult = {
  requirement_id: string;
  title: string;
  automation_level: "automated" | "partial" | "human_required";
  status: "pass" | "fail" | "manual_required";
  checks: AutomatedEvaluationCheck[];
  human_reason: string;
  duration_ms: number;
};

export type AutomatedEvaluationRun = {
  id: string;
  started_at: number;
  completed_at: number;
  overall_status: string;
  summary: Record<string, number>;
  results: AutomatedEvaluationResult[];
};

export type AutomatedEvaluationRunSummary = Omit<AutomatedEvaluationRun, "results">;

export type PromptPreferences = {
  prompt_behavior: "manual" | "starter";
};

export type AIConfig = {
  enabled: boolean;
  model: string;
  suggestionModel: string;
  journalModel: string;
  disclosure: string;
  freeTierNotice: string;
  keySource: string;
  envFileFound: boolean;
};

export type AISuggestion = {
  question: string;
  category: string;
  why: string;
  connect_from_block_id: string | null;
  relation_type: RelationType;
};

export type JournalParagraph = {
  id: string;
  text: string;
  source_block_ids: string[];
  uses_quick_thought: boolean;
};

export type JournalDraft = {
  model: string;
  title: string;
  paragraphs: JournalParagraph[];
};

export type JournalSourceSnapshot = {
  kind: "quick_thought" | "block";
  block_id: string | null;
  category: string | null;
  question: string | null;
  text: string;
};

export type SavedGeneratedParagraph = JournalParagraph & {
  sources: JournalSourceSnapshot[];
};

export type SavedGeneratedEntry = {
  id: string;
  reflection_id: string;
  model: string;
  title: string;
  paragraphs: SavedGeneratedParagraph[];
  created_at: number;
  updated_at: number;
};

async function getErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export async function getReflections(): Promise<Reflection[]> {
  const response = await fetch("/api/reflections", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as Reflection[];
}

export async function createReflection(quickThought: string): Promise<Reflection> {
  const response = await fetch("/api/reflections", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quick_thought: quickThought }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as Reflection;
}

export async function getReflection(id: string): Promise<ReflectionDetail> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(id)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as ReflectionDetail;
}

export async function saveReflectionWorkspace(
  id: string,
  blocks: SavedBlock[],
  connections: SavedConnection[],
): Promise<WorkspaceSaveResult> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(id)}/workspace`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: blocks.map(({ created_at: _createdAt, updated_at: _updatedAt, ...block }) => block),
      connections: connections.map(({ created_at: _createdAt, updated_at: _updatedAt, ...connection }) => connection),
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as WorkspaceSaveResult;
}

export async function getAIConfig(): Promise<AIConfig> {
  const response = await fetch("/api/ai/config", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as AIConfig;
}

export async function requestAISuggestions(
  reflectionId: string,
  blocks: SavedBlock[],
  connections: SavedConnection[],
): Promise<AISuggestion[]> {
  const response = await fetch(`/api/ai/reflections/${encodeURIComponent(reflectionId)}/suggestions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: blocks.map(({ created_at: _createdAt, updated_at: _updatedAt, ...block }) => block),
      connections: connections.map(({ created_at: _createdAt, updated_at: _updatedAt, ...connection }) => connection),
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = (await response.json()) as { suggestions: AISuggestion[] };
  return payload.suggestions;
}

export async function requestJournalDraft(
  reflectionId: string,
  selectedBlocks: SavedBlock[],
  selectedConnections: SavedConnection[],
  includeQuickThought: boolean,
  signal?: AbortSignal,
): Promise<JournalDraft> {
  const response = await fetch(`/api/ai/reflections/${encodeURIComponent(reflectionId)}/journal`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_quick_thought: includeQuickThought,
      blocks: selectedBlocks.map(({ created_at: _createdAt, updated_at: _updatedAt, ...block }) => block),
      connections: selectedConnections.map(({ created_at: _createdAt, updated_at: _updatedAt, ...connection }) => connection),
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as JournalDraft;
}


export async function getSavedGeneratedEntry(
  reflectionId: string,
): Promise<SavedGeneratedEntry | null> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(reflectionId)}/generated-entry`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = (await response.json()) as { entry: SavedGeneratedEntry | null };
  return payload.entry;
}

export async function saveGeneratedEntry(
  reflectionId: string,
  draft: JournalDraft,
  sourcesByParagraphId: Record<string, JournalSourceSnapshot[]>,
): Promise<SavedGeneratedEntry> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(reflectionId)}/generated-entry`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: draft.model,
      title: draft.title,
      paragraphs: draft.paragraphs.map((paragraph) => ({
        id: paragraph.id,
        text: paragraph.text,
        sources: sourcesByParagraphId[paragraph.id] ?? [],
      })),
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as SavedGeneratedEntry;
}


export async function createFreeWriting(title: string, body: string): Promise<{ reflection_id: string; entry: FreeWritingEntry }> {
  const response = await fetch("/api/free-writing", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as { reflection_id: string; entry: FreeWritingEntry };
}

export async function getFreeWriting(reflectionId: string): Promise<FreeWritingEntry | null> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(reflectionId)}/free-writing`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = (await response.json()) as { entry: FreeWritingEntry | null };
  return payload.entry;
}

export async function saveFreeWriting(reflectionId: string, title: string, body: string): Promise<FreeWritingEntry> {
  const response = await fetch(`/api/reflections/${encodeURIComponent(reflectionId)}/free-writing`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as FreeWritingEntry;
}

async function deleteEndpoint(url: string): Promise<void> {
  const response = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

export function deleteFreeWriting(reflectionId: string) {
  return deleteEndpoint(`/api/reflections/${encodeURIComponent(reflectionId)}/free-writing`);
}

export function deleteGeneratedEntry(reflectionId: string) {
  return deleteEndpoint(`/api/reflections/${encodeURIComponent(reflectionId)}/generated-entry`);
}

export function deleteWorkspaceContent(reflectionId: string) {
  return deleteEndpoint(`/api/reflections/${encodeURIComponent(reflectionId)}/workspace`);
}

export function deleteReflection(reflectionId: string) {
  return deleteEndpoint(`/api/reflections/${encodeURIComponent(reflectionId)}`);
}

export async function startEvaluationSession(
  participantCode: string,
  deviceType: string,
  ageGroup = "not_provided",
  textEditingExperience = "not_provided",
): Promise<{ session_id: string; started_at: number }> {
  const response = await fetch("/api/evaluation/sessions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participant_code: participantCode,
      device_type: deviceType,
      age_group: ageGroup,
      text_editing_experience: textEditingExperience,
      consented: true,
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as { session_id: string; started_at: number };
}

export async function recordUsabilityEvent(
  sessionId: string,
  eventType: string,
  reflectionId: string | null = null,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const response = await fetch("/api/evaluation/events", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, event_type: eventType, reflection_id: reflectionId, metadata }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

export async function completeEvaluationSession(
  sessionId: string,
  sus: number[],
  easeRating: number,
  controlRating: number,
  privacyClarityRating: number,
  comments: string,
): Promise<void> {
  const response = await fetch("/api/evaluation/sessions/complete", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      sus,
      ease_rating: easeRating,
      control_rating: controlRating,
      privacy_clarity_rating: privacyClarityRating,
      comments,
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

export async function getEvaluationExport(sessionId: string): Promise<EvaluationSessionExport> {
  const response = await fetch(`/api/evaluation/sessions/${encodeURIComponent(sessionId)}/export`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as EvaluationSessionExport;
}


export async function saveEvaluationRequirementCheck(
  sessionId: string,
  requirementId: string,
  status: RequirementCheckStatus,
  evidence: Record<string, string | number | boolean | null>,
  notes: string,
): Promise<void> {
  const response = await fetch(
    `/api/evaluation/sessions/${encodeURIComponent(sessionId)}/requirements/${encodeURIComponent(requirementId)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, evidence, notes }),
    },
  );
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

export async function getEvaluationProtocolState(sessionId: string): Promise<EvaluationProtocolState> {
  const response = await fetch(`/api/evaluation/sessions/${encodeURIComponent(sessionId)}/protocol`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as EvaluationProtocolState;
}

export async function saveEvaluationGovernanceReview(
  sessionId: string,
  review: Omit<EvaluationGovernanceReview, "reviewed_at">,
): Promise<void> {
  const response = await fetch(`/api/evaluation/sessions/${encodeURIComponent(sessionId)}/governance`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

export async function startGuidedEvaluationTask(
  sessionId: string,
  taskId: string,
  requirementIds: string[],
): Promise<GuidedEvaluationTask> {
  const response = await fetch(`/api/evaluation/sessions/${encodeURIComponent(sessionId)}/guided-tasks/start`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, requirement_ids: requirementIds }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as GuidedEvaluationTask;
}

export async function completeGuidedEvaluationTask(
  sessionId: string,
  taskId: string,
  durationMs: number,
  status: "pass" | "issue" | "critical" | "completed",
  objective: Record<string, string | number | boolean | null>,
  comprehension: Record<string, string | number | boolean | null>,
  reflectionId: string | null,
  requirementResults: GuidedRequirementResultInput[],
): Promise<GuidedEvaluationTask> {
  const response = await fetch(
    `/api/evaluation/sessions/${encodeURIComponent(sessionId)}/guided-tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        duration_ms: durationMs,
        status,
        objective,
        comprehension,
        reflection_id: reflectionId,
        requirement_results: requirementResults,
      }),
    },
  );
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as GuidedEvaluationTask;
}

export async function getGuidedEvaluationTasks(sessionId: string): Promise<GuidedEvaluationTask[]> {
  const response = await fetch(`/api/evaluation/sessions/${encodeURIComponent(sessionId)}/guided-tasks`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as GuidedEvaluationTask[];
}

export async function getPromptPreferences(): Promise<PromptPreferences> {
  const response = await fetch("/api/preferences", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as PromptPreferences;
}

export async function savePromptPreferences(promptBehavior: PromptPreferences["prompt_behavior"]): Promise<PromptPreferences> {
  const response = await fetch("/api/preferences", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt_behavior: promptBehavior }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as PromptPreferences;
}

export async function runAutomatedEvaluation(): Promise<AutomatedEvaluationRun> {
  const response = await fetch("/api/evaluation/automated-runs", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as AutomatedEvaluationRun;
}

export async function getAutomatedEvaluationRuns(limit = 10): Promise<AutomatedEvaluationRunSummary[]> {
  const response = await fetch(`/api/evaluation/automated-runs?limit=${encodeURIComponent(String(limit))}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as AutomatedEvaluationRunSummary[];
}

export async function getAutomatedEvaluationRun(runId: string): Promise<AutomatedEvaluationRun> {
  const response = await fetch(`/api/evaluation/automated-runs/${encodeURIComponent(runId)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as AutomatedEvaluationRun;
}
