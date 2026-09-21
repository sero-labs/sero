## MODIFIED Requirements

### Requirement: Project page shows four parts

A project page SHALL show, in order: a heading that is the project's state in plain words, followed by the same activity line as the list and, when something needs the user, the controls for that action; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. The header MAY carry more than one control when the state offers more than one thing to do, and MAY carry a field where the action needs a value rather than a confirmation. Those controls SHALL run the same actions as their copies elsewhere on the page or in the project menu. The Architect's own latest sentence SHALL be complete behind a "What Architect reported" disclosure, with the time it was written. History, evidence and older directives MUST be behind disclosures. The page MUST NOT contain an event log and MUST NOT stream agent output. When a stopped step is what the project needs from the user, Retry step SHALL also be offered in the header with the same effect as the control on the milestone.

#### Scenario: Quiet build

- **WHEN** a project is building with no open decision
- **THEN** the header shows no control, and no section grows to fill the space

#### Scenario: Stopped step

- **WHEN** a milestone's run stopped before it finished
- **THEN** the heading says the milestone stopped before it finished and the header offers Retry step
- **AND** retrying from the header and from the milestone rail start the same retry

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

## ADDED Requirements

### Requirement: A blocked research Room is named and explained

When a project is blocked because a research Room ended without reporting, the project page SHALL name that Room by its title, say what happened to it and when, and give the reason the record holds. It MUST NOT identify the Room by its id, and MUST NOT require the user to read the project's history to find the reason. When the record holds no reason, the page SHALL say what happened without inventing one.

#### Scenario: A cancelled Room

- **WHEN** a project's research Room was cancelled nine days ago after its members could not run commands
- **THEN** the page names the Room by its title, says it was cancelled and when, and states that reason
- **AND** the Room's id is not used as the heading

#### Scenario: No reason was saved

- **WHEN** a research Room was cancelled and no cause was recorded
- **THEN** the page says the Room was cancelled and when, and shows no reason line

### Requirement: Each kind of nothing is said once, where it belongs

A section with nothing in it SHALL say so in one quiet line in the place the content would appear, without a heading, a count label and a card repeating it. A section that needs nothing from the user SHALL be absent while it is empty and SHALL return with its controls as soon as it holds something. The page SHALL distinguish nothing to show, not made yet, not available from here, and stopped. Only a fault SHALL use colour.

#### Scenario: Nothing needs the user

- **WHEN** a project has no open decision or approval
- **THEN** the Needs You section is absent, and no heading, label or card announces that nothing is needed

#### Scenario: The section returns

- **WHEN** that project raises a decision
- **THEN** the Needs You section appears with the decision and its answer control

#### Scenario: Not made yet

- **WHEN** a project has no milestones because it has no charter
- **THEN** one line in the milestones section header says so and names what produces them, in place of an empty card

#### Scenario: A fault is the only colour

- **WHEN** one section is empty and another reports a stopped research Room
- **THEN** only the stopped Room's line uses colour
