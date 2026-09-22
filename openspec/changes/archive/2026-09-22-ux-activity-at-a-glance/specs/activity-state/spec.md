## Purpose

One vocabulary of activity states, shared by Architect, the Orchestrator, Rooms and the workspace tree, so the same situation reads the same way on every surface and never depends on a colour or an animation.

## ADDED Requirements

### Requirement: One state vocabulary

Sero SHALL name an activity state with exactly one of: `working`, `queued`, `waiting-for-trigger`, `waiting-for-you`, `paused`, `idle`, `complete`, `stopped`, `last-known`. Every surface that shows an activity state MUST take its word, its glyph and its sentence from this vocabulary rather than defining its own. A surface MAY shorten the sentence but MUST NOT rename a state or introduce another one.

#### Scenario: The same Workflow on two surfaces

- **WHEN** one Workflow is armed on triggers and is shown both on Orchestrator Home and in the Workflows list
- **THEN** both read `Waiting for a trigger` with the same glyph

#### Scenario: An unmapped situation

- **WHEN** a record's saved status has no mapping in the vocabulary
- **THEN** the surface shows `last-known` with the saved time rather than inventing a word

### Requirement: A state is a word and a shape, never colour or motion alone

Every state SHALL be shown as a word with a glyph whose shape differs from every other state's glyph. No state may be conveyed by colour alone, and none may depend on animation. With the reduced-motion preference set, the state and any required user action MUST remain fully readable.

#### Scenario: Reduced motion

- **WHEN** the user enables reduced motion
- **THEN** every state on the projects list, Orchestrator Home, the Workflows list, the Rooms list and the workspace tree still reads as a word with its glyph, and no meaning is lost

#### Scenario: Colour removed

- **WHEN** a state's colour is ignored
- **THEN** the word and glyph alone still distinguish it from every other state

### Requirement: Each state says what happens next

Each state SHALL carry one sentence naming what happens next or what the user must do. `waiting-for-trigger` MUST name what starts the work, so a schedule is not read as a stall. `stopped` MUST name the cause and the action that clears it. `waiting-for-you` MUST name the action asked of the user.

#### Scenario: Armed maintenance

- **WHEN** a maintenance Workflow is armed on a GitHub issue, a CI failure and a weekly schedule
- **THEN** the row reads `Waiting for a trigger` and names those triggers and the time it last ran

#### Scenario: An interrupted run

- **WHEN** a run was interrupted with no result recorded
- **THEN** the state reads `Stopped`, not failed, and offers the action that clears it

### Requirement: Working requires an observed report

A surface SHALL show `working` only while a run is attached and has reported to this Sero session. A saved status of running, active or in progress MUST NOT by itself produce `working`. When no report has been observed in this session, or no report has arrived for longer than that work normally takes, the surface SHALL show `last-known` with the time of the last saved report and MUST NOT claim the work either failed or continued.

#### Scenario: A saved status outlives its run

- **WHEN** a project's milestone is saved as running and its Workflow last reported three days ago with nothing attached now
- **THEN** the row reads `Last known` with that time, never `Working`

#### Scenario: A live run reports

- **WHEN** a run is attached and reports in this session
- **THEN** the row reads `Working`, names the work and who owns it

### Requirement: No invented progress

A state MUST NOT be accompanied by an invented percentage, an estimated finish time, or an elapsed timer standing in for progress. Known completed work SHALL be shown as a count taken from saved records.

#### Scenario: Completed milestones

- **WHEN** a project has accepted six of its seven milestones
- **THEN** the surface shows `6 of 7 milestones accepted` and no percentage or estimate
