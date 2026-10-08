# Spec Delta

## MODIFIED Requirements

### Requirement: Four states never substitute for one another

The system SHALL keep four states distinct for every milestone and release: reported (a linked direct or delegated execution signalled completion), verified (every evidence item passed), accepted (the owner closed the milestone on verified evidence), and delivered (a release receipt was observed for the accepted artifact). A lower state MUST NOT be presented as, or advance the record to, a higher one. Direct owner work SHALL use the same runtime-produced evidence, freshness and requirement-coverage rules as delegated work.

#### Scenario: Receipt without verification
- **WHEN** a delivery receipt exists for a milestone whose evidence is missing or failed
- **THEN** the milestone stays `verifying`, the receipt is shown as delivery evidence only, and the project page does not show the milestone as done

#### Scenario: Verified but not accepted
- **WHEN** every evidence item passed and the owner has not called milestone done
- **THEN** the milestone stays `verifying` and the owner's next contract asks for the acceptance call

#### Scenario: Owner implements and reports
- **WHEN** a direct execution reports completion
- **THEN** the owner's report alone establishes neither verification nor acceptance nor delivery

### Requirement: Dispatch completion is a claim

A completion signal from a linked Workflow, Room or direct owner execution MUST move the milestone to `verifying`, not to `done`. The owner SHALL obtain runtime evidence before acceptance; delegated completion SHALL wake the owner to verify. The runtime MUST reject a direct completion report that does not belong to the current milestone execution and applicable requirement revision.

#### Scenario: Workflow completes
- **WHEN** a linked Workflow's status becomes complete
- **THEN** the milestone becomes `verifying` and the owner's next contract asks for evidence

#### Scenario: Direct completion needs no dispatch
- **WHEN** the current direct execution reports completion with its linked identity
- **THEN** runtime evidence can run without a Workflow or Room dispatch
- **AND** failed, stale or superseded evidence still prevents acceptance

#### Scenario: Superseded direct work reports late
- **WHEN** a completion report belongs to an execution replaced by newer milestone work
- **THEN** it remains historical and cannot put the current milestone into accepted or delivered state

### Requirement: Limits and stops are never evidence

Reaching any budget or limit, a paused or stopped execution, and execution that ended because a management limit was reached MUST NOT count as evidence and MUST NOT close a milestone. This applies equally to owner execution, Workflows and Rooms.

#### Scenario: Workflow hit its attempt limit
- **WHEN** a linked Workflow blocks on a management limit
- **THEN** the milestone stays `running` or moves to `parked`, and no evidence is recorded

#### Scenario: Owner work is interrupted
- **WHEN** a direct execution stops at a watchdog, user stop or budget limit
- **THEN** its partial work remains recoverable and no completion or passed evidence is inferred from that stop
