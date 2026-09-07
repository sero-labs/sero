## Purpose

A plugin runtime in Electron main can create Workflows and Rooms through the typed Orchestrator registry, so a runtime that cannot use session tools can still dispatch work without a plugin-specific bridge.

## ADDED Requirements

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
