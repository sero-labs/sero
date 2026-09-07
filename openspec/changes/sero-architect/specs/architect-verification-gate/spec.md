## Purpose

The verification gate makes sure a milestone closes only on mechanical evidence, so the Architect never reports hollow success on the strength of a summary or an agent's claim.

## ADDED Requirements

### Requirement: The runtime produces the evidence
Evidence SHALL be produced by the Architect runtime, never attached by the owner. The owner names the commands to run and, for a preview milestone, the route to open; the runtime runs the commands with their exit codes and captured output, takes the diff summary from git when files changed, and, when the milestone declares a preview, runs the dev-server smoke check and records one capture or screenshot. Each evidence item MUST record the commit it was checked against.

#### Scenario: Owner supplies an exit code
- **WHEN** the owner's evidence call carries an exit code, a capture or a diff summary instead of commands and a route
- **THEN** the call is refused and no evidence is recorded

#### Scenario: Evidence is stale
- **WHEN** the milestone's files change after evidence was recorded
- **THEN** the evidence is marked stale and the runtime reruns it before the milestone can close

### Requirement: Evidence closes a milestone
A milestone SHALL move to `done` only when its evidence includes at least one command run with a zero exit code and captured output, and, when the milestone declares a preview, a passing dev-server smoke check and one capture or screenshot. A milestone that changes files MUST also carry a diff summary. The system MUST refuse a `done` request that lacks any required item or carries a failed item and MUST name it to the owner.

#### Scenario: Claim without evidence
- **WHEN** the owner marks a milestone done after its Workflow reported completion but no evidence run has happened
- **THEN** the milestone stays `verifying` and the owner receives the list of missing evidence

#### Scenario: Failing command
- **WHEN** a command in the evidence run has a non-zero exit code
- **THEN** the milestone is not closed and the failure is recorded as the reason

### Requirement: Four states never substitute for one another
The system SHALL keep four states distinct for every milestone and release: reported (a dispatched run signalled completion), verified (every evidence item passed), accepted (the owner closed the milestone on verified evidence), and delivered (a release receipt was observed for the accepted artifact). A lower state MUST NOT be presented as, or advance the record to, a higher one.

#### Scenario: Receipt without verification
- **WHEN** a delivery receipt exists for a milestone whose evidence is missing or failed
- **THEN** the milestone stays `verifying`, the receipt is shown as delivery evidence only, and the project page does not show the milestone as done

#### Scenario: Verified but not accepted
- **WHEN** every evidence item passed and the owner has not called milestone done
- **THEN** the milestone stays `verifying` and the owner's next contract asks for the acceptance call

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
