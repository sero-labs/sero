## Purpose

A plugin runtime in Electron main can create Workflows and Rooms through the typed Orchestrator registry. This lets runtimes that cannot use session tools dispatch work without a plugin-specific bridge.

## Requirements

### Requirement: Create a Workflow through the typed handle

The typed Orchestrator board action set in `@sero-ai/common` SHALL include a `create` action carrying the prompt, an optional title and the existing creation options, and the action result SHALL return the new loop id. The coordinator MUST route it to the same creation path the `orchestrator` tool uses, with the same planner, limits and validation.

#### Scenario: Runtime creates a Workflow

- **WHEN** a plugin runtime calls `create` on the coordinator registered for a workspace
- **THEN** a Workflow is created in that workspace, its id is returned, and it appears in the watched index and on the Agent Board like any other Workflow

#### Scenario: No coordinator for the workspace

- **WHEN** a plugin runtime calls `create` for a workspace that has no registered coordinator
- **THEN** the call fails with a result naming the workspace and nothing is created

### Requirement: Create a Room through a typed handle

The Room coordinator registry SHALL be typed in `@sero-ai/common` beside the Workflow registry, with a `create` action carrying the mandate and returning the room id. Room creation through the handle MUST go through the same per-grant user approval as creation from the `rooms` tool.

#### Scenario: Runtime creates a Room

- **WHEN** a plugin runtime calls `create` on the Room registry entry for a workspace
- **THEN** the grant proposal is clamped and shown to the user, and on approval the Room exists with the returned id

### Requirement: No other widening

The handle MUST NOT expose delete, revise, library, catalog or override actions to plugin runtimes, and MUST NOT add IPC or a host capability declaration.

#### Scenario: Unsupported action

- **WHEN** a plugin runtime sends an action kind outside the typed set
- **THEN** the type check fails at build time and the runtime rejects it at run time

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
