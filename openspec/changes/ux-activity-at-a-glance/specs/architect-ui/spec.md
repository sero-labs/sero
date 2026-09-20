## MODIFIED Requirements

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

A project page SHALL show, in order: a heading that is the project's state in plain words, followed by the same activity line as the list and, only when something needs the user, one button for that action; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. The Architect's own latest sentence SHALL be complete behind a "What Architect reported" disclosure, with the time it was written. History, evidence and older directives MUST be behind disclosures. The page MUST NOT contain an event log and MUST NOT stream agent output. When a stopped step is what the project needs from the user, Retry step SHALL also be offered in the header with the same effect as the control on the milestone.

#### Scenario: Quiet build

- **WHEN** a project is building with no open decision
- **THEN** the Needs You section shows that nothing is needed, the header shows no button, and no other section grows to fill the space

#### Scenario: Stopped step

- **WHEN** a milestone's run stopped before it finished
- **THEN** the heading says the milestone stopped before it finished and the header offers Retry step
- **AND** retrying from the header and from the milestone rail start the same retry

#### Scenario: The Architect's own words are kept

- **WHEN** the Architect has reported a paragraph about a blocked milestone
- **THEN** the paragraph is complete under "What Architect reported" with its time, and no part of it is used as the heading or cut short

### Requirement: Controls

The project page SHALL offer pause, resume, stop, raise cap, change autonomy, open session and delete. It SHALL also offer project model settings and run metrics through its project controls menu. The page body SHALL show only a compact model-defaults summary and one run-metrics entry point beside those menu entries; it MUST NOT gain an event log or a metrics dashboard. Run metrics SHALL open a dedicated full-width visual inspector with enough space for the execution timeline and selected-activity detail. Pause and stop MUST NOT cancel in-flight Workflows or Rooms; they stop the owner from being woken. Pause SHALL additionally disarm every trigger of the project's maintenance Workflow, so no new maintenance run starts while the project is paused, and resume SHALL re-arm exactly the triggers that pause disarmed.

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

### Requirement: Dashboard widget

The plugin SHALL contribute one dashboard widget that shows the projects-list rows with the same derived state word as the list, and the total needs-you count. The widget MUST read only the index and MUST NOT show the Architect's own written sentence.

#### Scenario: Widget without projects

- **WHEN** no project exists
- **THEN** the widget shows an empty state with a single action to create a project

#### Scenario: Widget agrees with the list

- **WHEN** a project reads `Last known` on the projects list
- **THEN** the widget row for that project reads `Last known` too

## ADDED Requirements

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
