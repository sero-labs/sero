## MODIFIED Requirements

### Requirement: A Room's member list names each member in full

A Room's member list SHALL show each member's full name and its state, in the column
width the drawing gives it. A member's name MUST NOT be truncated. The proposed
team's member table on the Room proposal SHALL follow the same rule: each proposed
member's full name is shown in the drawing's column width, and a name MUST NOT be
truncated.

#### Scenario: Two long member names

- **WHEN** a Room's members have long names and titles
- **THEN** the list shows each in full

#### Scenario: A proposed member with a long name

- **WHEN** the Room proposal shows a proposed member whose name and role overflow the drawing's column
- **THEN** the full name is shown and is not cut with an ellipsis

## ADDED Requirements

### Requirement: A screen that starts work does not claim nothing has been spent

A screen that starts a Room or a Workflow SHALL NOT state that nothing has been
spent, or that nothing will be spent, while the work it starts spends money. The
Room brief SHALL carry the sentence "The team starts only when you press Start
room." and no longer than that about spend or creation.

#### Scenario: The New Room screen

- **WHEN** the New Room screen opens
- **THEN** the line under the brief reads "The team starts only when you press Start room." and no text on the screen says nothing has been spent

### Requirement: A planner wait shows a spinner and the real elapsed time

While a planner has not answered, a screen SHALL show a spinner and the time since
the request was made. It MUST NOT show a step list, a progress bar, a percentage
complete, or a countdown. This applies to designing a Room, rethinking a Room, and
generating a Workflow's plan.

#### Scenario: Designing a Room

- **WHEN** the Room planner has not answered
- **THEN** the screen shows a spinner and the elapsed time, and no step list, progress bar or countdown

#### Scenario: Generating a Workflow plan

- **WHEN** the Workflow planner has not answered
- **THEN** the screen shows a spinner and the elapsed time, and no placeholder step boxes

### Requirement: A Room's proposal shows what designing it cost

Where a Room's record holds planning usage, the Room proposal SHALL show that cost
beside Start room, both on the plain proposal and on the recomputed proposal. Where
the record holds no planning usage, the proposal MUST NOT show a cost line.

#### Scenario: A Room with recorded planning usage

- **WHEN** the proposal opens for a Room whose record holds a planning cost
- **THEN** the cost is shown beside Start room

#### Scenario: A recomputed proposal

- **WHEN** an adjustment is applied and the recomputed proposal is shown
- **THEN** the planning cost is still shown beside Start room

#### Scenario: A Room with no recorded planning usage

- **WHEN** the proposal opens for a Room whose record holds no planning cost
- **THEN** no cost line is shown

### Requirement: A Workflow's Review step shows what planning cost

Where a Workflow's record holds planning usage, its Review step SHALL show
`Planning this cost <amount>` beside the controls that save or activate it. Where
the record holds no planning usage, the Review step MUST NOT show the line.

#### Scenario: Reviewing a new Workflow

- **WHEN** the Review step opens for a Workflow whose record holds a planning cost
- **THEN** the line reads `Planning this cost $0.012` and sits beside Save as draft and Activate workflow

### Requirement: The proposed team is drawn as the approved drawing draws it

The Room proposal's team table SHALL show each member's full name, the Room's own
avatar for that member, and the lead mark only. Each approval figure SHALL be its
label and value; a subtitle under a figure MUST NOT be shown. Read-only access
SHALL read as one access value and MUST NOT be split into a value and a mode line.

#### Scenario: A proposed team

- **WHEN** the proposal opens
- **THEN** each member's full name and avatar are shown, no subtitle appears under any approval figure, and read-only access reads "Read this workspace"

### Requirement: The Catalog's repository controls sit on one row

The Catalog's repository bar SHALL show the official repo, any added repos, Add
repo, and Refresh on one row. A repo that the user added SHALL show its source in
place of the verified mark.

#### Scenario: The Catalog opens

- **WHEN** the Catalog tab opens
- **THEN** the repository controls are on one row and are not stacked

### Requirement: The Catalog names the model tier

A Catalog entry's model-tier chip SHALL name the tier it is: `low-tier model`,
`mid-tier model` or `high-tier model`, derived from the entry's model tier. The
chip MUST NOT show the tier's raw code.

#### Scenario: A low-tier entry

- **WHEN** an entry's model tier is LOW
- **THEN** its chip reads "low-tier model"

### Requirement: A Catalog entry's Details lists the steps it runs

An entry's Details SHALL list the numbered titles of the steps in the entry's plan.
Details SHALL stay folded until the user opens it, and when open it SHALL also keep
the entry's limitations, its required tools and its example output.

#### Scenario: Opening an entry's Details

- **WHEN** the user opens Details on an entry whose plan has steps
- **THEN** the step titles are listed in order with numbers, and the limitations, required tools and example output remain

### Requirement: The create and Catalog frames follow the approved drawing

The Room brief, the planner wait, the Room proposal and the Catalog SHALL match the
approved drawing at
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/5-start-something.html`.
They MUST NOT show an element the drawing does not have, and they SHALL use the
drawn glyph shapes rather than generic icons. Type sizes, spacing and radii SHALL
come from the theme's scale so that a theme change carries through, and MUST NOT be
fixed pixel values.

#### Scenario: A frame is set beside the drawing

- **WHEN** a captured frame is compared with the drawing's frame
- **THEN** it shows the same elements and the same drawn glyph shapes, and its sizes follow the theme scale
