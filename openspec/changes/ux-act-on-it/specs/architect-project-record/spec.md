## ADDED Requirements

### Requirement: A block on delegated work records what it was and why

When the Architect blocks a project because delegated work ended without reporting, the record SHALL hold that block as named fields: what the work was called, what state it ended in, when it ended, and the cause if one is known. A block MUST NOT be stored only as a sentence that a reader has to parse to recover those facts. Where the runtime already holds the work's title at the moment it blocks, that title MUST be saved rather than discarded.

#### Scenario: A research Room is cancelled

- **WHEN** a research Room the Architect is waiting on reaches a cancelled state
- **THEN** the record holds the Room's title, that it was cancelled, the time, and the cause if one is known
- **AND** a reader can name the Room without reading the project's history

#### Scenario: An earlier cause is linked

- **WHEN** that Room had already raised a decision about the access its members needed
- **THEN** the saved cause refers to that decision, so the page can state the reason it recorded

#### Scenario: No cause is known

- **WHEN** delegated work ends in a state with no recorded cause
- **THEN** the record holds the work, its state and the time, and no cause
- **AND** no cause is inferred from a count of earlier attempts

### Requirement: A planning attempt is not a report of the work stopping

A count of attempts to plan delegated work SHALL NOT be presented, or stored in a field named, as a count of times the work itself stopped. Where both are worth keeping, they MUST be separate fields.

#### Scenario: Planning was retried

- **WHEN** planning a research Room was interrupted twice before the Room existed
- **THEN** that count describes planning attempts, and nothing claims the Room stopped twice
