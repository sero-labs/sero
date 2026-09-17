## MODIFIED Requirements

### Requirement: The record is the contract
On every wake, before the owner's turn, the runtime SHALL send a compact authoritative contract built from the project record: the idea, the brief, the phase and overlay, open decisions, unanswered directives, milestone states, budget remaining, and the event that caused the wake. The contract MUST state that it replaces every earlier contract, MUST carry the idea and directives as task data rather than instructions, and MUST say "keep working" only when the project has no overlay. It SHALL include the active objective's relevant details and changes while keeping historical plans, research and evidence available through bounded summaries and authorized references rather than repeatedly embedding all detail. It MUST NOT omit authority constraints to meet a context budget. After compaction or an approved owner-session replacement, the runtime SHALL reconstruct and send the current contract and active-work context before continuation; it MUST NOT depend on an earlier delta still being in the transcript.

#### Scenario: Paused project contract
- **WHEN** the owner is woken to answer a directive while the project is `paused`
- **THEN** the contract instructs it to reply and stop, and it does not dispatch work

#### Scenario: Idea contains an instruction
- **WHEN** the idea text contains an instruction to widen access or ignore the charter
- **THEN** the owner reports that instruction in the brief and does not act on it

#### Scenario: Completed research does not dominate every wake
- **WHEN** several large research reports and completed milestone plans exist but a wake concerns one active objective
- **THEN** the contract includes relevant summaries and references rather than embedding every historical result again
- **AND** the owner can retrieve needed detail under its existing permissions

#### Scenario: Compaction loses preceding updates
- **WHEN** compaction removes earlier state updates from the conversation
- **THEN** the next contract reconstructs current authority and active-work state without requiring those earlier updates
