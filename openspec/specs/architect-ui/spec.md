## Purpose

The Architect page shows each project's state and the user's next action. It hides other details by default.

## Requirements

### Requirement: Projects list

The Architect app SHALL open on a projects list with one row per project showing its goal/title, activity from the shared vocabulary, current work and its owner, observation freshness, action needed if any and spend against cap. State MUST be runtime-derived, not taken from the owner's written sentence. Raw ids, transcripts, event logs and internal step detail MUST NOT appear in rows. The list SHALL retain the Needs you filter and count. Current owner, research and delegated work SHALL remain visible before a result is saved.

#### Scenario: Two projects
- **WHEN** one project needs a decision and another is building
- **THEN** both show their actual activity and spend, and only the first names a user action

#### Scenario: Filter to what needs you
- **WHEN** the user selects Needs you
- **THEN** only projects requiring user action remain and the count matches those projects

#### Scenario: A dispatch is named, not identified
- **WHEN** a Room is working for a project
- **THEN** the row names the Room and observed current work rather than its raw id or brief

#### Scenario: Paused owner with an armed worker
- **WHEN** a project is paused and its maintenance Workflow was disarmed with it
- **THEN** the row reads Paused by you and states that the maintenance Workflow is paused with the project

#### Scenario: Work before dispatch
- **WHEN** the owner is preparing the route and no delegated work exists yet
- **THEN** the row shows its observed work or request wait rather than a blank state

### Requirement: Decision cards

Each newly authored decision SHALL present one question, its reason, at most two choices with clear consequences, the recommended choice marked and an optional note. Saved decisions SHALL keep all original choices, identifiers, consequences and the original recommendation until answered, even when they contain more than two choices. Answering SHALL take one action: pressing a choice sends it. Consent-relevant information MUST remain visible. Supporting evidence and technical documents SHALL open separately. Routine internal technical choices, contained worker authorization and in-scope rechecking SHALL not become user decision cards. Architect SHALL continue eligible work within approved limits and raise a decision only when material uncertainty or required new authority prevents safe continuation.

#### Scenario: Answer in one action
- **WHEN** the user presses the recommended choice
- **THEN** the decision closes and authorized work can continue without another confirmation for that same decision

#### Scenario: Evidence is available
- **WHEN** the user wants support for a recommendation
- **THEN** the linked evidence opens outside the decision body without losing the pending answer

#### Scenario: Saved choices remain usable
- **WHEN** an older unanswered decision contains three choices
- **THEN** the card shows all three with their saved consequences and submits the selected original option id
- **AND** it does not hide a choice in the optional note, require a replacement decision or add another confirmation

### Requirement: Milestone rail links to detail

The milestone rail SHALL be available in the separate work view rather than required on the overview. Each milestone SHALL show its title, status and a link to its linked owner execution, Workflow or Room in the correct workspace. Direct milestones SHALL open their actual work and evidence details without manufacturing an Orchestrator record. The rail MUST NOT reproduce step/member transcripts or duplicate an active recovery control.

#### Scenario: Open detail
- **WHEN** the user follows a running milestone from the work view
- **THEN** the linked execution detail opens with its workspace intact, using Orchestrator for a Workflow or Room

#### Scenario: The header already offers the recovery
- **WHEN** the overview already has the applicable recovery action
- **THEN** the milestone rail retains status and navigation but does not add a second copy of that action

#### Scenario: Open a direct milestone
- **WHEN** the user follows a milestone executed by the owner
- **THEN** its work detail links to the retained owner session and runtime evidence
- **AND** no Workflow or Room is required to show its progress or results

### Requirement: Intake

Creating a new project SHALL collect the user's free-form request, cost/start cap and approved workspace/action boundaries before paid work starts. It MUST NOT require a quality/readiness field, preset solution type, phase plan, chosen team or completed design. Any desired properties expressed in the request SHALL remain part of that request, not be converted into a product mode. Architect SHALL determine the route just in time and ask only for material uncertainty or new authority. Choosing a new folder SHALL ask for name and location, create and register it only after confirmation and refuse an existing folder without modifying it or creating a sibling. Choose a workspace SHALL offer registered workspaces without creating one, list free workspaces first with their paths, exclude Global and make workspaces that already hold an Architect project unavailable. The effective host-clamped access SHALL be visible before approval; agreeing SHALL approve the bounded start and grant in one flow, not initiate an unapproved paid discovery phase.

#### Scenario: Create from an idea
- **WHEN** the user supplies a request, cap and new-folder location and approves the displayed execution agreement/access
- **THEN** the project and workspace are created and paid work can start within those exact bounds

#### Scenario: Start on an existing workspace
- **WHEN** the user selects Choose a workspace and approves the agreement for a free registered workspace
- **THEN** the project uses that workspace's name, id and path without creating or registering another workspace

#### Scenario: The picker orders free workspaces first
- **WHEN** the workspace picker opens
- **THEN** free workspaces appear first with their paths and occupied workspaces cannot be selected

#### Scenario: The Global workspace is not offered
- **WHEN** the workspace picker opens
- **THEN** Global is absent

#### Scenario: New folder refuses an existing folder
- **WHEN** a new-folder request targets an existing folder
- **THEN** no project is created and the existing folder, configuration and registration remain unchanged

#### Scenario: Access refused
- **WHEN** the user declines the effective access proposal
- **THEN** no paid operation begins and the missing approval remains clear and reopenable

#### Scenario: Research access is part of the envelope
- **WHEN** the approved agreement allows research Rooms to run commands
- **THEN** a later read-only research planner question about command access does not become a user decision

### Requirement: Controls

The project SHALL retain pause, resume, stop, raise cap, change autonomy, open session, delete, model settings, run metrics and History. Watch work SHALL be directly available from the overview; settings, model detail, History and the visual metrics inspector SHALL remain separate views. New delivery-agreement projects SHALL apply pause/stop to scheduling owned linked work as well as owner wakes, without cancelling an already executing turn or pretending its effects were undone. The overview SHALL identify work still draining. Projects without an agreement SHALL retain their saved owner-only control semantics, and the UI SHALL identify that charter flow as deprecated. Pause SHALL disarm maintenance triggers and resume SHALL restore exactly the triggers it disarmed. Resume MUST reconcile completed work before restarting anything.

#### Scenario: Pause autonomous work
- **WHEN** the user pauses an agreement-based project with a Workflow and Room running
- **THEN** no new owned turns or steps are scheduled, already executing turns can finish, and their actual activity remains visible until they drain

#### Scenario: Pause
- **WHEN** the user pauses a project that has no delivery agreement
- **THEN** its existing owner-only pause behavior remains unchanged and the UI states that delegated work can continue

#### Scenario: Pause disarms maintenance
- **WHEN** the project is paused with armed maintenance triggers
- **THEN** no maintenance run starts and the row identifies the pause

#### Scenario: Resume restores only what pause disarmed
- **WHEN** one maintenance trigger was already off before project pause
- **THEN** resume leaves it off and restores only the other triggers that pause recorded

#### Scenario: Work completed during pause
- **WHEN** a linked Room completes while draining
- **THEN** resume uses its saved completion and does not resume or recreate it

#### Scenario: Open run metrics
- **WHEN** the user opens run metrics
- **THEN** the separate full-width run/project-lifetime inspector opens without adding trace rows to the overview

#### Scenario: Inspect project model defaults
- **WHEN** the user opens model settings
- **THEN** a separate view distinguishes inherited defaults, overrides, effective selections and pending future-work changes

#### Scenario: Open history
- **WHEN** the user opens History
- **THEN** the separate history view opens with a return path without adding its entries to the overview

### Requirement: Dashboard widget

The plugin SHALL contribute one dashboard widget showing compact project rows and the total Needs you count. Rows SHALL use the same derived activity, current work, freshness and available spend as the projects list. The widget SHALL use the bounded project index and scoped metadata updates, not full record/transcript subscriptions. It MUST NOT use the owner's written sentence as state or activity proof.

#### Scenario: Widget without projects
- **WHEN** no project exists
- **THEN** the widget shows an empty state with one create-project action

#### Scenario: Widget agrees with the list
- **WHEN** contact expires for a project whose list row becomes Last known
- **THEN** its widget row becomes Last known from the same facts without requiring the user to open the project

### Requirement: Layout preferences

Any layout preference of the Architect surface MUST persist through the host layout service and never through browser storage.

#### Scenario: Collapsed history

- **WHEN** the user folds an entry's note in the History view and restarts Sero
- **THEN** that note is still folded

### Requirement: Inspector interactions are accessible and preserve context

The inspector SHALL support keyboard access to its run selector, timeline expansion, filters, charts and selected-activity detail. Status and missing-data meaning MUST NOT depend on color alone. Returning to the project SHALL preserve the user's project context, and saved layout preferences SHALL use the host layout service rather than browser storage.

#### Scenario: Inspect without a pointer

- **WHEN** a user navigates the inspector by keyboard
- **THEN** they can select an activity, inspect its values and return to the project without requiring hover-only controls

### Requirement: The list says when the Architect is not running

When the Architect runtime is not running in this Sero session, the projects list SHALL say so once at the top, as text with no dismiss control. Every row whose state would need a live report SHALL read `Last known` with the time of the last saved report. States that are saved facts, namely stopped, paused and complete, SHALL be shown unchanged.

#### Scenario: Architect off

- **WHEN** the runtime is not running and a project was last saved as running a milestone
- **THEN** the list shows the notice at the top and that row reads `Last known`, with the time of its last report

#### Scenario: Saved facts survive

- **WHEN** the runtime is not running and a project is paused, stopped or complete
- **THEN** those rows read exactly as they do when the runtime is running

#### Scenario: The notice clears itself

- **WHEN** the runtime starts
- **THEN** the notice disappears without the user dismissing it

### Requirement: A blocked research Room is named and explained

When a project is blocked because a research Room ended without reporting, the project page SHALL name that Room by its title, say what happened to it and when, and give the reason the record holds. It MUST NOT identify the Room by its id, and MUST NOT require the user to read the project's history to find the reason. When the record holds no reason, the page SHALL say what happened without inventing one.

#### Scenario: A cancelled Room

- **WHEN** a project's research Room was cancelled nine days ago after its members could not run commands
- **THEN** the page names the Room by its title, says it was cancelled and when, and states that reason
- **AND** the Room's id is not used as the heading

#### Scenario: No reason was saved

- **WHEN** a research Room was cancelled and no cause was recorded
- **THEN** the page says the Room was cancelled and when, and shows no reason line

### Requirement: Each kind of nothing is said once, where it belongs

An overview area that asks nothing of the user or has no useful result SHALL be absent rather than repeating empty headings and cards. Separate work views SHALL distinguish no work recorded, work not planned yet, unavailable observation and stopped work in one quiet line where relevant. A missing plan MUST NOT imply that an approved project needs a charter approval. Only an actual fault SHALL use fault styling.

#### Scenario: Nothing needs the user
- **WHEN** no decision or approval is open
- **THEN** no empty Needs You section appears

#### Scenario: The section returns
- **WHEN** a new decision is raised
- **THEN** the necessary decision and answer control appear without adding the working document

#### Scenario: Not made yet
- **WHEN** a delivery agreement is approved but no milestone plan has been written
- **THEN** the work view states that planning is not recorded yet rather than instructing the user to approve a charter

#### Scenario: A fault is the only colour
- **WHEN** one detail section is empty and another records a real stopped-work fault
- **THEN** only the fault uses fault styling

#### Scenario: Observation unavailable
- **WHEN** live work cannot be confirmed
- **THEN** the surface names that missing observation instead of claiming nothing happened

### Requirement: A stopped milestone states what stopped and why, once

The project header SHALL state what stopped and why the work stopped, from the
record's own saved reason, once on the page, with the control that recovers it
beside it. The reason SHALL be shown as the header's activity line beside its state
glyph, not as a second sentence below the activity line. Where the record retains
no cause, the header SHALL say the work stopped without a recorded cause and MUST
NOT invent one. The history the page keeps SHALL keep its own recorded entries.

#### Scenario: A Workflow a restart interrupted

- **WHEN** a dispatched Workflow was interrupted by a restart
- **THEN** the header states that Sero restarted and which step the run was on, once

#### Scenario: A Workflow stopped at a limit

- **WHEN** a dispatched Workflow stopped at its cost or time limit
- **THEN** the header states the limit's own reason

#### Scenario: No recorded cause

- **WHEN** a stopped run retains no cause
- **THEN** the header says the work stopped without a recorded cause

#### Scenario: The reason is one line

- **WHEN** the header states a stopped milestone's reason
- **THEN** the reason appears once, as the activity line, and no separate sentence repeats the milestone's title or its state

### Requirement: Milestone evidence reads as a list of checks

A milestone's evidence SHALL show one row per check, each with its outcome, its name
and its duration where the record holds one, and each check's own output SHALL open
from its own row. Evidence MUST NOT print every command's output at once, and the
recorded output MUST NOT be truncated. The checks a milestone recorded for changed
files, a preview response and a capture SHALL appear as rows with the commands'
checks. Each row SHALL open independently.

#### Scenario: A passed milestone

- **WHEN** the evidence opens
- **THEN** every check is a row, and no command's output is shown until its row is opened

#### Scenario: One command's output

- **WHEN** the user opens one check's row
- **THEN** that command's own complete output is shown, and opening a second row does not close the first

#### Scenario: A check with no duration

- **WHEN** a check records no duration, such as a list of changed files or a capture
- **THEN** its row shows its name and its outcome without a fabricated duration

#### Scenario: Files and preview

- **WHEN** the evidence records changed files and a preview check
- **THEN** those appear as rows beside the commands' checks, and the capture row opens the preview

### Requirement: History is its own view

The Architect app SHALL open a project's History as its own view, from the project
controls menu, with a control that returns to the project page. The view SHALL show
a centred timeline of the project's entries, a header stating how many entries it
holds and the date range they cover, one heading per day, a dot for an entry that
records a block, a question or an accepted milestone, and a link from an entry to
the Workflow or the evidence that entry names. A long note or question SHALL be
folded under its entry. Entries older than the first page SHALL open from a "Show
earlier" control, and no entry SHALL be dropped. An entry that records a subject
SHALL be named and linked from that subject, and MUST NOT print a raw record id. An
entry that records no subject SHALL be shown with the cause it was written with,
and no link SHALL be invented for it.

#### Scenario: Opening History

- **WHEN** the user chooses History from the project controls menu
- **THEN** the History view opens with a control that returns to the project page

#### Scenario: An accepted milestone

- **WHEN** an entry records a milestone accepted on passed evidence
- **THEN** the entry names the milestone and links to its evidence

#### Scenario: A dispatched milestone

- **WHEN** an entry records a milestone dispatched to a Workflow or a Room
- **THEN** the entry names the milestone and links to that Workflow or Room

#### Scenario: A long note

- **WHEN** an entry carries a long note or question
- **THEN** the note is folded under the entry and opens from its own control

#### Scenario: More entries than one page

- **WHEN** the project holds more entries than the first page shows
- **THEN** the older entries open from the "Show earlier" control and none is dropped

#### Scenario: An entry written before a subject was saved

- **WHEN** the view reads an entry that records no subject
- **THEN** the entry is shown with the cause it was written with, and no link is invented

### Requirement: The inspector follows the approved prototype

The Run inspector SHALL match the Run inspector view of `apps/styleguide/public/prototypes/architect-run-observability/` in order, grouping and control placement: the header row (Project, run title, Scope, Live), one row of summary tiles, the counter line, the filter row, the timeline beside the selected-activity panel, the three charts and the status legend. Panels that share a row SHALL share its height, and each panel's content area SHALL grow to fill that height, so the layout leaves no blank band between or inside panels. At narrow widths the selected-activity panel and the charts SHALL stack below the timeline as the prototype's 960 px frame shows. The inspector MUST NOT add explanatory sentences, keyboard hint strips or sub-headings inside the selected-activity panel. Each figure SHALL carry only a short label and, where it adds a fact, a short value line such as a clock range or a wait breakdown.

#### Scenario: Compare with the prototype

- **WHEN** the built inspector and the prototype are captured at 1240 px and 960 px with the same run selected
- **THEN** each region appears in the same order and position, with the prototype's help sentences absent

#### Scenario: Zoom controls

- **WHEN** the timeline shows its overview strip
- **THEN** Zoom in, Zoom out and Zoom to selection are icon buttons, and each keeps its name as its accessible label and tooltip

#### Scenario: A long activity name in the detail panel

- **WHEN** the selected activity's name runs longer than three lines, such as a research question
- **THEN** the panel heading shows its first three lines with the full name on hover, and the state chip stays on one line beside it

#### Scenario: Few rows beside a tall detail panel

- **WHEN** a filter leaves three timeline rows while the selected-activity panel shows model and token detail
- **THEN** the timeline panel is as tall as the detail panel, its tree area fills that height, and the charts start directly below both with no blank band between

#### Scenario: Charts in one row

- **WHEN** the three charts sit in one row and one chart has less content than the others
- **THEN** each chart's plot area grows to the row height, so no panel ends in blank space below its legend

#### Scenario: Live toggle

- **WHEN** the selected run is open and the user presses **Live**
- **THEN** the control reads **Paused** and the inspector stops re-reading the run until the user presses it again

### Requirement: Research run by one agent is shown while it runs

Research that the Architect runs directly as one agent, rather than through a Room or a Workflow, SHALL appear in Research and reviews while it runs. Its card SHALL show the question, the stopping condition, `Researching` with the elapsed time, and the eye control that opens its live block as `live-agent-watch` sets out. The activity line SHALL read `Researching a project question` while it runs. When it ends, its card SHALL keep its findings under "Findings used for the plan", as research through a Room or a Workflow does.

#### Scenario: Direct research running

- **WHEN** the Architect has run a research question as one agent for four minutes
- **THEN** Research and reviews shows its question, stopping condition and `Researching 4:00`, and the activity line reads `Researching a project question`

#### Scenario: Direct research finished

- **WHEN** that research returns its findings
- **THEN** its card shows the findings under "Findings used for the plan"

### Requirement: The project page is one board

The project page SHALL be one board that follows the approved prototype `apps/styleguide/public/prototypes/architect-one-screen.html`. A top tile SHALL always show the Architect's latest saved sentence, or the user's request when none is saved, with one state line, and meters for plan progress and spend. The progress meter SHALL appear only when a plan exists. Working SHALL be shown only for work this session has observed.

The state line SHALL read Working, Waiting for you or Stopped for those states, and otherwise the project's own state such as Paused by you or Delivered. Under the top tile the board SHALL stack the large tiles that apply, in this order: a decision or approval the user must give; a stop that needs the user, with its saved cause and its recovery control; work that is running. A delivered result SHALL be the large tile when none of those apply. A project with nothing to decide, recover, watch or deliver SHALL have no large tile. A Plan tile SHALL exist only when the project has plan steps, a written plan or research, and a Decisions made tile only when at least one decision exists. The board MUST NOT show an empty or placeholder tile. A message box for the Architect SHALL remain available.

A checked plan step SHALL link to its checks and show the picture those checks captured, when there is one. A delivered result SHALL show the newest of those pictures. While the Architect works, the live tile SHALL show the last screenshot it took in its browser during the current turn. Full plans, research, evidence, model settings, the inspector and history SHALL open as separate views. Every action on the board SHALL use the same authoritative tool action as the equivalent menu or detail control.

#### Scenario: Just started
- **WHEN** a project has started and has no plan and no question
- **THEN** the board shows the top tile, the live work as the large tile, and the user's start cap under Decisions made
- **AND** it shows no Plan tile and no progress meter

#### Scenario: A question is open
- **WHEN** the Architect has raised a decision
- **THEN** the large tile is the question with its choices and the state line reads Waiting for you
- **AND** no live tile is shown while nothing runs

#### Scenario: Work is running
- **WHEN** observed work is running and nothing needs the user
- **THEN** the large tile is the live work and the state line reads Working

#### Scenario: The cap stopped the work
- **WHEN** the project reaches its spending cap
- **THEN** the large tile states the stop and holds the field that raises the cap and resumes
- **AND** the state line reads Stopped

#### Scenario: Delivered
- **WHEN** every plan step is closed and at least one was accepted on evidence
- **THEN** the large tile is the result, with the Architect's result sentence and the ways to open the preview and the checks
- **AND** the state line reads Delivered

#### Scenario: Nothing to show is not a tile
- **WHEN** a project has no plan steps, written plan or research, or no decisions
- **THEN** that tile is absent and the remaining tiles use the space

#### Scenario: History is not on the page
- **WHEN** the board is open
- **THEN** history is reachable as a separate view and no history entries are on the board

### Requirement: Live work is on the board

While observed work runs, the board SHALL show it without a further click. For each agent that is working it SHALL show who it is, what it is doing in plain words with the tool's own short detail, and how long the current action has run. It SHALL show the arriving text of the Architect, or of the one agent the user selects when several work at once. For the Architect's own work it SHALL show up to three of the most recent finished actions. It SHALL link to the complete saved session. Showing live work MUST NOT alter execution or grant authority, and live text MUST NOT be saved by the board.

#### Scenario: The Architect works itself
- **WHEN** the Architect is editing files in its own turn
- **THEN** the live tile names the action, shows its timer and shows the Architect's text as it arrives

#### Scenario: Several agents work
- **WHEN** a Room has two members working
- **THEN** the live tile lists both with their actions and timers, and shows the text of the selected one

#### Scenario: Recent actions follow the work
- **WHEN** three of the Architect's own actions finish while the board is open
- **THEN** the live tile lists them, newest first, under the action in hand
- **AND** a new turn starts the list again

### Requirement: Decisions made are visible and can be reopened

The board SHALL list the decisions that shape the work: each answered question with the chosen option, each assumption the Architect recorded with its reason when it gave one, and the spending limit. Each row SHALL say whether the user or the Architect decided. Change on a row SHALL place a short message naming that decision in the message box and focus it. Change MUST NOT send a message or alter the project by itself.

#### Scenario: An assumption is shown
- **WHEN** the Architect records an assumption in its working plan
- **THEN** the board lists it as decided by the Architect

#### Scenario: Change opens a message
- **WHEN** the user presses Change on a decision
- **THEN** the message box holds a sentence that names the decision and has the focus
- **AND** nothing is sent until the user sends it
