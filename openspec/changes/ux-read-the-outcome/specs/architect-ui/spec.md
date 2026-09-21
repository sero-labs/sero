## MODIFIED Requirements

### Requirement: Project page shows four parts

A project page SHALL show, in order: a heading that is the project's state in plain words, followed by the same activity line as the list and, when something needs the user, the controls for that action; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. The header MAY carry more than one control when the state offers more than one thing to do, and MAY carry a field where the action needs a value rather than a confirmation. Those controls SHALL run the same actions as their copies elsewhere on the page or in the project menu. The Architect's own latest sentence SHALL be complete behind a "What Architect reported" disclosure, with the time it was written. History, evidence and older directives MUST be behind disclosures. The page MUST NOT contain an event log and MUST NOT stream agent output. When a stopped step is what the project needs from the user, the header SHALL offer the whole recovery control the milestone rail used to carry — including the field a raised cap needs — and the milestone rail MUST NOT repeat it.

#### Scenario: Quiet build

- **WHEN** a project is building with no open decision
- **THEN** the header shows no control, and no section grows to fill the space

#### Scenario: Stopped step

- **WHEN** a milestone's run stopped before it finished
- **THEN** the heading names the milestone that stopped and the header offers the recovery control beside the reason
- **AND** the milestone rail does not repeat that control

#### Scenario: The cap is what stopped the work

- **WHEN** a project has reached its spend cap
- **THEN** the heading says the cap stopped the work, and the header carries the new-cap field and the control that raises the cap and resumes
- **AND** raising the cap from the header and from the project menu have the same effect

#### Scenario: Two things to do

- **WHEN** a project is stopped because its research Room was cancelled
- **THEN** the header offers both opening that Room and telling the Architect what to do next
- **AND** telling the Architect what to do next puts the cursor in the existing directive composer rather than opening another way to send one

#### Scenario: The Architect's own words are kept

- **WHEN** the Architect has reported a paragraph about a blocked milestone
- **THEN** the paragraph is complete under "What Architect reported" with its time, and no part of it is used as the heading or cut short

### Requirement: Milestone rail links to detail

Each milestone in the rail SHALL show its title and status and, when dispatched, one link that opens the Orchestrator record of its Workflow or Room. The rail MUST NOT reproduce step or member detail. The rail MUST NOT offer a control the project header already offers for the same recovery.

#### Scenario: Open detail

- **WHEN** the user selects the link on a running milestone
- **THEN** the Orchestrator app opens on that Workflow or Room

#### Scenario: The header already offers the recovery

- **WHEN** a milestone's run stopped and the header offers the recovery control
- **THEN** the milestone row keeps its title, its status and its link, and offers no second copy of that control

## ADDED Requirements

### Requirement: A stopped milestone states what stopped and why, once

The project header SHALL state what stopped and why the work stopped, from the
record's own saved reason, once on the page, with the control that recovers it
beside it. The reason SHALL be shown as the header's activity line beside its state
glyph, not as a second sentence below the activity line. Where the record retains
no cause, the header SHALL say the work stopped without a recorded cause and MUST
NOT invent one. The history the page keeps SHALL keep its own recorded entries.

#### Scenario: A Workflow a restart interrupted

- **WHEN** a dispatched Workflow was interrupted by a restart
- **THEN** the header states that Sero restarted and which step the run was on, once

#### Scenario: A Workflow stopped at a limit

- **WHEN** a dispatched Workflow stopped at its cost or time limit
- **THEN** the header states the limit's own reason

#### Scenario: No recorded cause

- **WHEN** a stopped run retains no cause
- **THEN** the header says the work stopped without a recorded cause

#### Scenario: The reason is one line

- **WHEN** the header states a stopped milestone's reason
- **THEN** the reason appears once, as the activity line, and no separate sentence repeats the milestone's title or its state

### Requirement: Milestone evidence reads as a list of checks

A milestone's evidence SHALL show one row per check, each with its outcome, its name
and its duration where the record holds one, and each check's own output SHALL open
from its own row. Evidence MUST NOT print every command's output at once, and the
recorded output MUST NOT be truncated. The checks a milestone recorded for changed
files, a preview response and a capture SHALL appear as rows with the commands'
checks. Each row SHALL open independently.

#### Scenario: A passed milestone

- **WHEN** the evidence opens
- **THEN** every check is a row, and no command's output is shown until its row is opened

#### Scenario: One command's output

- **WHEN** the user opens one check's row
- **THEN** that command's own complete output is shown, and opening a second row does not close the first

#### Scenario: A check with no duration

- **WHEN** a check records no duration, such as a list of changed files or a capture
- **THEN** its row shows its name and its outcome without a fabricated duration

#### Scenario: Files and preview

- **WHEN** the evidence records changed files and a preview check
- **THEN** those appear as rows beside the commands' checks, and the capture row opens the preview
