## MODIFIED Requirements

### Requirement: Project page shows four parts

A project page SHALL show, in order: a heading that is the project's state in plain words, followed by the same activity line as the list and, when something needs the user, the controls for that action; a Needs You section listing open decisions and approvals; a milestone rail; and a directive composer with the latest reply. The header MAY carry more than one control when the state offers more than one thing to do, and MAY carry a field where the action needs a value rather than a confirmation. Those controls SHALL run the same actions as their copies elsewhere on the page or in the project menu. The Architect's own latest sentence SHALL be complete behind a "What Architect reported" disclosure, with the time it was written. Evidence and older directives MUST be behind disclosures. History SHALL be its own view opened from the project controls menu, and the project page MUST NOT hold it. The page MUST NOT contain an event log and MUST NOT stream agent output, except the live view of a running research agent that the user opens from its research card. When a stopped step is what the project needs from the user, the header SHALL offer the whole recovery control the milestone rail used to carry — including the field a raised cap needs — and the milestone rail MUST NOT repeat it.

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

#### Scenario: History is not on the page

- **WHEN** a project page is open
- **THEN** no History entry is shown on it, and History is reachable from the project controls menu

#### Scenario: No stream until asked

- **WHEN** a research agent is running and the user has not opened its live view
- **THEN** the page streams no agent output

## ADDED Requirements

### Requirement: Research run by one agent is shown while it runs

Research that the Architect runs directly as one agent, rather than through a Room or a Workflow, SHALL appear in Research and reviews while it runs. Its card SHALL show the question, the stopping condition, `Researching` with the elapsed time, and the eye control that opens its live block as `live-agent-watch` sets out. The activity line SHALL read `Researching a project question` while it runs. When it ends, its card SHALL keep its findings under "Findings used for the plan", as research through a Room or a Workflow does.

#### Scenario: Direct research running

- **WHEN** the Architect has run a research question as one agent for four minutes
- **THEN** Research and reviews shows its question, stopping condition and `Researching 4:00`, and the activity line reads `Researching a project question`

#### Scenario: Direct research finished

- **WHEN** that research returns its findings
- **THEN** its card shows the findings under "Findings used for the plan"
