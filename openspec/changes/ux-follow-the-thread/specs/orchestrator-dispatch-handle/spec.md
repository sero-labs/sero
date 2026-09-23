## MODIFIED Requirements

### Requirement: Creation carries optional project execution context

Typed Workflow and Room creation SHALL accept optional project/run correlation, project model defaults, and the display name of the project that requested the work, without exposing new management actions. Creation SHALL retain this context before planning and preserve it across recovery and retries. The retained display name SHALL be the project's name at the moment the work was requested; it is attribution for display only, and a later rename of the project MUST NOT change it. Requests without project context SHALL retain existing behavior. Correlation metadata MUST NOT grant access to a foreign project, session or workspace. The existing planner, validation, placement, approval and grant boundaries SHALL remain in force.

#### Scenario: Architect dispatch survives restart

- **WHEN** creation is interrupted after a project request was retained but before its dispatch link was saved
- **THEN** recovery reuses the original request's run correlation and model defaults without creating a duplicate dispatch or resolving different defaults

#### Scenario: Ordinary Workflow creation

- **WHEN** a user creates a Workflow without Architect context
- **THEN** existing global model selection and creation behavior remain available
- **AND** the creation retains no project name

#### Scenario: The requesting project is renamed

- **WHEN** a project that created a Workflow or a Room is renamed after the work was created
- **THEN** the retained name stays as it was when the work was requested, and the work still reaches the renamed project by its id
