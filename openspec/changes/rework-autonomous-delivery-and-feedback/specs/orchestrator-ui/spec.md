## MODIFIED Requirements

### Requirement: One definition of active

Orchestrator Home, Workflow/Room lists and detail views SHALL derive activity from the same shared vocabulary and observed contact rule. A Workflow or Room SHALL count as active only when its current run is confirmed attached. Saved status labels MUST NOT alone establish activity. Current work, request/tool wait, last meaningful activity and contact freshness SHALL remain consistent across overview and detail, including for directly created work.

#### Scenario: Home and the tab agree
- **WHEN** a Workflow is armed with no live run
- **THEN** Home does not count it active and its row reads Waiting for a trigger

#### Scenario: A live run
- **WHEN** one Workflow run is confirmed live
- **THEN** Home counts it active and the Workflow row reads Working from those same facts

#### Scenario: Room contact expires
- **WHEN** a saved running Room loses confirmed current-session contact
- **THEN** Home, the Room list and its page read Last known without claiming it failed

### Requirement: Home opens on status and the work that needs you

Orchestrator Home SHALL open on a workspace status line, a compact account of current Workflow and Room work and the work needing the user. Current-work summaries SHALL name the work or wait, freshness and available spend, and open its detail/Watch without showing raw logs. Create Workflow, Room and Goal SHALL remain three header actions with their explanation behind one What are these disclosure. Counts already on tabs MUST NOT be repeated on Home; empty tabs SHALL show no count.

#### Scenario: Nothing running
- **WHEN** nothing is running and one Workflow is armed
- **THEN** the status states that nothing is running, names that armed Workflow and shows available workspace spend

#### Scenario: Work is live
- **WHEN** a Room member and Workflow step are in flight
- **THEN** Home shows their short actual work/wait summaries with a path to detail without waiting for either run to complete

#### Scenario: Creating from Home
- **WHEN** the user wants to create a Room
- **THEN** the Room header action and one shared explanation are available

### Requirement: The Workflows list is full width and rows open a page

The Workflows tab SHALL show a full-width list without a sibling detail pane. Each row SHALL show the full Workflow title, shared activity state, current step/work or wait, last meaningful activity and observation freshness, last run and available spend. Agent instructions MUST NOT become row summaries. Selecting a row SHALL open its own page and returning SHALL preserve search and scroll. Live facts MUST update without requiring an open Workflow page.

#### Scenario: Long title
- **WHEN** a Workflow has a long title
- **THEN** its row keeps the full title and a bounded current-work summary rather than replacing it with instructions

#### Scenario: Opening and returning
- **WHEN** the user opens a Workflow and returns
- **THEN** search and scroll are restored and current activity still reflects the latest scoped observation

#### Scenario: Nothing selected
- **WHEN** the user opens the Workflows tab
- **THEN** the list fills the width without a select-something placeholder

#### Scenario: List-only observation
- **WHEN** an attached step starts a tool while only the list is open
- **THEN** the row updates its current activity without a final run save or transcript subscription

### Requirement: A Room row says what it waits for

A Room row SHALL show its name, shared activity state, actual current work or wait, observation freshness, available spend and active-time facts, and member avatars/count. A user hold SHALL name the requested action and measured wait where available. The complete brief SHALL stay inside detail, not become the row summary. Parallel members SHALL be summarized without hiding their concurrent activity.

#### Scenario: A Room waiting on the user
- **WHEN** a Room is held for a user question
- **THEN** the row names the question and known wait rather than printing its brief

#### Scenario: Two Rooms with the same name
- **WHEN** two Rooms share a name
- **THEN** both retain their title and their dates/results distinguish them without mixing live observations

#### Scenario: Parallel members
- **WHEN** three Room members are active
- **THEN** the row identifies concurrent work and the detail reveals all three rather than describing only the last reporting member as the whole Room

### Requirement: A step shows its title, its state and its result

Each Workflow step in detail SHALL show its title, shared activity state and available result. During execution it SHALL also show a short actual request/tool/wait summary, observation freshness and access to its authorized live view, including separate fan-out items and children. Instruction and expected result SHALL stay in detail disclosures. Model, agent and tools SHALL open from one control and appear on the step only when overridden. Instructions MUST NOT become headings and stale previous-turn replies MUST NOT be presented as current output. A failed step SHALL carry Retry in its header beside its state, and SHALL state its error as one line under its title with no label column.

#### Scenario: A finished step
- **WHEN** a step finishes
- **THEN** it shows its title, actual completion and result while instruction detail stays secondary

#### Scenario: A tuned step
- **WHEN** only the step's model was changed
- **THEN** only that override appears outside its configuration control

#### Scenario: Quiet fan-out
- **WHEN** two items are waiting on model requests
- **THEN** each shows its own observed wait and available live view before the parent step completes

#### Scenario: A failed step
- **WHEN** a step timed out while `pnpm build` was running
- **THEN** its header shows Failed and Retry, and one line under the title says it timed out while `pnpm build` was running

### Requirement: A Room states its hold once, with its actions once

A Room hold SHALL state the actual cause or required user choice once, with short primary actions and separate supporting member detail. The same actions MUST NOT repeat in the header. A running Room with no question SHALL retain its stop control in the header. Header facts SHALL include name, shared state, spend and active time. An exhausted-time hold SHALL open a separate recovery dialog with measured usage, proposed new total, the unchanged spend cap and one approve/resume action; it MUST NOT expose an inline time-extension form. A completed Room SHALL not offer resume.

#### Scenario: A Room on hold
- **WHEN** two members are blocked by the same question
- **THEN** one short hold states that question and offers its actions once, with member evidence accessible separately

#### Scenario: A running Room with no question
- **WHEN** the Room is running with no user question
- **THEN** stop remains in its header and no duplicate hold control appears

#### Scenario: The state is a sentence, not a count
- **WHEN** two members need the same answer
- **THEN** the hold states that question rather than a count of members needing the user

#### Scenario: Time limit expired
- **WHEN** active usage reached the Room's total time limit
- **THEN** one recovery action opens the separate dialog and only a larger sufficient total can be approved
- **AND** resumption targets the same Room and does not change its spend cap

## ADDED Requirements

### Requirement: Workflow and Room pages expose a short live summary

A Workflow page and a Room page SHALL show the same observed current-work facts as their list rows, together with scope-appropriate Watch access. Plans, historical activity, instructions and full member output SHALL be secondary separate detail, not required reading to identify the current action or necessary decision. Feedback SHALL include planning/preparation before a run/member turn starts and recovery after a recoverable failure. Directly created Workflows and Rooms SHALL retain their own grants and controls.

#### Scenario: Planner is still running
- **WHEN** a directly created Workflow is being planned and no execution step exists
- **THEN** its page identifies observed planner activity or wait and permits authorized inspection without claiming an execution run already exists

#### Scenario: Inspect Room work
- **WHEN** the user opens Room Watch during a member turn
- **THEN** current available member/child output and tool states appear before completion without waiting for a final Room-record update
