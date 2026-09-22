## Purpose

The Architect page shows each project's state and the user's next action. It hides other details by default.

## Requirements

### Requirement: Projects list

The Architect app SHALL open on a projects list with one row per project showing an activity line, the action the project needs from the user, and spend against cap. The activity line SHALL have two parts: the state that matters most, taken from the shared activity vocabulary and derived from saved records, and a second line naming whose work it is, the Architect's own or the Workflow or Room it handed the work to. A row MUST NOT show the Architect's own written sentence, the project id, events, transcripts or step detail. The list SHALL offer a `Needs you · N` filter that shows only the projects needing the user, where N counts those projects.

#### Scenario: Two projects

- **WHEN** one project needs a decision and another is building quietly
- **THEN** the list shows both rows, the first naming the action it needs and the second showing no action

#### Scenario: Paused owner with an armed worker

- **WHEN** the user paused a project whose maintenance Workflow was paused with it
- **THEN** the first line reads `Paused by you` and the second says the maintenance Workflow is paused with the project

#### Scenario: Filter to what needs you

- **WHEN** the user selects `Needs you · N`
- **THEN** only the rows naming an action remain, and the count equals the number of rows shown

#### Scenario: A dispatch is named, not identified

- **WHEN** a milestone was dispatched to a Room
- **THEN** the second line names the Room and its state, and no raw record id appears on the row

### Requirement: Project page shows four parts

A project page SHALL show, in order: a heading that is the project's state in plain words, followed by the same activity line as the list and, when something needs the user, the controls for that action; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. The header MAY carry more than one control when the state offers more than one thing to do, and MAY carry a field where the action needs a value rather than a confirmation. Those controls SHALL run the same actions as their copies elsewhere on the page or in the project menu. The Architect's own latest sentence SHALL be complete behind a "What Architect reported" disclosure, with the time it was written. Evidence and older directives MUST be behind disclosures. History SHALL be its own view opened from the project controls menu, and the project page MUST NOT hold it. The page MUST NOT contain an event log and MUST NOT stream agent output. When a stopped step is what the project needs from the user, the header SHALL offer the whole recovery control the milestone rail used to carry — including the field a raised cap needs — and the milestone rail MUST NOT repeat it.

#### Scenario: Quiet build

- **WHEN** a project is building with no open decision
- **THEN** the header shows no control, and no section grows to fill the space

#### Scenario: Stopped step

- **WHEN** a milestone's run stopped before it finished
- **THEN** the heading names the milestone that stopped and the header offers the recovery control beside the reason
- **AND** the milestone rail does not repeat that control

#### Scenario: The cap is what stopped the work

- **WHEN** a project has reached its spend cap
- **THEN** the heading says the cap stopped the work, and the header carries the new-cap field and the control that raises the cap and resumes
- **AND** raising the cap from the header and from the project menu have the same effect

#### Scenario: Two things to do

- **WHEN** a project is stopped because its research Room was cancelled
- **THEN** the header offers both opening that Room and telling the Architect what to do next
- **AND** telling the Architect what to do next puts the cursor in the existing directive composer rather than opening another way to send one

#### Scenario: The Architect's own words are kept

- **WHEN** the Architect has reported a paragraph about a blocked milestone
- **THEN** the paragraph is complete under "What Architect reported" with its time, and no part of it is used as the heading or cut short

#### Scenario: History is not on the page

- **WHEN** a project page is open
- **THEN** no History entry is shown on it, and History is reachable from the project controls menu

### Requirement: Decision cards

Each open decision SHALL be shown as a card with the question, the options with their consequences, the recommended option preselected, the reason for escalation, and an optional note field. Answering MUST take one action.

#### Scenario: Answer in one action

- **WHEN** the user accepts the preselected recommendation
- **THEN** the decision closes and the card leaves the Needs You section

### Requirement: Milestone rail links to detail

Each milestone in the rail SHALL show its title and status and, when dispatched, one link that opens the Orchestrator record of its Workflow or Room. The rail MUST NOT reproduce step or member detail. The rail MUST NOT offer a control the project header already offers for the same recovery.

#### Scenario: Open detail

- **WHEN** the user selects the link on a running milestone
- **THEN** the Orchestrator app opens on that Workflow or Room

#### Scenario: The header already offers the recovery

- **WHEN** a milestone's run stopped and the header offers the recovery control
- **THEN** the milestone row keeps its title, its status and its link, and offers no second copy of that control

### Requirement: Intake

Creating a project SHALL ask for the idea text and a folder, and nothing else. The Architect creates the folder, initialises the repository and registers the workspace before discovery starts.

#### Scenario: Create from an idea

- **WHEN** the user enters an idea and a folder and confirms
- **THEN** a project appears in `intake`, the workspace exists, and the persistent-session grant prompt follows

### Requirement: Controls

The project page SHALL offer pause, resume, stop, raise cap, change autonomy, open session and delete. It SHALL also offer project model settings, run metrics and History through its project controls menu. The page body SHALL show only a compact model-defaults summary and one run-metrics entry point beside those menu entries; it MUST NOT gain an event log or a metrics dashboard. Run metrics SHALL open a dedicated full-width visual inspector with enough space for the execution timeline and selected-activity detail. Pause and stop MUST NOT cancel in-flight Workflows or Rooms; they stop the owner from being woken. Pause SHALL additionally disarm every trigger of the project's maintenance Workflow, so no new maintenance run starts while the project is paused, and resume SHALL re-arm exactly the triggers that pause disarmed.

#### Scenario: Pause

- **WHEN** the user pauses a project with a running Workflow
- **THEN** the Workflow continues, the project shows `paused`, and the owner is not woken until resume

#### Scenario: Pause disarms maintenance

- **WHEN** the user pauses a project whose maintenance Workflow is armed on a GitHub issue, a CI failure and a schedule
- **THEN** none of those triggers can start a run while the project is paused
- **AND** the project row says the maintenance Workflow is paused with the project

#### Scenario: Resume restores only what pause disarmed

- **WHEN** the user had already disarmed one maintenance trigger by hand before pausing, then resumes the project
- **THEN** the triggers pause disarmed are armed again and the trigger the user disarmed stays off

#### Scenario: Open run metrics

- **WHEN** the user selects run metrics in the project menu
- **THEN** the visual inspector opens within Architect with run and project-lifetime views
- **AND** returning to the project page does not add trace rows or metric charts to that page

#### Scenario: Inspect project model defaults

- **WHEN** the user opens model settings from the project menu
- **THEN** the view distinguishes inherited and overridden tiers, effective selections and pending changes for future work

#### Scenario: Open history

- **WHEN** the user selects History in the project menu
- **THEN** the project's History opens as its own view
- **AND** returning to the project page does not add History entries to that page

### Requirement: Dashboard widget

The plugin SHALL contribute one dashboard widget that shows the projects-list rows with the same derived state word as the list, and the total needs-you count. The widget MUST read only the index and MUST NOT show the Architect's own written sentence.

#### Scenario: Widget without projects

- **WHEN** no project exists
- **THEN** the widget shows an empty state with a single action to create a project

#### Scenario: Widget agrees with the list

- **WHEN** a project reads `Last known` on the projects list
- **THEN** the widget row for that project reads `Last known` too

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

A section with nothing in it SHALL say so in one quiet line in the place the content would appear, without a heading, a count label and a card repeating it. A section that needs nothing from the user SHALL be absent while it is empty and SHALL return with its controls as soon as it holds something. The page SHALL distinguish nothing to show, not made yet, not available from here, and stopped. Only a fault SHALL use colour.

#### Scenario: Nothing needs the user

- **WHEN** a project has no open decision or approval
- **THEN** the Needs You section is absent, and no heading, label or card announces that nothing is needed

#### Scenario: The section returns

- **WHEN** that project raises a decision
- **THEN** the Needs You section appears with the decision and its answer control

#### Scenario: Not made yet

- **WHEN** a project has no milestones because it has no charter
- **THEN** one line in the milestones section header says so and names what produces them, in place of an empty card

#### Scenario: A fault is the only colour

- **WHEN** one section is empty and another reports a stopped research Room
- **THEN** only the stopped Room's line uses colour

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
