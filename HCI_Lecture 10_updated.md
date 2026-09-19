CSE 4849 Human Computer Interaction (HCI) Lecture 10: Evaluation of design 

Summer 2025 Dr. Hasan Mahmud | hasan@iut-dhaka.edu 

# Overview 

• What is evaluation 

• Why, what, where, and when 

• Evaluation approaches 

• Inspection 

- Heuristic evaluation 



- Cognitive walkthrough 

CSE 4849 | HCI | Summer 2025 

2 

- Evaluation of design 

- • Using evaluation, designers make sure that their software is usable and is what users want. 

- • Evaluation is the process of  systematically collecting data that informs us about what it is like for a **particular user** or group of users to use a product for a **particular task** in a **certain type of environment.** 

- • The  basic premise of  user-centered design  is  that users' needs are taken into account throughout design and development. This is achieved by evaluating the design at various stages as it develops and by amending it to suit users needs. 

- • The design, therefore, progresses in iterative cycles of design, evaluate, and redesign. CSE 4849 | HCI | Summer 2025 3 

- <mark>a</mark> 

### Why, what, where and when to evaluate 

- Iterative design and evaluation is a continuous process that examines: — 

- ue 

- • Why: to check that users can use the product and that they like it. 

- • What: a conceptual model, early prototypes of a new system and eS Se 

- later, more complete prototypes. fram — 3 Wrholie) 

- • Where: in natural and laboratory settings. 



- When: throughout design; finished products can be evaluated to collect information to inform new products. (summative vs formative) see (Wea toor 14) cop— 

- ! 

- AR, ee? Designers need to check that they understand users’ requirements. ¥ — —— KeFa sued 5 outers - Website ov Ssellize, lelotes)? CSE 4849 | HCI | Summer 2025 

4 

- Ethics Approval 

- Fthiest Approve 

- • Institutional Research Ethics Board (IREB) • Research Ethics Committee • Institutional-Review-Board-(IRB) Herne +he va mY ional • 

CSE 4849 | HCI | Summer 2025 

5 

# * What does this data tell you? 



<!-- Start of picture text -->
Playing against Playing against<br>computer friend<br>Mean St. Dev. Mean St. Dev.<br>Boring 2.3 0.949 1.7 0.949<br>Challenging 3.6 1.08 3.9 0.994<br>Easy 2.7 0.823 2.5 0.850<br>Engaging 3.8 0.422 43 0.675<br>Exciting 3.5 0.527 4.1 0.568<br>Frustrating 2.8 1.14 2.5 0.850<br>Fun 3.9 0.738 4.6 0.699<br>Table 13.1 Mean subjective ratings given on a user satisfaction questionnaire using a five-point<br>scale, in which 1 is lowest and5 is highest for the 10 players. Identifying strongly with an experience<br>state is indicated by a higher mean. The standard deviation indicates the spread of the results around<br>the mean. Low values indicate little variation in participants’ responses, high values indicate more<br>variation<br><!-- End of picture text -->

CSE 4849 | HCI | Summer 2025 

6 

# Experiment Design 

- _Experiment design_ is the process of deciding what variables to use, what tasks and procedures to use, how many participants to use and how to solicit them, and so on 



<!-- Start of picture text -->
Source ee 4<br>(What we observe and measure) Niyo-Nel hay bla<br>Noise<br><!-- End of picture text -->

- Signal → a variable of interest 

- Noise → everything else (random influences) 

- Experiment design seeks to enhance the signal, while minimizing the noise 

CSE 4849 | HCI | Summer 2025 

7 

# Experiment Design 

- The experimental design starts with deciding experimental variable. 

- Experimental variable: Forces us to craft narrow and testable questions. 

- Type of experimental variables: 

   - Independent variables 

   - Dependent variables 

   - Control variables 

   - Random variables 

   - Confounding variables 

CSE 4849 | HCI | Summer 2025 

8 

# Independent Variable 

- An _independent variable_ (IV) is a circumstance or characteristic that is manipulated in an experiment to elicit a change in a human response while interacting with a computer. 

- “Independent” because it is independent of participant ee——_——— a 

- behavior (i.e., there is nothing a participant can do to influence an independent variable) 



<!-- Start of picture text -->
IAG AS pe<br><!-- End of picture text -->

- Examples: 



- interface, device, feedback mode, button layout, visual layout, == ( 

- age, gender, background noise, expertise, etc. 





- The terms _independent variable_ and _factor_ are synonymous 

CSE 4849 | HCI | Summer 2025 

9 

# Independent variable 

- Experiments designed with independent variables are called factorial =—<—======== 

- experiment. 

- An independent variable (IV) must have at least two levels ——— 

- • The levels, values, or settings for an IV are the _test conditions_ ———— —_—_ = 

- • Name both the factor (IV) and its levels (test conditions): 





<!-- Start of picture text -->
Factor (IV)  Levels (test conditions )<br>Device  mouse, trackball, joystick<br>ee —_—-_ _—<br>Feedback mode  audio, tactile, none<br>--- —. —_—<br>Task  pointing, dragging<br>Visualization  2D, 3D, animated<br>Es —— ABAALS AYvE<br>Search interface  ———_——— —_—_ Google, custom  Y) dee! !<br><!-- End of picture text -->

CSE 4849 | HCI | Summer 2025 

10 

## Independent variable 

- Human characteristics are non-manipulable: 

   - Human characteristics are naturally occurring attributes 

   - Examples: Gender, age, height, weight, handedness, grip strength, finger a — —_ — ooOoOr_—_— 

   - width, visual acuity, personality trait, political viewpoint, first language, —_ ny —_——— 

   - shoe size, etc. 

7 

   - They are legitimate independent variables, but they cannot be “manipulated” in the usual sense 

   - Causal relationships are difficult to obtain due to unavoidable ee 

   - confounding variables 

- How many IVs? – An experiment must have at least one independent variable — a) Independent | ———séEffects 

- – Possible to have 2, 3, or more IVs 

CSE 4849 | HCI | Summer 2025 

11 

## True experiment VS Quasi experiment 

- A **true HCI experiment** is designed to establish a **causal effect** . This means proving that a change in the independent variable (IV) directly caused a change in the dependent variable (DV). 

- Correlational analysis is used when the "independent variable" is nonmanipulable. These are pre-existing characteristics of the participants, such as age, gender, or expertise. Research using non-manipulable variables is technically a **quasi-experiment** or correlational study, not a true experiment, because it cannot prove causality. 

CSE 4849 | HCI | Summer 2025 

12 

# **Causal Effect (True Experiment)** 

In a true experiment, you are trying to prove that your independent variable **causes** a change in the dependent variable. You do this by manipulating the independent variable and controlling other factors. 

- **Practical Example: Testing the effect of an interface design on task time.** 

- **Research Question:** Does a new, simplified app menu **cause** users to complete a task faster than the old, complex menu? 

- **Independent Variable (IV): Menu design** (This is a manipulable variable). 

   - **Levels:** Old Menu vs. New Menu. 

   - **How it's manipulated:** Participants are randomly assigned to one of two groups. Group A uses the old menu, and Group B uses the new menu. 

- **Dependent Variable (DV): Task completion time** (e.g., in seconds). 

- **Conclusion:** If Group B completes the task significantly faster than Group A, we can conclude that the new menu design **caused** the reduction in task time. The random assignment and control ensure that no other factors (like user skill) systematically influenced the outcome. 

CSE 4849 | HCI | Summer 2025 

13 

# Correlation (Correlational Study) 

In a correlational study, you are trying to determine if there is a **relationship** between two or more variables, but you are not manipulating anything. You simply observe and measure pre-existing conditions. 

- **Practical Example: Investigating the relationship between user age and typing speed.** 

- • **Research Question:** Is there a **relationship** between a user's **age** and their typing speed on a smartphone? 

- **Independent Variable (IV): User age** (This is a non-manipulable variable). 

   - **Levels:** You would group participants by age (e.g., 20-30, 40-50, 60+). 

   - **Why it's not manipulated:** You cannot randomly assign participants to be a certain age. They come with this characteristic. 

- **Dependent Variable (DV): Typing speed** (in words per minute). 

- **Conclusion:** You might find that as age increases, typing speed tends to decrease. This is a **negative correlation** . However, you cannot say that "age **causes** slower typing." The slower speed could be due to other correlated factors like less experience with smartphones, reduced fine motor skills, or different cognitive habits, all of which are linked to age but are not the same as age itself. 

CSE 4849 | HCI | Summer 2025 

14 

### Within-subjects, Between-subjects 

- Two ways to assign conditions to participants: – _Within-subjects_ → each participant is tested on each condition 

   - _Between-subjects_ → each participant is tested on one condition only 

   - Example: An IV with three test conditions (A, B, C): 

#### **Within-subjects** 



<!-- Start of picture text -->
_ Test Condition<br>pi {Atel c |<br>| 2 6 AT B{ Cc}<br><!-- End of picture text -->

#### **Between-subjects** 



<!-- Start of picture text -->
Test Condition<br>| 3 eT<br>ee<br>a<br><!-- End of picture text -->

CSE 4849 | HCI | Summer 2025 

15 

## Within-subjects VS. Between-subjects 

- Use a **within-subjects** design when the same participant can test multiple conditions without interference, such as having each person try two different mouse types; 

- Use a **between-subjects** design when a participant can only be in one condition due to learning or permanent change, such as having one group use a new app tutorial and another group use the old one. 

CSE 4849 | HCI | Summer 2025 

16 

# Dependent Variable 

- A _dependent variable_ is a measured human behaviour (related to an aspect of the interaction involving an independent variable) 

- “Dependent” because it depends on what the participant does 

- Examples: 

   - task completion time, speed, accuracy, error rate, throughput, target re-entries, task retries, presses of backspace, etc. 

- Dependent variables must be clearly defined 

   - Research must be reproducible! 

CSE 4849 | HCI | Summer 2025 

17 

# Control Variable 

- A _control variable_ is a circumstance (not under investigation) that is kept constant while testing the effect of an independent variable 

- More control means the experiment is less generalizable (i.e., less applicable to other people and other situations) 

- Research question: Is there an effect of font color or background color on reading comprehension? 

   - Independent variables: font color, background color 

   - Dependent variable: comprehension test scores 

   - Control variables 

      - Font size (e.g., 12 point) 

      - Font family (e.g., Times) 

      - Ambient lighting (e.g., fluorescent, fixed intensity) 

      - Etc. 

CSE 4849 | HCI | Summer 2025 

18 

# Random Variable 

- A _random variable_ is a circumstance that is allowed to vary randomly 

- More variability is introduced in the measures (that’s bad!), but the results are more generalizable (that’s good!) 

- Research question: Does user stance affect performance while playing _Guitar Hero?_ 

   - Independent variable: stance (standing, sitting) 

   - Dependent variable: score on songs 

   - Random variables 

      - Prior experience playing a real musical instrument 

      - Prior experience playing _Guitar Hero_ 

      - Amount of coffee consumed prior to testing 

      - Etc. 

CSE 4849 | HCI | Summer 2025 

19 

# Confounding Variable 

- A _confounding variable_ is a circumstance that varies systematically with an independent variable 

- Should be considered, lest the results are misleading 

- Research question: In an eye tracking application, is there an effect of “camera distance” on task completion time? 

   - Independent variable: Camera distance (near, far) 

      - Near camera (A): inexpensive camera mounted on eye glasses 

      - Far camera (B): expensive camera mounted above system display 

   - Dependent variable: task completion time 

   - But, “camera” is a confounding variable: camera A for the near setup, camera B for the far setup 

   - Are the effects due to camera distance or to some aspect of the different setups? 

   - (see **HCI:ERP** for the solution) 

CSE 4849 | HCI | Summer 2025 

20 

# Confounding variable 

- A confounding variable is an uncontrolled, extraneous variable that influences both the independent and dependent variables, creating a spurious or misleading relationship. It makes it seem like the independent variable is causing a change when, in reality, the confounding variable is the true cause. 

- Practical Example Scenario: You want to test if a new, minimalist user interface (UI) design for a mobile app improves user satisfaction. You recruit a group of 20 users and give them a satisfaction survey after they've used the new UI. You find that the user satisfaction scores are very high. 

   - Independent Variable (IV): The new, minimalist UI design. 

   - Dependent Variable (DV): User satisfaction scores. 

   - Initial Conclusion (Potentially Flawed): You conclude that the new UI design is a success because user satisfaction is high. 

- The Confounding Variable: Let's say you realize that all of your 20 participants are young, experienced users who are already familiar with minimalist design trends. Their prior expertise and design preference are a confounding variable. 

- To avoid this, a proper experimental design would have randomly assigned participants to a control group (using an older, non-minimalist UI) and a test group (using the new one) to ensure that both groups have a similar mix of expertise and preferences. 

CSE 4849 | HCI | Summer 2025 

21 

### Random variable VS Confounding variable 

- A **confounding variable** systematically biases a study's results by providing a misleading alternative explanation, while a **random variable** is an uncontrolled factor that adds unpredictable noise but can be neutralized through proper experimental design. 

- **Scenario:** You want to test if a new, interactive online dashboard (Independent Variable) increases employee productivity (Dependent Variable). 

   - **Random Variable:** Employee's **prior experience** with similar software. If you **randomly assign** employees to either the new dashboard group or a control group (using the old system), you would expect an even mix of experienced and inexperienced users in both groups. The effect of prior experience is random and will not systematically bias the results. 

   - **Confounding Variable:** What if, instead of randomly assigning employees, you simply gave the new dashboard to the youngest employees because they are often more comfortable with new technology? In this case, **age** is a confounding variable. You wouldn't know if the increase in productivity was due to the new dashboard or simply because the younger employees are naturally faster or more tech-savvy. Age is systematically different between your groups, confusing the relationship between the dashboard and productivity. 

CSE 4849 | HCI | Summer 2025 

22 

# Evaluation approaches 

- Usability testing 

- Field studies 

- Analytical evaluation 

CSE 4849 | HCI | Summer 2025 

23 

## Usability testing 

- Usability testing involves measuring typical users' performance on carefully prepared tasks that are typical of  those for which the system was designed. 

- Users' performance  is generally measured in terms of: (wixon and Wilson, 1997) 

   - Time to complete a task 

   - Time to complete a task after a specified time away from the product 

   - Number and type of errors per task 

   - Number of error per unit of time 

   - Number of navigations to online help or manuals 

   - Number of users making a particular error 

   - Number of users completing a task successful 

- As  the users perform these tasks, they are watched and recorded on video and by logging their interactions with software. 

- This observational data is used to calculate performance times, identify errors, and help explain why the users did what they did. 

- User satisfaction questionnaires and interviews are also used to elicit users' opinions. 

CSE 4849 | HCI | Summer 2025 

24 

# Field studies – in the wild 

- The distinguishing feature of field studies is that they are done in natural settings with  the aim of  increasing understanding about what users do naturally and how technology impacts them. 

- In product design, field studies can be used to 

   - Help identify opportunities for new technology 

   - Determine requirements for design 

   - Facilitate  the  introduction  of  technology and 

   - Evaluate  technology 

CSE 4849 | HCI | Summer 2025 

25 

# Analytical evaluations 

- In analytical evaluations experts apply their knowledge of typical users, often guided by heuristics,  to predict usability problems. 

- The key  feature of analytical evaluation is that users need not be present, which makes  the process quick, relatively inexpensive, and  thus attractive  to companies; but it has limitations. 

CSE 4849 | HCI | Summer 2025 

26 

# Characteristics of approaches 

||**Usability**<br>**testing**|**Field**<br>**studies**|**Analytical**|
|---|---|---|---|
|**Users**|do task|natural|not involved|
|**Location**|controlled|natural|anywhere|
|**When**|prototype|early|prototype|
|**Data**|quantitative|qualitative|problems|
|**Feed back**|measures &<br>errors|descriptions|problems|
|**Type**|applied|naturalistic|expert|



CSE 4849 | HCI | Summer 2025 

27 

## Evaluation approaches and methods 

|**Method**|**Usability**<br>**testing**|**Field**<br>**studies**|**Analytical**|
|---|---|---|---|
|**Observing**|√|√||
|**Asking**<br>**users**|√|√||
|**Asking**<br>**experts**||√|√|
|**Testing**|√|||
|**Modeling**|||√|



CSE 4849 | HCI | Summer 2025 

28 

# The language of evaluation 

Analytics Analytical evaluation Biases Controlled experiment Crowdsourcing Ecological validity Expert review or crit Field study Formative evaluation Heuristic evaluation 

Informed consent form In the wild evaluation Living laboratory Predictive evaluation Reliability Scope Summative evaluation Usability laboratory User studies Usability testing Users or participants Validity 

CSE 4849 | HCI | Summer 2025 

29 

# Inspections 

- Several kinds. 

- Experts use their knowledge of users & technology to review software usability. 

- Expert critiques can be formal or informal reports. 

- Heuristic evaluation is a review guided by a set of heuristics. 

- Walkthroughs involve stepping through a preplanned scenario noting potential problems. 

CSE 4849 | HCI | Summer 2025 

30 

# Heuristic evaluation 

- Developed Jacob Nielsen in the early 1990s. 

- Based on heuristics distilled from an empirical analysis of 249 usability problems. 

- These heuristics have been revised for current technology. 

- Heuristics being developed for mobile devices, wearable's, virtual worlds, etc. 

- Design guidelines form a basis for developing heuristics. 

CSE 4849 | HCI | Summer 2025 

31 

## Nielsen’s heuristics 

- Visibility of system status. 

- Match between system and real world. 

- User control and freedom. 

- Consistency and standards. 

- Error prevention. 

- Recognition rather than recall. 

- Flexibility and efficiency of use. 

- Aesthetic and minimalist design. 

- Help users recognize, diagnose, recover from errors. 

- Help and documentation. 

CSE 4849 | HCI | Summer 2025 

32 

# Discount evaluation 

• Heuristic evaluation is referred to as discount evaluation when 5 evaluators are used. 

- evidence that on 

- • Empirical suggests average 5 evaluators identify 75-80% of usability problems. 

CSE 4849 | HCI | Summer 2025 

33 

# No. of evaluators & problems 



<!-- Start of picture text -->
“4 100%<br>cq<br>-dQ<br>ie<br>Dp g 75%<br>WO<br>Of<br>Gu<br>S & 50%<br>pad<br>yu Q<br>B.S<br>0 ™ 25%<br>Q<br>0%<br>0) 5 10 15<br>Number of Fvaluators<br><!-- End of picture text -->

CSE 4849 | HCI | Summer 2025 

34 

### 3 stages for doing heuristic evaluation 

- Briefing session to tell experts what to do. 

- Evaluation period of 1-2 hours in which: 

   - Each expert works separately; 

   - Take one pass to get a feel for the product; 

   - Take a second pass to focus on specific features. 

- Debriefing session in which experts work together to prioritize problems. 

CSE 4849 | HCI | Summer 2025 

35 

# Advantages and problems 

- Few ethical & practical issues to consider because users not involved. 

- Can be difficult & expensive to find experts. 

- Best experts have knowledge of application domain & users. 

- Biggest problems: 

   - Important problems may get missed; 

   - Many trivial problems are often identified; 

   - Experts have biases. 

CSE 4849 | HCI | Summer 2025 

36 

# Cognitive walkthroughs 

- Focus on ease of learning. 

- Designer presents an aspect of the design & usage scenarios. 

- Expert is told the assumptions about user population, context of use, task details. 

- One of more experts walk through the  design prototype with the scenario. 

- Experts are guided by 3 questions. 

CSE 4849 | HCI | Summer 2025 

37 

# The 3 questions 

- Will the correct action be sufficiently evident to the user? 

- Will the user notice that the correct action is available? 

- Will the user associate and interpret the response from the action correctly? 

As the experts work through the scenario they note problems. 

CSE 4849 | HCI | Summer 2025 

38 

# Pluralistic walkthrough 

- Variation on the cognitive walkthrough theme. 

- Performed by a carefully managed team. 

- The panel of experts begins by working separately. 

- Then there is managed discussion that leads to agreed decisions. 

- The approach lends itself well to participatory design. 

CSE 4849 | HCI | Summer 2025 

39 

# Evaluation of HCAI systems 

- HCAI evaluation extends traditional HCI methods by additionally assessing trust, explainability, fairness, human control, and long-term human-AI collaboration. 

- HCAI Evaluation dimensions: 

   - ✓ Usability 

   - ✓ Explainability 

   - ✓ Trust & reliance 

   - ✓ Human control 

   - ✓ Fairness & bias 

   - ✓ Safety & accountability 

   - ✓ Long-term interaction 

- <u>https://www.unesco.org/ethics-ai/en/eia</u> 

- <u>https://ceur-ws.org/Vol-3957/BEHAVEAI-paper05.pdf</u> 

CSE 4849 | HCI | Summer 2025 

40 

