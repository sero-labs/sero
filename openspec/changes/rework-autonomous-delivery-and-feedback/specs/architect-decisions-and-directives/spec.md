## MODIFIED Requirements

### Requirement: Forced escalations

Regardless of autonomy setting, the system MUST require a user decision before departing from the user's stated outcome/constraints, changing approved workspace placement or authority, delivering to an external destination, or increasing the approved cap. Existing approved charters SHALL retain their scope protections. Authority changes MUST be checked mechanically and MUST NOT depend on the owner choosing to escalate. Internal requirements/acceptance criteria derived from the request, tasks, worker organization and implementation choices SHALL remain revisable through Architect's judgment within that request and authority; revising them alone MUST NOT require another approval.

#### Scenario: Charter change attempted directly
- **WHEN** the owner calls the charter action on a legacy project whose charter is already approved
- **THEN** the call records a decision proposing the change instead of applying it

#### Scenario: Internal plan changes
- **WHEN** Architect replaces one in-scope approach with another using the same approved authority
- **THEN** it updates the working plan and continues without requiring the user to review a new charter

#### Scenario: A user-stated requirement is reduced
- **WHEN** Architect proposes removing a reliability or user-facing requirement explicitly requested by the user
- **THEN** affected work waits for a user decision and the change is not silently adopted

### Requirement: Autonomy setting

New delivery agreements SHALL default to autonomous execution within their approved boundaries. Internal milestone planning, dispatch, verification, acceptance and safe bounded recovery SHALL continue without routine user approvals. The existing `milestones`, `charter-only` and `model-judged` settings SHALL remain readable, and users SHALL retain an optional supervised mode. Existing projects MUST retain their saved setting until the user explicitly changes it. No autonomy setting SHALL bypass forced escalations or runtime verification.

#### Scenario: New autonomous project
- **WHEN** the user approves a new delivery agreement without selecting supervised operation
- **THEN** eligible milestone work starts and continues without per-milestone approval

#### Scenario: Default setting
- **WHEN** a project saved with milestones autonomy loads after upgrade
- **THEN** its milestone approvals remain required until the user changes that authority

### Requirement: Directives and replies

The user SHALL be able to send a directive from the project overview. A directive MUST queue the owner's highest-priority wake. When spending authority permits the turn, the owner MUST reply through the reply action before ending that wake; otherwise the directive SHALL remain saved with a visible budget hold. The overview SHALL show only a short acknowledgement or actionable reply; the complete directive and reply SHALL remain accessible in a separate work/history view. Older directives MUST NOT form a panel or nested disclosures on the overview. A directive MUST NOT silently approve new access, spending or product scope.

#### Scenario: Directive while a Workflow runs
- **WHEN** the user sends a directive while a dispatched Workflow is running
- **THEN** the Workflow continues, the owner replies and the record retains that reply

#### Scenario: A long reply
- **WHEN** the owner records a long technical response
- **THEN** the overview shows a bounded acknowledgement with a link to the complete response instead of expanding into the whole text

## ADDED Requirements

### Requirement: Decisions are short and necessary

A user decision SHALL state one question, why it requires the user, a recommendation and the effect of each choice on the outcome, cost or authority. A decision the owner authors through its `decide` action SHALL present at most two options plus the existing optional user note. The runtime-authored research-access decision keeps its saved three options for projects without an agreement; an agreement project answers research access from its approved envelope and does not raise that question. Saved decisions SHALL retain every original option, identifier, consequence and recommendation until answered, including decisions with more than two options; loading MUST NOT rewrite pending consent to meet the new limit. Supporting plans, logs and research SHALL be available separately, not embedded in the decision body. Architect SHALL use judgment for ordinary open choices and recoverable failures within approved authority, asking only when uncertainty could materially change the user's intended result or when new authority is needed. A decision's full consent-relevant meaning MUST NOT be hidden by truncation or folding.

#### Scenario: Existing decision has three choices
- **WHEN** an unanswered saved research-access decision offers allowing commands, answering in a note or withdrawing the question
- **THEN** all three original choices remain visible and answerable with their original effects
- **AND** loading the project does not select, remove or rewrite an option

#### Scenario: A library choice within scope
- **WHEN** two libraries meet the approved outcome and authority and neither poses an unresolved product consequence
- **THEN** Architect chooses and records its reasoning in work detail without asking the user to choose a library

#### Scenario: A real product fork
- **WHEN** a choice changes the agreed instrument experience
- **THEN** the user sees a short question with a recommendation and clear consequences before affected work continues

#### Scenario: Recovery is exhausted
- **WHEN** safe recovery exhausts its authorized limits
- **THEN** the decision states what is blocked, what was tried and the recommended next action without requiring the user to diagnose a worker transcript
