## MODIFIED Requirements

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

### Requirement: Project page shows four parts

The project overview SHALL show four compact content areas: the user's goal and relevant stated constraints; observed current work, freshness and spend; a usable result or next meaningful checkpoint; and any necessary user decision. Empty result or decision areas SHALL not become placeholder cards. A short directive composer and Watch work entry SHALL remain available. Plans, models, milestone rails, research, full owner reports, evidence and older directives SHALL open in separate work/settings/history views, not nested folds or another column on the overview. The overview MUST NOT contain a transcript or event log. Every action SHALL use the same authoritative tool action as equivalent menu/detail controls.

#### Scenario: Quiet build
- **WHEN** a project builds without needing the user
- **THEN** the overview shows its goal, actual current work and spend, a Watch work entry and any available useful result
- **AND** no technical plan or empty Needs You section expands the page

#### Scenario: Stopped step
- **WHEN** delegated work stops and safe automatic recovery cannot continue
- **THEN** the overview states the named work and saved cause once with the applicable recovery action
- **AND** it offers separate work detail without making the user find the cause in history

#### Scenario: The cap is what stopped the work
- **WHEN** the project reaches its spending cap
- **THEN** it shows the actual hold and one action that opens a cap/recovery dialog
- **AND** the dialog uses the same tool action as the project menu

#### Scenario: Two things to do
- **WHEN** a project needs help after its research Room was cancelled
- **THEN** it offers opening that Room and sending a directive through the existing composer without duplicating the hold

#### Scenario: The Architect's own words are kept
- **WHEN** Architect records a long report
- **THEN** its complete original content and timestamp remain available in the separate work view, not inside an overview disclosure

#### Scenario: History is not on the page
- **WHEN** the overview is open
- **THEN** history is reachable as a separate view and no history entries expand the overview

#### Scenario: No stream until asked
- **WHEN** an owner, researcher, Workflow or Room is working and the user has not opened Watch work
- **THEN** the overview shows current metadata but no transcript

### Requirement: Decision cards

Each newly authored decision SHALL present one question, its reason, at most two choices with clear consequences, the recommended choice preselected and an optional note. Saved decisions SHALL keep all original choices, identifiers, consequences and the original recommendation until answered, even when they contain more than two choices. Answering SHALL take one action. Consent-relevant information MUST remain visible. Supporting evidence and technical documents SHALL open separately. Routine internal technical choices, contained worker authorization and in-scope rechecking SHALL not become user decision cards. Architect SHALL continue eligible work within approved limits and raise a decision only when material uncertainty or required new authority prevents safe continuation.

#### Scenario: Answer in one action
- **WHEN** the user accepts the recommendation
- **THEN** the decision closes and authorized work can continue without another confirmation for that same decision

#### Scenario: Evidence is available
- **WHEN** the user wants support for a recommendation
- **THEN** the linked evidence opens outside the decision body without losing the pending answer

#### Scenario: Saved choices remain usable
- **WHEN** an older unanswered decision contains three choices
- **THEN** the card shows all three with their saved consequences and submits the selected original option id
- **AND** it does not hide a choice in the optional note, require a replacement decision or add another confirmation

### Requirement: Milestone rail links to detail

The milestone rail SHALL be available in the separate work view rather than required on the overview. Each milestone SHALL show its title, status and a link to its linked Workflow or Room in the correct workspace. It MUST NOT reproduce step/member transcripts or duplicate an active recovery control.

#### Scenario: Open detail
- **WHEN** the user follows a running milestone from the work view
- **THEN** Orchestrator opens on that Workflow or Room with its workspace intact

#### Scenario: The header already offers the recovery
- **WHEN** the overview already has the applicable recovery action
- **THEN** the milestone rail retains status and navigation but does not add a second copy of that action

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

## ADDED Requirements

### Requirement: Watch work is a separate live surface

The project SHALL offer a separate Watch work view for owner, planner/researcher, Workflow, Room and delegated-child activity. It SHALL show current output and tool states on demand during execution, with bounded snapshots, liveness/freshness and links to complete saved history. Plans, research and evidence SHALL remain inspectable separately from live output. Switching or closing this view MUST NOT alter execution, grant authority or lose project context.

#### Scenario: Watch before a result exists
- **WHEN** the user opens Watch work while a researcher or owner is in flight
- **THEN** the available live snapshot and actual request/tool activity are visible before the turn finishes

#### Scenario: Return to overview
- **WHEN** the user closes Watch work
- **THEN** the short overview returns and the underlying work continues unchanged
