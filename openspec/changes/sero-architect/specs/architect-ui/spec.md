## Purpose

The Architect surface shows the state of each project and what the user must do, and nothing else by default, so the user is insulated from detail unless they ask for it.

## ADDED Requirements

### Requirement: Projects list
The Architect app SHALL open on a projects list with one row per project showing the owner's one-line state, the phase, spend against cap, and the needs-you count. The list MUST NOT show events, transcripts or step detail.

#### Scenario: Two projects
- **WHEN** one project needs a decision and another is building quietly
- **THEN** the list shows both rows, the first with a needs-you count and the second without

### Requirement: Project page shows four parts
A project page SHALL show, in order: the state line with phase, overlay and spend; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. History, evidence and older directives MUST be behind disclosures. The page MUST NOT contain an event log and MUST NOT stream agent output.

#### Scenario: Quiet build
- **WHEN** a project is building with no open decision
- **THEN** the Needs You section shows that nothing is needed and no other section grows to fill the space

### Requirement: Decision cards
Each open decision SHALL be shown as a card with the question, the options with their consequences, the recommended option preselected, the reason for escalation, and an optional note field. Answering MUST take one action.

#### Scenario: Answer in one action
- **WHEN** the user accepts the preselected recommendation
- **THEN** the decision closes and the card leaves the Needs You section

### Requirement: Milestone rail links to detail
Each milestone in the rail SHALL show its title and status and, when dispatched, one link that opens the Orchestrator record of its Workflow or Room. The rail MUST NOT reproduce step or member detail.

#### Scenario: Open detail
- **WHEN** the user selects the link on a running milestone
- **THEN** the Orchestrator app opens on that Workflow or Room

### Requirement: Intake
Creating a project SHALL ask for the idea text and a folder, and nothing else. The Architect creates the folder, initialises the repository and registers the workspace before discovery starts.

#### Scenario: Create from an idea
- **WHEN** the user enters an idea and a folder and confirms
- **THEN** a project appears in `intake`, the workspace exists, and the persistent-session grant prompt follows

### Requirement: Controls
The project page SHALL offer pause, resume, stop, raise cap, change autonomy, open session and delete. Pause and stop MUST NOT cancel in-flight Workflows or Rooms; they stop the owner from being woken.

#### Scenario: Pause
- **WHEN** the user pauses a project with a running Workflow
- **THEN** the Workflow continues, the project shows `paused`, and the owner is not woken until resume

### Requirement: Dashboard widget
The plugin SHALL contribute one dashboard widget that shows the projects-list rows and the total needs-you count. The widget MUST read only the index.

#### Scenario: Widget without projects
- **WHEN** no project exists
- **THEN** the widget shows an empty state with a single action to create a project

### Requirement: Layout preferences
Any layout preference of the Architect surface MUST persist through the host layout service and never through browser storage.

#### Scenario: Collapsed history
- **WHEN** the user collapses history and restarts Sero
- **THEN** history is still collapsed
