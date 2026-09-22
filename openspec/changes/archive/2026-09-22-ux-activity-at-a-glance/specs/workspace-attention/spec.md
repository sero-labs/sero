## Purpose

Tell a person, from the workspace tree alone, which workspace holds work that needs them or has stopped, without opening an app.

## ADDED Requirements

### Requirement: One icon on a workspace that needs you

A workspace row SHALL show one small icon beside its name when work in that workspace needs the user or has stopped, and no icon otherwise. The icon MUST NOT be a count, a progress mark or an animation, and no row is added under the workspace.

#### Scenario: A Room waits on the user

- **WHEN** a Room in a workspace has been waiting on the user for nine days
- **THEN** that workspace's row shows the icon and the others do not

#### Scenario: Nothing needs the user

- **WHEN** every piece of work in a workspace is complete or armed on a trigger
- **THEN** that row shows no icon

#### Scenario: Several things need the user

- **WHEN** a workspace holds both a waiting Room and a stopped Workflow
- **THEN** the row still shows one icon

### Requirement: The words are available without a pointer

Hover and keyboard focus on the icon SHALL give the reason in the same words the owning app uses for it. The reason MUST be reachable by keyboard and MUST NOT depend on hover alone.

#### Scenario: Keyboard user

- **WHEN** the user moves focus to the icon with the keyboard
- **THEN** the reason is shown, worded as the Architect projects list or the Orchestrator list words it

#### Scenario: Same words as the app

- **WHEN** the Architect list says `Stopped by the spend cap` for a project in that workspace
- **THEN** the tree gives that same sentence

### Requirement: The tree reads existing records only

The indicator SHALL be derived from records the apps already publish, read through the existing watched app-state channel, and MUST NOT poll, start a runtime, call a model or require an app to be open. A workspace whose records cannot be read SHALL show no icon rather than a guess.

#### Scenario: The app has never been opened

- **WHEN** the Orchestrator has not been opened in this session and a workspace holds a Room waiting on the user
- **THEN** the row shows the icon from the watched records

#### Scenario: Records unreadable

- **WHEN** a workspace's records cannot be read
- **THEN** the row shows no icon and nothing claims that work is fine
