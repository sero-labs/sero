## Purpose

The verification gate closes a milestone only on mechanical evidence. A summary or agent claim is not enough.

## Requirements

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

Accepted evidence SHALL be stored with the relevant milestone and accessible in a separate work/evidence view, including commands, exit codes, capture references, diff summary, freshness, the checked artifact revision and, for new evidence, the requirements/check revision it proves. The overview SHALL show only a short result/check summary and a direct evidence link. Moving evidence out of the overview MUST NOT remove existing proof or change its acceptance state.

#### Scenario: Review evidence
- **WHEN** the user opens evidence for accepted work
- **THEN** the recorded commands, exit codes, captures, diff and checked revision are available in the separate view

#### Scenario: Old evidence is still available
- **WHEN** an existing project is opened in the new UI
- **THEN** its evidence remains reviewable without reaccepting, rewriting or deleting it

### Requirement: Limits and stops are never evidence
Reaching any budget or limit, a paused or stopped Workflow, and a Workflow that ended because a management limit was reached MUST NOT count as evidence and MUST NOT close a milestone.

#### Scenario: Workflow hit its attempt limit
- **WHEN** a linked Workflow blocks on a management limit
- **THEN** the milestone stays `running` or moves to `parked`, and no evidence is recorded

### Requirement: Delivery proves the user's requested result

The project SHALL report a requested outcome as delivered only when relevant runtime-produced evidence establishes usable output against the user's request and stated constraints. Architect SHALL determine and revise suitable acceptance criteria and checks just in time from the request, actual risks and findings. The product MUST NOT select checks or completion gates from a quality/readiness label or preset solution category. Agent-authored checks MUST NOT remove user-stated requirements or permit stale/failed evidence. Unmet requirements SHALL remain explicit. Research completion, successful worker termination, milestone counts or generic passing checks MUST NOT alone establish product delivery.

#### Scenario: Example browser instrument request
- **WHEN** the user requested a playable browser instrument with specific keys and sound controls and it is reported delivered
- **THEN** fresh evidence demonstrates those requested behaviors on the delivered files
- **AND** the user can use the result without transferring files or managing a research Room
- **AND** this example does not define a reusable product category or mandatory check list for other requests

#### Scenario: A requested requirement remains unproved
- **WHEN** evidence is missing or fails for a requirement such as reliable deployment that the user actually requested
- **THEN** completion of that request is not claimed and the gap is shown with the next needed action

#### Scenario: Findings change the required checks
- **WHEN** an implementation finding exposes a risk relevant to the user's request
- **THEN** Architect can add or revise the appropriate checks without changing a readiness tier
- **AND** a revised plan cannot silently drop a requirement stated by the user

### Requirement: Evidence follows the current requirements and checks

New evidence SHALL identify the user requirements and acceptance criteria it covers, the relevant requirements/check revision, preview target where applicable and checked artifact revision. Changes to a requirement, acceptance criterion, check or preview target SHALL invalidate affected evidence and acceptance even when files do not change. A late result for a superseded revision MUST NOT restore current acceptance. Unaffected evidence MAY remain valid when its coverage and artifact freshness still hold; unrelated plan edits MUST NOT force a full recheck. Completion SHALL account for every current user requirement through applicable evidence or an explicit unmet/unproved gap; a gap MUST NOT be omitted to claim delivery. Architect SHALL select and revise checks through judgment, not a preset checklist. In-scope rechecking SHALL proceed within existing authority without a new user approval. Detailed coverage and revisions SHALL remain in work/evidence detail, not add controls to the overview. Legacy evidence SHALL remain readable without inventing revision data; reuse for changed work requires confirmed applicability.

#### Scenario: Criterion changes while a check runs
- **WHEN** Architect revises a criterion or preview target while an evidence run is in flight and the project files stay unchanged
- **THEN** the old result remains historical and cannot accept the revised work
- **AND** Architect obtains applicable evidence within the approved limits without asking the user to approve the internal check change

#### Scenario: Unrelated plan edit
- **WHEN** a plan edit changes worker organization but does not affect a requirement, check, preview target or checked artifact
- **THEN** valid evidence stays usable without another approval or a full repeat of verification

### Requirement: Completion leads with the usable result

The completion summary SHALL state what was delivered, how to use it, what was checked and important limits, with detailed evidence available separately. The system MUST preserve distinct reported, verified, accepted and delivered states. It MUST NOT show a closed internal phase or accepted-milestone count as a substitute for the useful result.

#### Scenario: Workspace delivery
- **WHEN** a verified application is accepted and delivered to the project workspace
- **THEN** the overview leads with its usable preview or run instructions, a short check summary and known limits
- **AND** internal plan and milestone history remain available only in the separate work views
