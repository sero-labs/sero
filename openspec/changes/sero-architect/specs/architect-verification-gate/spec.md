## Purpose

The verification gate makes sure a milestone closes only on mechanical evidence, so the Architect never reports hollow success on the strength of a summary or an agent's claim.

## ADDED Requirements

### Requirement: Evidence closes a milestone
A milestone SHALL move to `done` only when evidence attached to it includes at least one command run with its exit code and captured output, and, when the milestone declares a preview, a dev-server smoke check result and one capture or screenshot. A milestone that changes files MUST also carry a diff summary. The system MUST refuse a `done` request that lacks any required item and MUST name the missing item to the owner.

#### Scenario: Claim without evidence
- **WHEN** the owner marks a milestone done after its Workflow reported completion but attaches no command result
- **THEN** the milestone stays `verifying` and the owner receives the list of missing evidence

#### Scenario: Failing command
- **WHEN** the attached command result has a non-zero exit code
- **THEN** the milestone is not closed and the failure is recorded as the reason

### Requirement: Dispatch completion is a claim
A completion signal from a dispatched Workflow or Room MUST move the milestone to `verifying`, not to `done`. The owner is woken to verify.

#### Scenario: Workflow completes
- **WHEN** a linked Workflow's status becomes complete
- **THEN** the milestone becomes `verifying` and the owner's next contract asks for evidence

### Requirement: Evidence is recorded and reviewable
Accepted evidence MUST be stored with the milestone and shown on the project page behind the milestone entry, including the commands, exit codes, the capture reference and the diff summary.

#### Scenario: Review evidence
- **WHEN** the user expands a done milestone
- **THEN** the commands, their exit codes and the capture are visible

### Requirement: Limits and stops are never evidence
Reaching any budget or limit, a paused or stopped Workflow, and a Workflow that ended because a management limit was reached MUST NOT count as evidence and MUST NOT close a milestone.

#### Scenario: Workflow hit its attempt limit
- **WHEN** a linked Workflow blocks on a management limit
- **THEN** the milestone stays `running` or moves to `parked`, and no evidence is recorded
