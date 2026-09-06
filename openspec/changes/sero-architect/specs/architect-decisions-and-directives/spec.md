## Purpose

Decisions carry the questions only the user can answer, with a recommendation so answering is one action, and directives carry the user's instructions to the owner, so the relationship works in both directions without a chat log.

## ADDED Requirements

### Requirement: Decision record shape
A decision SHALL contain a question, at least two options each with an id, a label and a consequence, a recommended option id, the reason it was escalated, the milestones it parks, and when raised. The owner authors the content; the system MUST validate only the shape and MUST reject a decision that lacks a recommendation or a consequence for any option.

#### Scenario: Decision without a recommendation
- **WHEN** the owner raises a decision with no recommended option
- **THEN** the call is refused with the missing field named and no decision is recorded

### Requirement: Unanswered decisions park, never default
While a decision is open, the milestones it names MUST stay `parked`, no dispatch for them may start, and the project carries the `decision` overlay. There MUST be no timeout and no default answer. Milestones the decision does not name continue.

#### Scenario: Two days without an answer
- **WHEN** a decision stays open for any length of time
- **THEN** the parked milestones are unchanged and the owner has not proceeded on its recommendation

#### Scenario: Independent milestone continues
- **WHEN** a decision parks milestone 3 and milestone 2 has no dependency on it
- **THEN** milestone 2 continues to dispatch and verify

### Requirement: Forced escalations
Regardless of the charter's autonomy setting, the system MUST require a user decision before: a change to the approved charter, a delivery to an external destination, or spending beyond the approved cap. These checks are mechanical and MUST NOT depend on the owner choosing to escalate.

#### Scenario: Charter change attempted directly
- **WHEN** the owner calls the charter action on a project whose charter is already approved
- **THEN** the call records a decision proposing the change instead of applying it

### Requirement: Autonomy setting
The charter SHALL carry an autonomy setting of `milestones` (default), `charter-only`, or `model-judged`. Under `milestones` the user approves each milestone plan before dispatch. Under `charter-only` milestone plans dispatch without approval. Under `model-judged` the owner decides what to raise against the charter's escalation policy. The user MAY change the setting at any time from the project page, and the change applies to the next milestone.

#### Scenario: Default setting
- **WHEN** a charter is approved without an autonomy choice
- **THEN** the next milestone plan is presented for approval before any dispatch

### Requirement: Answering a decision
The user SHALL answer a decision by choosing one option, with the recommendation preselected, and MAY add a note. The answer MUST wake the owner at the highest priority, MUST clear the `decision` overlay when no other decision is open, and MUST unpark the named milestones.

#### Scenario: Answer with a note
- **WHEN** the user picks an option and adds a note
- **THEN** the owner's next contract carries the chosen option id and the note verbatim as task data

### Requirement: Directives and replies
The user SHALL be able to send a directive to the owner from the project page. A directive MUST wake the owner at the highest priority. The owner MUST reply with one message through the reply action before ending that wake, and the reply MUST be shown next to the directive. The page MUST show at most the latest directive and reply by default, with older ones behind a disclosure.

#### Scenario: Directive while a Workflow runs
- **WHEN** the user sends a directive while a dispatched Workflow is running
- **THEN** the Workflow continues, the owner replies, and the record shows the reply

### Requirement: Attention is visible without opening the project
The number of open decisions and approvals for each project SHALL be available in the index so the widget and the projects list can show it without reading the record.

#### Scenario: Widget count
- **WHEN** two decisions are open on one project
- **THEN** the widget row for that project shows a needs-you count of 2
