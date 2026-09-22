## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Layout preferences

Any layout preference of the Architect surface MUST persist through the host layout service and never through browser storage.

#### Scenario: Collapsed history

- **WHEN** the user folds an entry's note in the History view and restarts Sero
- **THEN** that note is still folded

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
