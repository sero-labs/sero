# Spec Delta

## Purpose

Let the persistent Architect owner perform milestone work through the existing project lifecycle without compulsory delegation.

## ADDED Requirements

### Requirement: Owner execution is a first-class choice

Architect SHALL be able to execute a milestone in its existing persistent owner session within current approved authority and placement. Direct execution MUST NOT require a Workflow, Room, planning worker or classification stage. Existing delegated execution SHALL remain available, and the agent SHALL choose its approach from the task and findings.

#### Scenario: A small implementation needs one agent
- **WHEN** an approved request can be completed by the owner within its authorized capabilities
- **THEN** the owner can implement it, report it and request verification without creating delegated work

#### Scenario: The task needs specialists
- **WHEN** findings justify collaboration or structured execution
- **THEN** Architect can use existing Rooms or Workflows within current authority
- **AND** it preserves prior work and reconciles the active execution before starting another writer

### Requirement: Execution identity precedes effects

Direct work SHALL have a durable identity linked to its milestone, objective run, owner session, workspace, starting artifact state and current requirement revision before execution begins. Overlapping writers SHALL obey existing workspace coordination. Repeated start requests and restart recovery MUST NOT create duplicate active execution.

#### Scenario: Restart after start is recorded
- **WHEN** the runtime restarts after saving an execution identity but before confirming work began
- **THEN** it reconciles the saved execution and retained session before resuming or retrying
- **AND** it preserves files and cannot treat interruption as completion

### Requirement: Continuation preserves authority and context

Eligible direct execution SHALL continue in the same owner session across turns and restart, with current project authority and active-work context restored after compaction. Every paid continuation SHALL check the remaining start budget and current controls. User-approved limits MUST NOT be raised by an agent, and unsafe or exhausted recovery SHALL hold with a specific reason.

#### Scenario: Useful work exceeds one turn
- **WHEN** approved work remains and continuation is safe within current limits
- **THEN** the same session continues without a manual resume solely because a turn ended

#### Scenario: An external effect is uncertain
- **WHEN** interruption leaves an external action's result unknown
- **THEN** recovery reconciles its identity and receiver state or asks for a decision before repeating the action

### Requirement: Direct work shares evidence and delivery rules

Direct completion SHALL be a claim linked to the execution identity, not acceptance. Runtime-produced evidence SHALL use the same artifact freshness, requirement coverage and preview rules as delegated work. Acceptance and delivery SHALL retain their separate states and applicable receipt requirements, including approved external destinations.

#### Scenario: A completion claim has no evidence
- **WHEN** the owner reports its implementation complete without passing runtime evidence
- **THEN** the milestone enters verification and cannot be accepted or presented as delivered

#### Scenario: Workspace output is delivered
- **WHEN** current evidence proves the requested output and the runtime observes the applicable workspace delivery receipt
- **THEN** the accepted result is available in the user's workspace without a synthetic dispatch

### Requirement: Direct execution remains observable and counted once

Owner execution SHALL appear in existing project activity, work detail, history and run metrics with its actual state, available cost and the count of consecutive continuations without a workspace change. Owner turns attributed to direct execution MUST NOT be charged again as a separate worker. Missing usage SHALL remain incomplete, and late observations SHALL stay linked to their original objective and execution.

#### Scenario: Work finishes while the project is paused
- **WHEN** an in-flight owner turn finishes after pause or stop
- **THEN** its output and usage remain visible on the original run
- **AND** no new autonomous turn starts until current user controls permit it
