## MODIFIED Requirements

### Requirement: Milestones link to their work
Each milestone SHALL have a title, a status of `planned`, `approved`, `running`, `verifying`, `done` or `parked`, an optional plan, links to the Orchestrator Workflow or Room that delivers it, and the evidence that closed it. A dispatch link SHALL also record when its work was last observed reporting and, when a project pause disarmed the dispatched Workflow's triggers, which triggers it disarmed. A milestone MUST NOT be `done` without evidence accepted by the verification gate.

#### Scenario: Milestone shows its dispatch
- **WHEN** the Architect dispatches a Workflow for a milestone
- **THEN** the milestone records the Workflow id and workspace so the UI can link to the Orchestrator record

#### Scenario: A report is observed
- **WHEN** the runtime observes the dispatched Workflow report while it is running
- **THEN** the dispatch link records that observation and its time

#### Scenario: Pause disarms and resume restores
- **WHEN** a project pause disarms two of the maintenance Workflow's three triggers, the third having already been off
- **THEN** the dispatch link records those two trigger ids, and resume re-arms those two only

## ADDED Requirements

### Requirement: The index carries a derived activity, not written prose

Each index entry SHALL carry an activity derived from the project record and the watched Orchestrator indexes: a state from the shared activity vocabulary, the work it refers to, whose work it is, the action needed from the user if any, and the time of the last saved report. The Architect's own written sentence SHALL remain on the project record for the project page and MUST NOT be the source of an index entry's state.

#### Scenario: The model writes a stale sentence

- **WHEN** the Architect's last written sentence says it is working but no run has reported
- **THEN** the index entry's state is derived as `last-known` and the written sentence is not used as the state

#### Scenario: Whose work it is

- **WHEN** a milestone is running in a Room while the owner takes no turn
- **THEN** the entry names the Room as the owner of the work and records the Architect as idle

### Requirement: Liveness is observed, never assumed

The runtime SHALL mark a dispatch live only while it is running and has itself observed that run report through the watched Orchestrator index. On start, the runtime MUST treat every saved liveness mark from an earlier session as not live until it observes a report again. The index SHALL record whether the runtime is running, so a reader can tell a missing report from a stopped runtime.

#### Scenario: Restart clears stale liveness

- **WHEN** Sero restarts with a dispatch that was live before the restart and nothing reports afterwards
- **THEN** the dispatch is not live and the entry reads `last-known` with the saved report time

#### Scenario: Runtime disabled

- **WHEN** the Architect runtime is disabled by its environment switch
- **THEN** the index records that the runtime is not running, and no entry claims live work
