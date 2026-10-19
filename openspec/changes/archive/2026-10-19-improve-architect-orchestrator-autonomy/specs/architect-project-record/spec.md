# Spec Delta

## MODIFIED Requirements

### Requirement: Milestones link to their work

Each milestone SHALL have a title, a status of `planned`, `approved`, `running`, `verifying`, `done` or `parked`, an optional plan, links to its direct owner execution or the Orchestrator Workflow or Room that delivers it, and the evidence that closed it. Direct execution links SHALL retain execution, objective-run and owner-session identity, workspace, starting artifact state and requirement revision. A dispatch link SHALL also record when its work was last observed reporting and, when a project pause disarmed the dispatched Workflow's triggers, which triggers it disarmed. A milestone MUST NOT be `done` without evidence accepted by the verification gate. Existing records MUST remain readable without inventing execution identities, rewriting saved dispatches or conferring approval.

#### Scenario: Milestone shows its dispatch
- **WHEN** the Architect dispatches a Workflow for a milestone
- **THEN** the milestone records the Workflow id and workspace so the UI can link to the Orchestrator record

#### Scenario: A report is observed
- **WHEN** the runtime observes the dispatched Workflow report while it is running
- **THEN** the dispatch link records that observation and its time

#### Scenario: Pause disarms and resume restores
- **WHEN** a project pause disarms two of the maintenance Workflow's three triggers, the third having already been off
- **THEN** the dispatch link records those two trigger ids, and resume re-arms those two only

#### Scenario: Direct execution is retained
- **WHEN** the owner starts approved milestone work without delegation
- **THEN** the record links that milestone to its saved owner execution before work begins
- **AND** restart retains those identities and partial results

#### Scenario: Old records load
- **WHEN** a milestone saved before direct execution support is opened
- **THEN** its saved dispatch, authority, status and evidence remain unchanged
