## Purpose

One vocabulary of activity states, shared by Architect, the Orchestrator, Rooms and the workspace tree, so the same situation reads the same way on every surface and never depends on a colour or an animation.

## Requirements

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

A surface SHALL show `working` only while a run is attached and its producer has confirmed current activity in this Sero session. Saved running, active or in-progress status MUST NOT establish liveness. Contact SHALL be derived from the producer's open request or tool state in the current session, including during a quiet in-flight model or tool request; a renewal timer is added only where that state cannot be observed. Process contact SHALL be distinct from meaningful activity: a contact update MUST NOT claim new output or progress. If the producer is lost or none is attached, the surface SHALL show `last-known` with the last observed activity time and an unavailable timestamp where none exists. Terminal saved facts SHALL retain their actual state. Silence alone MUST NOT be called failure.

#### Scenario: A saved status outlives its run
- **WHEN** a project's milestone is saved as running but no producer is attached in this session
- **THEN** the row reads Last known and never Working solely from that saved status

#### Scenario: A live run reports
- **WHEN** an attached run reports current activity in this session
- **THEN** the surface reads Working and names the work and its owner

#### Scenario: A model request is quiet
- **WHEN** the producer confirms an attached in-flight request but no output has arrived recently
- **THEN** the activity stays Working, names the request wait and retains the unchanged last meaningful activity time
- **AND** it does not invent reasoning text or progress

#### Scenario: Observation is lost
- **WHEN** the current session loses the producer while the saved run status remains running
- **THEN** the activity becomes Last known without claiming failure, continued execution or zero elapsed work

### Requirement: No invented progress

An activity state MUST NOT be accompanied by an invented percentage, finish time or elapsed timer presented as progress. Known completed work SHALL use counts from saved records. Explicitly labelled observed wait duration, active runtime and remaining budget SHALL be allowed as time or limit facts, not evidence of completed work. An unavailable measurement MUST remain unavailable rather than zero.

#### Scenario: Completed milestones
- **WHEN** six of seven milestones have been accepted
- **THEN** a work-detail view can show 6 of 7 accepted without an invented percentage or completion estimate

#### Scenario: Request wait
- **WHEN** a known request has been in flight for two minutes
- **THEN** the surface can label that observed wait duration without implying two minutes of progress or a completion estimate

#### Scenario: No measured start
- **WHEN** the source does not provide a request start or active-time measurement
- **THEN** the corresponding duration is unavailable, not synthesized from a saved running label
