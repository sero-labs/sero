## ADDED Requirements

### Requirement: A history entry records what it is about

A project's history entry SHALL record what the entry is about, when the entry
concerns a milestone, a Workflow, a Room or a decision. The record SHALL hold the
subject's kind, the subject's id, and the name the writer held for the subject. The
entry SHALL keep any long note, question or reason it carries apart from the short
cause it shows as its headline, so a reader shows the headline and folds the note.
An entry that records no subject SHALL remain readable, and its cause SHALL be
shown as it was written.

#### Scenario: A dispatched milestone

- **WHEN** a milestone is dispatched to a Workflow or a Room
- **THEN** the entry records the milestone's name, the kind of work it went to, and that work's id

#### Scenario: An accepted milestone

- **WHEN** a milestone is accepted on passed evidence
- **THEN** the entry names the milestone and what it was accepted on

#### Scenario: A decision

- **WHEN** a decision is raised or answered
- **THEN** the entry records the decision's id and the name the writer held for it

#### Scenario: An entry with a long note

- **WHEN** the user resumes a project with a note, or the Architect records a long reason
- **THEN** the entry carries the note apart from its headline, so a reader shows the headline and folds the note

#### Scenario: An entry written earlier

- **WHEN** an entry written before this requirement is read
- **THEN** it loads with no subject and no note, and its cause is shown as it was written
