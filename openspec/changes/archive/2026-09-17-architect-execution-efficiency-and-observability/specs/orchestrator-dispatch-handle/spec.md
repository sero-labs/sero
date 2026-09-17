## ADDED Requirements

### Requirement: Creation carries optional project execution context
Typed Workflow and Room creation SHALL accept optional project/run correlation and project model defaults without exposing new management actions. Creation SHALL retain this context before planning and preserve it across recovery and retries. Requests without project context SHALL retain existing behavior. Correlation metadata MUST NOT grant access to a foreign project, session or workspace. The existing planner, validation, placement, approval and grant boundaries SHALL remain in force.

#### Scenario: Architect dispatch survives restart
- **WHEN** creation is interrupted after a project request was retained but before its dispatch link was saved
- **THEN** recovery reuses the original request's run correlation and model defaults without creating a duplicate dispatch or resolving different defaults

#### Scenario: Ordinary Workflow creation
- **WHEN** a user creates a Workflow without Architect context
- **THEN** existing global model selection and creation behavior remain available

### Requirement: Explicit trigger intent avoids redundant inference
Workflow creation SHALL distinguish caller-declared one-off work, caller-supplied validated triggers and unspecified natural-language trigger intent. Explicit one-off or fully supplied trigger settings SHALL avoid a model call solely to infer those settings. Unspecified intent SHALL retain natural-language trigger extraction. This distinction MUST NOT bypass planning the Workflow's execution or weaken trigger validation.

#### Scenario: One-off milestone
- **WHEN** Architect creates a Workflow explicitly for a one-off milestone
- **THEN** the Workflow plans its execution but does not invoke a model solely to infer whether the task recurs

#### Scenario: Natural-language automation
- **WHEN** a user creates a Workflow with a cadence in its goal and leaves trigger intent unspecified
- **THEN** the existing trigger extraction and validation path still derives the schedule

#### Scenario: Explicit maintenance triggers
- **WHEN** Architect supplies the complete validated maintenance triggers
- **THEN** those triggers are retained without a second model call to rediscover them
