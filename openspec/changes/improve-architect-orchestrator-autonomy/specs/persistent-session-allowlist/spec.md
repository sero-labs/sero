# Spec Delta

## ADDED Requirements

### Requirement: Grant amendments use stored approval

The host SHALL validate amendments to an active persistent-session grant against its stored approval or linked project policy, current catalogues, per-role permissions, workspace placement and session bounds. Contained amendments SHALL require no repeated approval. New authority SHALL require explicit user approval before taking effect. Plugin records, Room envelopes and agent text MUST NOT authorize an amendment.

#### Scenario: An approved specialist joins
- **WHEN** a running Architect-linked Room requests another member wholly within its host-stored project policy and remaining session bounds
- **THEN** the host can amend that Room's existing grant without asking again

#### Scenario: A role remains read-only
- **WHEN** an amendment requests write access for a read-only role although another role may write
- **THEN** automatic amendment is refused and the current grant stays unchanged

#### Scenario: Standalone Room gains authority
- **WHEN** a standalone Room requests capabilities outside its stored approval
- **THEN** the change waits for explicit approval of the clamped expansion and is not applied from its local envelope alone

### Requirement: Amendments preserve identity and history

An amendment SHALL retain the grant identity and directory, existing subject/session bindings, transcripts, accounting and workspace ownership. Configuration changes SHALL preserve the affected member's identity and history. Replacement SHALL retire the old member with its history intact and bind a distinct new subject with a recorded handover. It MUST NOT reuse the retired member's identity or discard its work.

#### Scenario: Member needs another approved tool
- **WHEN** an existing member adds a tool already covered by project approval
- **THEN** it keeps its session path, previous work and history while acquiring the approved configuration

#### Scenario: A specialist is replaced
- **WHEN** an authorized replacement applies
- **THEN** the old member and session remain inspectable and the new member starts under its own identity with the handover

### Requirement: Amendments apply at safe boundaries

The host SHALL apply configuration and roster amendments at safe execution boundaries. Success SHALL mean the effective session configuration matches the approved amendment. Busy or failed amendments SHALL remain visibly pending or refused; they MUST NOT silently omit capabilities or restart with a different identity. Removed capabilities SHALL be unusable before subsequent work begins.

#### Scenario: A member is mid-turn
- **WHEN** a tool, skill, model or thinking-level amendment targets a working member
- **THEN** it waits for a safe boundary or returns a clear retryable hold
- **AND** the Room cannot report the amendment as effective while that member still has its old configuration

### Requirement: Amendment recovery and reservations are atomic

Amendments SHALL retain durable identity and revision, reject stale concurrent changes and preserve atomic live and total session reservations. Restart SHALL reconcile any host/Room split transaction before admitting new work. Policy or grant revocation SHALL invalidate pending amendments. Replacing or retiring a member MUST NOT reset lifetime session consumption or reuse a reservation.

#### Scenario: Two additions compete for one slot
- **WHEN** two amendments concurrently request the last authorized session
- **THEN** at most one can reserve it and the other leaves the effective grant and Room unchanged

#### Scenario: Restart between host commit and Room update
- **WHEN** an amendment is host-committed before a crash interrupts the Room update
- **THEN** recovery completes or holds that same amendment before any affected member starts
- **AND** it cannot issue another grant or consume another session for the same amendment

#### Scenario: Revocation races an amendment
- **WHEN** project authority is revoked before an amendment or its session starts
- **THEN** the host refuses the new work even if the Room saved a pending change
