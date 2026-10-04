## MODIFIED Requirements

### Requirement: Per-grant approval unchanged
Adding the allowlist entry MUST NOT change the per-grant approval for the owner-session grant and for grants requested outside an approved Architect delivery agreement: every such proposal is clamped against the real model, workspace, tool and skill catalogues and approved by the user as clamped. Grants for Architect-linked Rooms are the one exception, and only when the requirement below is satisfied.

#### Scenario: Proposal names an unavailable model
- **WHEN** the Architect proposes an owner session with a model that is not configured
- **THEN** the proposal is clamped before the user sees it and the approved grant omits that model

#### Scenario: Standalone Room
- **WHEN** a Room created directly in Orchestrator requests its member grant
- **THEN** the user approves the clamped proposal exactly as today

## ADDED Requirements

### Requirement: Bounded project approval covers linked Room grants

A delivery agreement SHALL approve a host-clamped project execution envelope before work starts: workspace, models/providers, tools/skills, permission profile per member role, execution placement, live and total session bounds and allowed actions. The envelope is stored by the persistent-session grant store as a delegation policy bound to the approving user's approval reference and to the Architect project. When the Architect plugin requests a Room grant that names that policy, the host SHALL validate the clamped proposal against the policy and record the grant without another user approval only when every subject's authority, the workspace and the session bounds are contained in the policy. A read-only subject stays read-only even if another role may edit. Each descendant grant remains individually validated, identity-bound and revocable, and the existing atomic session reservations and revocation rules continue to apply. Revoking the project's policy invalidates grants issued under it. Plugins and agents MUST NOT authorize descendants through their own text, record edits or unverified project identifiers; the host checks the policy it stored, never a project JSON. The exact bundled-package allowlist SHALL remain unchanged. The structured-subagent host path is not changed by this requirement. The envelope bounds permitted execution, not a team, solution category or workflow; Architect chooses actual workers and methods just in time within it.

#### Scenario: Same access in a new Room
- **WHEN** Architect creates a linked Room whose effective members, tools, models, workspace and session bounds fit its approved policy
- **THEN** the host validates and records the Room grant without repeating an access approval

#### Scenario: A Room asks for more authority
- **WHEN** a linked Room's proposal names a foreign workspace, an unapproved model, broader tool access, a wider permission profile or more sessions than the policy allows
- **THEN** the host refuses automatic grant creation and the work waits for explicit user approval of the changed envelope

#### Scenario: Approval is revoked
- **WHEN** the project's execution authority is revoked
- **THEN** no new linked Room grant, session or turn is permitted under it, including Rooms queued before revocation
- **AND** already started effects are represented honestly rather than described as undone

#### Scenario: Foreign plugin presents the same project id
- **WHEN** a package outside the bundled allowlist requests a Room grant naming a valid-looking project policy
- **THEN** the host refuses it without exposing or widening the project's authority

#### Scenario: Structured workers are unchanged
- **WHEN** a linked Workflow worker, planner, researcher or verifier starts through the structured-subagent API
- **THEN** it runs under that API's existing checks, with no new prompt and no new gate from this change
