## MODIFIED Requirements

### Requirement: Honour cancellation before starting a write

An `edit` or `write` call cancelled while waiting for serialization or before
its write starts MUST fail without writing. Cancellation during a write MUST
NOT permit the next mutation to enter until that write settles. Cancellation
does not guarantee rollback of an already-started write. These rules SHALL
apply on both backends, including calls inside `codemode`.

#### Scenario: Cancel while queued

- **WHEN** a mutation is cancelled while another mutation holds the same file
- **THEN** the cancelled call performs no write when it reaches its turn, and later uncancelled calls can proceed

#### Scenario: Cancel during edit preparation

- **WHEN** cancellation arrives during the edit's file read or validation, before writing starts
- **THEN** the edit fails without writing

#### Scenario: Cancel during an in-flight write

- **WHEN** cancellation arrives after a write starts and another mutation is waiting for the same file
- **THEN** the next mutation remains blocked until the write settles, and the cancelled call does not claim that the file was left unchanged

### Requirement: Guide the model to batch mutation work

Tool guidance SHALL state that one `edit` call carries several disjoint
replacements, and that a program can apply several mutations in one turn. The
guidance SHALL stay consistent with the serialization guarantee.

#### Scenario: Batching guidance is present

- **WHEN** the model reads the `edit` tool description
- **THEN** it states that several replacements belong in one call, and that a `codemode` script can apply several mutations in one turn

#### Scenario: Guidance does not contradict the concurrency guarantee

- **WHEN** guidance recommends issuing several mutations in one program
- **THEN** it states that edits validate current content in sequence and does not promise that conflicting edits or edits followed by whole-file writes all survive
