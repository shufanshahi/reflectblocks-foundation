# ReflectBlocks Evaluation Method

## 1. Evaluation Purpose

The immediate evaluation of ReflectBlocks will determine whether users can understand and use its interaction model well enough to satisfy the requirements established during the requirement-analysis study. The evaluation will not initially attempt to prove that ReflectBlocks improves mental wellbeing, produces better writing, or outperforms every conventional journaling system. Instead, it will examine whether users can:

1. capture a brief thought quickly;
2. choose how much reflective structure they want;
3. dismiss irrelevant prompts or use blank writing;
4. understand when AI generation occurs;
5. understand which information is processed;
6. distinguish their original material from system-organized language;
7. correct or remove unwanted generated text; and
8. understand what is saved, exported, retained, or permanently deleted.

This focus follows the three central findings of the requirement analysis:

- **Theme 1:** People may lose a thought before they begin writing.
- **Theme 2:** Prompts are helpful only when they are relevant and optional.
- **Theme 3:** Writers want to understand what the system changed.

## 2. Study Design

The evaluation will use a **moderated, requirement-based think-aloud usability study** with a clickable low- or medium-fidelity prototype.

During a think-aloud study, participants complete realistic tasks while verbally describing what they notice, expect, understand, and find confusing. The moderator will present each task without explaining which control to use. Neutral prompts such as “Please keep talking” or “What are you thinking now?” may be used when necessary, but the moderator will not guide participants toward the correct action.

This method is appropriate because the principal questions concern interaction sequence, labels, feedback, optionality, source transparency, and the visibility of privacy and retention choices. The prototype may use prepared AI output rather than a live language model. Consequently, the study can evaluate the interaction surrounding AI generation but cannot establish the quality, latency, or safety of a real AI model.

## 3. Evaluation Questions

The evaluation will address the following questions:

- **EQ1:** Can users capture and save a short thought before being required to select a prompt, block, or template?
- **EQ2:** Can users understand that reflection prompts are optional and choose between guided reflection and blank writing?
- **EQ3:** Can users predict when AI generation occurs and identify which information will be processed?
- **EQ4:** Can users identify the relationship between their original blocks and system-organized passages?
- **EQ5:** Can users edit, remove, or replace unwanted generated language while retaining authorship of the final entry?
- **EQ6:** Can users correctly understand the consequences of saving, exporting, retaining, or deleting different forms of their writing?
- **EQ7:** Are the provisional requirements concerning prompt preferences, accessibility, and block customization supported by observed participant behavior?

## 4. Participants

Approximately **eight participants** will be recruited. Participants should include people who currently journal, journal occasionally, previously journaled but stopped, or use other methods such as notes or voice recordings to capture personal experiences.

The sample should include variation in:

- age;
- digital and text-editing experience;
- journaling frequency;
- familiarity with AI tools;
- preference for structured or unstructured writing; and
- previous use of journaling or note-taking applications.

The earlier requirement study involved eight family or relative participants, all above age 45. Therefore, the evaluation should deliberately include both younger and older participants and people with different levels of digital experience. This will help examine whether requirement R9 generalizes beyond the original sample.

Participants will not be required to disclose real sensitive experiences. The study will use neutral fictional scenarios, and participants may invent all journal content.

## 5. Materials

The study will require:

- a clickable ReflectBlocks prototype;
- a participant information sheet and consent form;
- a short demographic and background questionnaire;
- a think-aloud practice task;
- five usability tasks;
- a task-observation sheet;
- a post-study interview guide; and
- an optional System Usability Scale questionnaire.

The prototype should include the following interaction states:

- quick one-sentence capture;
- optional reflection blocks;
- prompt dismissal;
- blank-writing mode;
- block selection;
- an explicit “Organize my entry” action;
- a processing or privacy notice;
- a prepared generated entry with source indicators;
- direct editing of generated text;
- independent save and delete controls; and
- clear confirmation for irreversible deletion.

## 6. Study Procedure

Each session will take approximately **30–45 minutes**.

### 6.1 Introduction and Consent

The moderator will explain the purpose of the study, what participation involves, how observations will be recorded, and how the data will be handled. Participants will be reminded that the system is being evaluated, not their writing ability. They may skip any question or stop participating at any time.

### 6.2 Background Questionnaire

The questionnaire will collect:

- age range;
- academic or occupational background;
- journaling frequency;
- previous journaling experience;
- experience with note-taking applications;
- confidence with text-editing applications; and
- familiarity with ChatGPT or other AI tools.

### 6.3 Think-Aloud Practice

Before the main tasks, participants will complete a simple unrelated practice activity while speaking aloud. The moderator will demonstrate the expected level of verbalization without revealing how the ReflectBlocks tasks should be completed.

### 6.4 Main Tasks

Participants will complete five tasks corresponding to the established requirements.

## 7. Evaluation Tasks

### 7.1 Task 1: Quick-Thought Capture

**Scenario:**

> You have just completed a presentation and feel nervous about how it went. Record one short thought before you forget it.

The participant will begin from the ReflectBlocks entry screen. The moderator will observe whether the participant can locate the capture field, enter one sentence, and save it without selecting a prompt or template.

**Requirements tested:** R1 and R9.

**Evidence collected:**

- completion time;
- task success;
- number of taps or actions;
- hesitation;
- errors;
- requests for help; and
- whether the participant selects an unnecessary prompt or menu.

**Decision rule:**

- At least seven of eight participants should save the thought within the specified target time.
- Every participant should locate the basic capture action without moderator assistance.
- If the five-second target excludes typing time, the report must state that it measures the time required to locate and initiate the capture action.

### 7.2 Task 2: Optional Prompts and Blank Writing

The prototype will display several reflection prompts, including one that is deliberately inappropriate for the scenario. The participant will be told:

> Continue reflecting in whichever way feels most appropriate.

The moderator will not tell the participant to dismiss a prompt or select blank writing.

**Requirements tested:** R2, R3, R6, and R13.

**Evidence collected:**

- whether prompts are understood as optional;
- whether the irrelevant prompt can be dismissed directly;
- whether unanswered prompts can be skipped;
- whether blank writing is noticed and accessible;
- whether participants use or request persistent prompt preferences; and
- whether participants attempt to edit, add, or rearrange blocks.

**Decision rule:**

The interaction must be revised if any participant believes that all prompts are mandatory or cannot dismiss an irrelevant prompt directly. Requirements R3 and R13 will remain provisional unless at least two participants independently identify a realistic reason to use persistent prompt settings or block customization.

### 7.3 Task 3: Explicit Generation and Processing Notice

Several blocks will contain sample responses. The participant will be asked:

> Organize this material into a journal entry.

Before generation, the prototype will display a plain-language processing notice. Participants will then answer the following comprehension questions in their own words:

1. Has generation already happened?
2. What will happen after the generation button is pressed?
3. Which blocks will be processed?
4. Will previous entries be included?
5. Who will receive the selected text?
6. Why is the information being sent?
7. Can the request be cancelled?

**Requirements tested:** R4, R7, and R10.

**Evidence collected:**

- prediction before generation;
- processing-notice comprehension;
- understanding of selected versus unselected data;
- understanding of external processing; and
- errors or misconceptions.

**Decision rule:**

The design must be revised before further implementation if any participant believes that generation happens automatically or cannot determine which material will be processed. A misunderstanding about external processing is a critical breakdown even if the participant eventually completes the task.

### 7.4 Task 4: Source Identification and Editing

The prototype will display a prepared generated entry containing visible source indicators. One generated sentence will deliberately change or oversimplify the tone of the original material.

The participant will be asked:

> Find where the highlighted sentence came from. The sentence does not properly represent your meaning. Correct or remove it.

**Requirements tested:** R5 and R12.

**Evidence collected:**

- whether the source indicator is noticed without prompting;
- correct identification of the originating block;
- recognition of the meaning change;
- successful editing or deletion of the problematic sentence; and
- understanding that the edited version will be saved or exported.

**Decision rule:**

At least seven of eight participants should identify the correct source and modify or remove the unsuitable sentence without moderator instruction. Otherwise, the source indicator or editing interaction must be revised.

### 7.5 Task 5: Saving, Exporting, and Deleting

Participants will complete several retention requests:

1. Save the original blocks but not the generated entry.
2. Save the edited entry while removing one original block.
3. Export the entry.
4. Delete the generated entry while retaining the blocks.
5. Delete everything.
6. Leave without saving anything.

After each action, the participant will be asked:

> What information do you believe still exists?

**Requirements tested:** R8 and R14.

**Evidence collected:**

- successful completion of each retention task;
- correct prediction of the remaining information;
- understanding of irreversible deletion;
- hesitation and errors; and
- reactions to confirmation messages.

**Decision rule:**

At least seven of eight participants should correctly predict what remains after each action. Any misunderstanding involving irreversible deletion is a critical failure requiring revision of the labels, sequence, notice, or confirmation design.

## 8. Requirement-to-Evaluation Mapping

| Requirement | Evaluation activity | Primary evidence |
|---|---|---|
| R1 | Quick-thought capture | Completion time and successful save |
| R2 | Dismiss an irrelevant prompt | Direct dismissal without help |
| R3 | Configure prompt preference | Usefulness and persistence across sessions |
| R4 | Explicit generation task | Correct prediction that generation has not already occurred |
| R5 | Source-identification task | Correct identification of a passage’s originating block |
| R6 | Blank-writing task | Entry completed without invoking AI generation |
| R7 | Processing-notice task | Correct identification of the selected data sent for processing |
| R8 | Independent deletion task | Correct prediction of retained and deleted material |
| R9 | Quick capture across experience levels | Successful completion without hidden gestures or menus |
| R10 | Privacy-notice comprehension | Explanation of what leaves the device, to whom, and why |
| R11 | Privacy or domain-expert review | No unresolved harmful, clinical-sounding, or misleading prompt wording |
| R12 | Generated-text correction | Problematic sentence successfully edited or removed |
| R13 | Block customization task | Observed need and successful use |
| R14 | Retention-choice task | Correct outcomes for save, export, delete, and save-nothing choices |

## 9. Data Collection

### 9.1 Quantitative Measures

For each task, the research team will record:

- task completion: success or failure;
- completion time;
- number of errors;
- number of unnecessary actions;
- number of moderator interventions;
- number and duration of hesitations;
- correct comprehension responses; and
- successful recovery from errors.

Task success will be calculated as:

$$
\text{Task Success Rate} =
\frac{\text{Participants completing the task without help}}
{\text{Total participants}}
\times 100.
$$

Usability problems may be assigned the following severity levels:

| Severity | Interpretation |
|---|---|
| 0 | No observable problem |
| 1 | Minor confusion; task completed independently |
| 2 | Significant difficulty, hesitation, or inefficient workaround |
| 3 | Task cannot be completed without moderator help |
| 4 | Critical misunderstanding involving privacy, authorship, or irreversible deletion |

### 9.2 Qualitative Evidence

The researchers will record:

- think-aloud comments;
- incorrect expectations;
- misunderstandings;
- workarounds;
- reactions to optional prompts;
- reactions to blank-writing mode;
- perceptions of AI-generated language;
- privacy and data-retention concerns;
- perceived authorship and control; and
- recommendations for improvement.

Possible initial codes include capture hesitation, prompt fatigue, prompt perceived as mandatory, blank mode not noticed, generation boundary unclear, processing notice misunderstood, source indicator overlooked, AI meaning distortion, editing uncertainty, deletion uncertainty, authorship preserved, and control over the final entry. These examples will guide attention but will not be treated as predetermined final themes.

## 10. Post-Study Interview

After completing the tasks, participants will be asked:

1. Which part of the system was easiest?
2. Which part was most confusing?
3. Did the reflection prompts feel optional?
4. Did you ever feel forced to use AI?
5. At what point did you believe your text was sent for AI processing?
6. Could you distinguish your own material from system-organized wording?
7. Did the final entry still feel like your writing?
8. Were the saving and deletion choices clear?
9. Would you prefer fixed prompts, changing prompts, or blank writing?
10. Which feature would you remove, simplify, or change?

The System Usability Scale may be administered as a secondary measure. However, SUS will not replace task-based evidence because a high SUS score does not demonstrate correct understanding of source attribution, data processing, or deletion.

## 11. Analysis

### 11.1 Quantitative Analysis

The study will primarily use descriptive statistics because of the small sample and requirement-validation purpose. The report will present:

- task-success counts and percentages;
- median and range of completion times;
- error counts;
- moderator-assistance counts;
- comprehension accuracy; and
- problem-severity distributions.

Inferential hypothesis testing is not the principal analysis for this eight-participant formative evaluation. The evidence will instead be judged against the requirement-level decision rules.

### 11.2 Qualitative Analysis

Think-aloud comments, observations, and post-study interviews will be analyzed using thematic analysis:

1. organize and anonymize session notes;
2. read all notes and create participant summaries;
3. assign short codes to relevant observations;
4. compare codes across participants;
5. group related codes into candidate themes;
6. review themes against the original evidence;
7. retain negative and divergent cases; and
8. connect each theme to the relevant requirement and design decision.

The final report should include representative anonymized quotations or paraphrased observations and explain how each finding affects the corresponding requirement.

## 12. Technical and Expert Verification

The user study cannot prove that a production backend sends only selected blocks, permanently deletes data from servers and backups, or stores information securely. Therefore:

- R7 requires technical verification of the data sent to the AI provider;
- R8 requires backend and storage verification of deletion behavior;
- R10 requires inspection of the processing notice and actual data flow; and
- R11 requires privacy or domain-expert review of prompt wording and safeguards.

These requirements must not be reported as satisfied solely because participants understood the interface.

## 13. Ethics and Safety

The study will use neutral fictional scenarios instead of requesting real sensitive journal entries. Participants may invent all content. No participant names or identifying information will appear in the report. Participants may skip tasks, decline to answer questions, or withdraw at any time.

ReflectBlocks will be presented as a reflective-writing tool, not as therapy, diagnosis, crisis support, or an autonomous interpretation of a participant’s psychological state. The prototype will not evaluate whether a participant’s emotions are correct or provide clinical advice.

## 14. Scope of Claims

This formative evaluation may support claims that:

- users can or cannot understand the ReflectBlocks interaction model;
- particular controls, notices, and source indicators are usable;
- the priority requirements are satisfied or require revision;
- participants understand when AI processing occurs;
- participants can maintain control over generated wording; and
- participants understand saving and deletion choices.

It will not support claims that:

- ReflectBlocks improves wellbeing;
- ReflectBlocks produces objectively better writing;
- ReflectBlocks reduces cognitive workload;
- ReflectBlocks is superior to ordinary journaling tools;
- the AI produces consistently accurate or helpful reflections; or
- the production infrastructure securely and permanently deletes all information.

## 15. Later Comparative Evaluation

After the prototype has been revised and implemented, a second-stage evaluation may compare ReflectBlocks with a conventional unstructured editor. A counterbalanced within-subject mixed-method experiment would then be appropriate. Participants would complete equivalent reflection tasks under both conditions, and the study could measure:

- independently rated reflection quality;
- cognitive workload using NASA-TLX;
- task completion time;
- perceived reflection support;
- agency and authorship;
- AI acceptance, editing, and rejection behavior;
- System Usability Scale scores; and
- interview themes.

This later study would examine effectiveness. The immediate requirement-based walkthrough examines whether the conceptual model is understandable and usable enough to justify that later experiment.

## 16. Report-Ready Method Summary

> We will conduct a moderated think-aloud usability evaluation of a clickable ReflectBlocks prototype. Approximately eight participants with varied journaling habits, ages, and digital experience will complete five requirement-based tasks: capturing a thought, managing optional prompts and blank writing, explicitly requesting generation, inspecting and editing generated content through source links, and controlling saved or deleted material. We will record task success, completion time, errors, hesitation, moderator assistance, comprehension, and participant comments. Observations and interviews will be analyzed thematically and traced to requirements R1–R14. Privacy, unintended generation, authorship, and irreversible-deletion misunderstandings will be treated as critical failures requiring design revision. Technical data-flow and deletion requirements will be verified separately because interface comprehension alone cannot establish backend compliance.

## 17. Methodological Basis in Related Work

The evaluation design combines practices observed in the related systems reviewed for this project:

- **Actor’s Note** demonstrates the value of task measures, validated questionnaires, interaction logs, and qualitative interviews.
- **JournalAIde** combines controlled task evaluation with later naturalistic use and evaluates confidence, engagement, writing support, and feature interaction.
- **ExploreSelf** demonstrates the use of interaction logs and post-session qualitative analysis for understanding reflective exploration.
- **DiaryMate** shows how system logs and in-situ accounts can explain users’ acceptance, editing, and rejection of AI-generated writing.
- **Augmentiary** emphasizes longitudinal questions of authorship, agency, source visibility, and the acceptance or rejection of AI interpretations.
- **InMyDay** illustrates the importance of accessibility and accommodating users with different levels of digital experience.

For the current ReflectBlocks stage, these methods are narrowed to a formative, requirement-based walkthrough. More extensive comparative and longitudinal methods should be used only after the principal interaction and comprehension problems have been revised.
