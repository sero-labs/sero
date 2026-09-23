## Purpose

Defines what the shell's Back and Forward controls move between and what they
promise, so one Back returns the user to where they came from across apps and
workspaces.

## ADDED Requirements

### Requirement: A launch replaces the entry the app opened on

When an app opens with launch parameters that land it on a view inside that app,
its first recorded location SHALL replace the entry the shell created for that
app rather than follow it. One Back SHALL then reach the location the user came
from. The view the app last showed in that workspace MUST NOT remain as a step in
history.

#### Scenario: A Workflow that Architect opened

- **WHEN** the user opens a Workflow in the Orchestrator from the Architect project that dispatched it, and the Orchestrator lands on that Workflow
- **THEN** one Back returns to the Architect project
- **AND** the page the Orchestrator last showed in that workspace is not a step between them

#### Scenario: A Room that Architect opened

- **WHEN** the user opens a Room in the Orchestrator from the Architect project that dispatched it
- **THEN** one Back returns to the Architect project

#### Scenario: A launch arrives while the app is already showing

- **WHEN** a launch parameter reaches an app that is already the active app
- **THEN** the location it names is recorded as a navigation, and Back returns to the location the app was on before it

### Requirement: A workspace switch records a step

Changing the active workspace while the active app stays the same SHALL record the
app's location in the new workspace as a place in history. One Back SHALL return
to the exact page the user left in the previous workspace. A change of workspace
that is part of opening a different app SHALL NOT record a separate step for the
app being left.

#### Scenario: Switching workspace from the sidebar

- **WHEN** the user is on a Workflow page in one workspace and chooses another workspace in the sidebar
- **THEN** the new workspace's page for that app is shown
- **AND** one Back returns to the Workflow page the user left

#### Scenario: Opening an app in a different workspace

- **WHEN** an action opens a different app in a different workspace
- **THEN** history records the app that opened, and one Back returns to the page the user left in the workspace they left
- **AND** the app being left is not recorded again in the new workspace

#### Scenario: Returning across workspaces

- **WHEN** Back moves to a place in a different workspace
- **THEN** the workspace moves to that place's workspace and the history position is that place, with the places already visited unchanged

### Requirement: The Back and Forward controls name the workspace they land in

The title bar's Back control SHALL name the app it returns to and the workspace of
the place it lands in, separated from the app's name. The Forward control SHALL
follow the same rule. Where the place being reached names no workspace, the
control SHALL name the active workspace the user will be in.

#### Scenario: Back to a global app

- **WHEN** the user is in the Orchestrator in DungeonExplorer and Back returns to Architect, which names no workspace
- **THEN** the Back label reads `Back to Architect · DungeonExplorer`

#### Scenario: Back to another workspace

- **WHEN** the user is in reading-tracker-resilience-01 and Back returns to the Orchestrator in FroggerNeon
- **THEN** the Back label reads `Back to Sero Orchestrator · FroggerNeon`

#### Scenario: Back within one workspace

- **WHEN** the place Back reaches is in the workspace the user is already in
- **THEN** the Back label names that workspace
