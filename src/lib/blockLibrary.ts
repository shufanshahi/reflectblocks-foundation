export type BlockRole =
  | "experience"
  | "reaction"
  | "exploration"
  | "interpretation"
  | "reflection"
  | "action";

export type PortSide = "top" | "right" | "bottom" | "left";

export type RelationType =
  | "related_to"
  | "led_to"
  | "caused"
  | "triggered"
  | "made_me_feel"
  | "made_me_think"
  | "influenced"
  | "because"
  | "supports"
  | "contrasts_with"
  | "depends_on"
  | "revealed"
  | "helped_me_realize"
  | "matters_because"
  | "changed_into"
  | "reminds_me_of"
  | "next_time"
  | "custom";

export type BlockCategory = {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  tint: string;
  role: BlockRole;
};

export type LibraryBlock = {
  id: string;
  category: string;
  question: string;
};

export const ROLE_LABELS: Record<BlockRole, string> = {
  experience: "Experience",
  reaction: "Reaction",
  exploration: "Explore",
  interpretation: "Meaning",
  reflection: "Reflect",
  action: "Action",
};

export const BLOCK_CATEGORIES: BlockCategory[] = [
  { id: "situation", label: "Situation & context", shortLabel: "Situation", icon: "◎", color: "#4f7cac", tint: "#eef5fb", role: "experience" },
  { id: "feelings", label: "Feelings", shortLabel: "Feelings", icon: "♥", color: "#8b5fbf", tint: "#f5effb", role: "reaction" },
  { id: "thoughts", label: "Thoughts", shortLabel: "Thoughts", icon: "◌", color: "#5964b2", tint: "#eef0fb", role: "reaction" },
  { id: "body", label: "Body & energy", shortLabel: "Body", icon: "◐", color: "#3f8f8a", tint: "#edf8f6", role: "reaction" },
  { id: "people", label: "People & relationships", shortLabel: "People", icon: "◉", color: "#bb6f4f", tint: "#fbf2ee", role: "experience" },
  { id: "challenges", label: "Challenges", shortLabel: "Challenges", icon: "▲", color: "#c8862f", tint: "#fcf4e8", role: "exploration" },
  { id: "meaning", label: "Meaning & values", shortLabel: "Meaning", icon: "◆", color: "#7d669b", tint: "#f4f0f8", role: "interpretation" },
  { id: "learning", label: "Learning & perspective", shortLabel: "Learning", icon: "✦", color: "#4f8b5f", tint: "#eef7f0", role: "reflection" },
  { id: "positive", label: "Gratitude & positives", shortLabel: "Positive", icon: "☀", color: "#b38a28", tint: "#fbf7e8", role: "reflection" },
  { id: "next", label: "Next steps", shortLabel: "Next steps", icon: "→", color: "#347e87", tint: "#edf7f8", role: "action" },
];

export const RELATION_OPTIONS: { id: RelationType; label: string; group: string }[] = [
  { id: "related_to", label: "is related to", group: "General" },
  { id: "led_to", label: "led to / resulted in", group: "Cause & sequence" },
  { id: "caused", label: "caused", group: "Cause & sequence" },
  { id: "triggered", label: "triggered", group: "Cause & sequence" },
  { id: "influenced", label: "influenced", group: "Cause & sequence" },
  { id: "because", label: "happened because of", group: "Cause & sequence" },
  { id: "made_me_feel", label: "made me feel", group: "Inner response" },
  { id: "made_me_think", label: "made me think", group: "Inner response" },
  { id: "revealed", label: "revealed", group: "Meaning" },
  { id: "helped_me_realize", label: "helped me realize", group: "Meaning" },
  { id: "matters_because", label: "matters because", group: "Meaning" },
  { id: "changed_into", label: "changed into", group: "Change" },
  { id: "supports", label: "supports", group: "Comparison" },
  { id: "contrasts_with", label: "contrasts with", group: "Comparison" },
  { id: "depends_on", label: "depends on", group: "Comparison" },
  { id: "reminds_me_of", label: "reminds me of", group: "Connection" },
  { id: "next_time", label: "next time / leads to action", group: "Action" },
  { id: "custom", label: "custom relationship…", group: "Custom" },
];

const SUGGESTED_NEXT: Record<BlockRole, BlockRole[]> = {
  experience: ["reaction", "exploration", "interpretation", "reflection"],
  reaction: ["exploration", "interpretation", "reflection", "action"],
  exploration: ["interpretation", "reflection", "action"],
  interpretation: ["reflection", "action", "reaction"],
  reflection: ["action", "reflection", "experience"],
  action: ["reflection", "experience"],
};

export const BLOCK_LIBRARY: LibraryBlock[] = [
  { id: "situation-1", category: "situation", question: "What happened?" },
  { id: "situation-2", category: "situation", question: "What part of this experience stands out most?" },
  { id: "situation-3", category: "situation", question: "What happened just before this?" },
  { id: "situation-4", category: "situation", question: "What happened afterwards?" },
  { id: "situation-5", category: "situation", question: "What details do you want to remember?" },
  { id: "situation-6", category: "situation", question: "What still feels unfinished about the situation?" },

  { id: "feelings-1", category: "feelings", question: "How did you feel in the moment?" },
  { id: "feelings-2", category: "feelings", question: "How do you feel about it now?" },
  { id: "feelings-3", category: "feelings", question: "Which feeling was strongest?" },
  { id: "feelings-4", category: "feelings", question: "Did your feelings change as things unfolded?" },
  { id: "feelings-5", category: "feelings", question: "What surprised you emotionally?" },
  { id: "feelings-6", category: "feelings", question: "What feeling is hardest to put into words?" },

  { id: "thoughts-1", category: "thoughts", question: "What was going through your mind?" },
  { id: "thoughts-2", category: "thoughts", question: "What did you expect would happen?" },
  { id: "thoughts-3", category: "thoughts", question: "What assumption were you making?" },
  { id: "thoughts-4", category: "thoughts", question: "What kept replaying in your mind?" },
  { id: "thoughts-5", category: "thoughts", question: "What are you still unsure about?" },
  { id: "thoughts-6", category: "thoughts", question: "What would you like to understand better?" },

  { id: "body-1", category: "body", question: "How was your energy at the time?" },
  { id: "body-2", category: "body", question: "Did you notice any physical reaction?" },
  { id: "body-3", category: "body", question: "When did you feel most relaxed?" },
  { id: "body-4", category: "body", question: "When did you feel most tense?" },
  { id: "body-5", category: "body", question: "Did tiredness, hunger, or stress affect the experience?" },
  { id: "body-6", category: "body", question: "What helped you settle or focus?" },

  { id: "people-1", category: "people", question: "Who was involved?" },
  { id: "people-2", category: "people", question: "How did someone else's words or actions affect the situation?" },
  { id: "people-3", category: "people", question: "What did you wish you could say?" },
  { id: "people-4", category: "people", question: "What conversation mattered most?" },
  { id: "people-5", category: "people", question: "Did you feel understood? Why or why not?" },
  { id: "people-6", category: "people", question: "Is there someone you want to appreciate or check in with?" },

  { id: "challenges-1", category: "challenges", question: "What was the hardest part?" },
  { id: "challenges-2", category: "challenges", question: "What made this difficult?" },
  { id: "challenges-3", category: "challenges", question: "Was there a specific moment when things shifted?" },
  { id: "challenges-4", category: "challenges", question: "What was within your control, and what was not?" },
  { id: "challenges-5", category: "challenges", question: "What did you avoid or postpone?" },
  { id: "challenges-6", category: "challenges", question: "What obstacle kept coming up?" },

  { id: "meaning-1", category: "meaning", question: "Why did this matter to you?" },
  { id: "meaning-2", category: "meaning", question: "What did this reveal about what you care about?" },
  { id: "meaning-3", category: "meaning", question: "Which value felt important here?" },
  { id: "meaning-4", category: "meaning", question: "Did anything conflict with what you wanted?" },
  { id: "meaning-5", category: "meaning", question: "What felt worth protecting or prioritizing?" },
  { id: "meaning-6", category: "meaning", question: "What would a good outcome look like to you?" },

  { id: "learning-1", category: "learning", question: "What did you learn from this?" },
  { id: "learning-2", category: "learning", question: "What would you do differently next time?" },
  { id: "learning-3", category: "learning", question: "What would you choose to repeat?" },
  { id: "learning-4", category: "learning", question: "What turned out differently than you expected?" },
  { id: "learning-5", category: "learning", question: "What can you see now that you couldn't see in the moment?" },
  { id: "learning-6", category: "learning", question: "What would you want your future self to remember?" },

  { id: "positive-1", category: "positive", question: "What went well?" },
  { id: "positive-2", category: "positive", question: "What are you grateful for in this experience?" },
  { id: "positive-3", category: "positive", question: "Who or what helped?" },
  { id: "positive-4", category: "positive", question: "What small moment felt good?" },
  { id: "positive-5", category: "positive", question: "What are you proud you handled?" },
  { id: "positive-6", category: "positive", question: "What positive detail would you like to remember?" },

  { id: "next-1", category: "next", question: "What is one next step you can take?" },
  { id: "next-2", category: "next", question: "What could you do tomorrow?" },
  { id: "next-3", category: "next", question: "What do you want to let go of?" },
  { id: "next-4", category: "next", question: "What do you want to make more time for?" },
  { id: "next-5", category: "next", question: "Is there a conversation or action you want to follow up on?" },
  { id: "next-6", category: "next", question: "What intention do you want to carry forward?" },
];

export function getCategory(id: string): BlockCategory {
  return BLOCK_CATEGORIES.find((category) => category.id === id) ?? BLOCK_CATEGORIES[0];
}

export function getRelationLabel(type: RelationType, customLabel?: string | null): string {
  if (type === "custom" && customLabel?.trim()) return customLabel.trim();
  return RELATION_OPTIONS.find((item) => item.id === type)?.label ?? "is related to";
}

export function inferRelation(sourceCategory: string, targetCategory: string): RelationType {
  const source = getCategory(sourceCategory);
  const target = getCategory(targetCategory);

  if (target.id === "feelings" || target.id === "body") return "made_me_feel";
  if (target.id === "thoughts") return "made_me_think";
  if (target.role === "exploration" && ["experience", "reaction"].includes(source.role)) return "because";
  if (["exploration", "interpretation"].includes(source.role) && ["interpretation", "reflection"].includes(target.role)) return "helped_me_realize";
  if (target.id === "meaning") return "matters_because";
  if (["reflection", "interpretation"].includes(source.role) && target.role === "action") return "next_time";
  if (source.role === target.role) return "related_to";
  return "led_to";
}

export function suggestedNextCategories(sourceCategory: string): string[] {
  const sourceRole = getCategory(sourceCategory).role;
  const nextRoles = SUGGESTED_NEXT[sourceRole];
  return BLOCK_CATEGORIES.filter((category) => nextRoles.includes(category.role)).map((category) => category.id);
}
