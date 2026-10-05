## MODIFIED Requirements

### Requirement: A step shows its title, its state and its result

Each step in the Workflow plan's detail view SHALL show its title, its state in words and its result. The step's instruction and its expected result SHALL be behind a disclosure on the step. The model, the agent and the tools SHALL open from one control on the step, and SHALL be shown on the step itself only where the user has changed them from the default. An agent instruction MUST NOT be used as a step's heading. A running step SHALL offer its live view as `live-agent-watch` sets out. A failed step SHALL carry Retry in its header beside its state, and SHALL state its error as one line under its title with no label column.

#### Scenario: A finished step

- **WHEN** a step has finished
- **THEN** the step shows its title, that it is done and its result, with the instruction and expected result behind the disclosure

#### Scenario: A tuned step

- **WHEN** the user has changed one step's model and left its agent and tools at the default
- **THEN** that step shows the changed model, and its agent and tools stay behind the control

#### Scenario: A failed step

- **WHEN** a step timed out while `pnpm build` was running
- **THEN** its header shows Failed and Retry, and one line under the title says it timed out while `pnpm build` was running

### Requirement: A planner wait shows a spinner and the real elapsed time

While a planner has not answered, a screen SHALL show a spinner and the time since
the request was made, with the eye control beside the time. The eye control SHALL
open the planner's live block under the time, as `live-agent-watch` sets out. The
screen MUST NOT show a step list, a progress bar, a percentage complete, or a
countdown. This applies to designing a Room, rethinking a Room, generating a
Workflow's plan, installing a Workflow from the Catalog and planning again after the
user answers the planner's questions.

#### Scenario: Designing a Room

- **WHEN** the Room planner has not answered
- **THEN** the screen shows a spinner and the elapsed time, and no step list, progress bar or countdown

#### Scenario: Generating a Workflow plan

- **WHEN** the Workflow planner has not answered
- **THEN** the screen shows a spinner and the elapsed time, and no placeholder step boxes

#### Scenario: Watching the planner

- **WHEN** the user opens the eye control on a planner wait
- **THEN** the screen shows the file the planner reads or `writing its answer`, and its reply as it is written

#### Scenario: Installing from the Catalog

- **WHEN** the user installs a Workflow from the Catalog
- **THEN** the planner wait is shown until the planner answers, not only a disabled Install button

### Requirement: The create and Catalog frames follow the approved drawing

The Room brief, the planner wait, the Room proposal and the Catalog SHALL match the
approved drawing at
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/5-start-something.html`.
The planner wait's eye control and live block SHALL match
`apps/styleguide/public/prototypes/live-agent-progress.html`.
They MUST NOT show an element the drawings do not have, and they SHALL use the
drawn glyph shapes rather than generic icons. Type sizes, spacing and radii SHALL
come from the theme's scale so that a theme change carries through, and MUST NOT be
fixed pixel values.

#### Scenario: A frame is set beside the drawing

- **WHEN** a captured frame is compared with the drawing's frame
- **THEN** it shows the same elements and the same drawn glyph shapes, and its sizes follow the theme scale
