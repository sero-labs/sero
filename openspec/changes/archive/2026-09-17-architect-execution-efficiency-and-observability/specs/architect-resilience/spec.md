## ADDED Requirements

### Requirement: Architect delegates evaluable objectives without duplicating execution plans
Architect SHALL choose Rooms, Workflows or focused research according to the task, provide an evaluable objective, approved constraints and acceptance criteria, guide delegated work and judge the result. Rooms SHALL retain dynamic specialist collaboration for investigation, solution planning and adversarial review. Workflows SHALL plan their own structured execution flow toward their assigned objective, not replace project-level solution planning. The system MUST NOT impose a fixed mode sequence, roster, worker count or detailed owner-authored execution plan.

#### Scenario: Collaborative solution planning
- **WHEN** Architect decides that a project question benefits from several communicating specialists
- **THEN** it can delegate that objective to a Room which chooses its members and internal approach
- **AND** Architect evaluates the synthesized result without requiring a Workflow to plan the overall solution first

#### Scenario: Structured execution follows planning
- **WHEN** Architect assigns execution based on accepted planning findings
- **THEN** the Workflow plans the needed execution flow from those findings and constraints rather than being instructed to redo completed solution planning

### Requirement: Handoffs preserve relevant evidence without copying full traces
Delegated work SHALL receive relevant approved requirements, decisions, findings and accessible evidence references with their status or freshness. Planning recommendations MUST remain distinct from user approvals. The system MUST NOT automatically copy predecessor transcripts or all accumulated historical notes into every worker. Required authority constraints and routing data MUST remain available. A worker SHALL be able to inspect missing or stale evidence under its existing permissions instead of trusting an incomplete summary.

#### Scenario: Room findings inform a Workflow
- **WHEN** a Room finishes planning and Architect delegates implementation
- **THEN** the Workflow receives the relevant decisions and report references without the Room's complete conversation
- **AND** unapproved recommendations remain labelled as recommendations

#### Scenario: Global decision affects several members
- **WHEN** a decision applies to all Room members but names none of them individually
- **THEN** each affected member receives that decision or a clear accessible reference

### Requirement: Additional workers have a task-specific purpose
Planner guidance SHALL favor a separate worker when it provides independent judgment, specialist work, useful concurrency or a required authority boundary. It SHALL discourage workers that only repeat already recorded discovery, summarize completed results or emit administrative completion when the final substantive step can do so. This guidance MUST NOT remove required independent evaluation, approvals or delivery checks, and MUST NOT mechanically reject plans based on agent count. Concurrent editing SHALL respect independent scopes and existing workspace coordination.

#### Scenario: Report-only finalization
- **WHEN** the final substantive step can verify its assigned outcome and emit the required completion without another authority boundary
- **THEN** planner guidance does not require a separate finalization worker merely to repeat the result

#### Scenario: Independent refactoring scopes
- **WHEN** separate editing tasks have independent file scopes and concurrency benefits the objective
- **THEN** a Room can still organize that work under existing isolation and coordination rules

### Requirement: Efficiency preserves independent judgment
An implementer SHALL be able to investigate, edit and run development tests without its self-check being represented as independent acceptance. Independent evaluation SHALL inspect approved requirements and actual results without inheriting the implementer's reasoning trace. If a reviewer modifies product behavior, those modifications SHALL remain subject to independent judgment. Repair SHALL preserve valid work and use precise findings; re-review SHALL focus on those findings and directly affected behavior unless evidence requires broader checks. Runtime-owned evidence and Architect acceptance MUST remain mandatory.

#### Scenario: Implementer's tests pass
- **WHEN** an implementer reports passing tests but independent evaluation finds missing required behavior
- **THEN** Architect does not accept the milestone and the missing behavior remains a repair finding

#### Scenario: Focused repair
- **WHEN** a repair addresses a named review finding without invalidating unrelated evidence
- **THEN** the next review checks the finding and its direct effects rather than requiring a fresh whole-project investigation

#### Scenario: Reviewer edits the product
- **WHEN** a reviewer fixes a product defect itself
- **THEN** its own fix is not labelled independently verified solely by that reviewer's claim
