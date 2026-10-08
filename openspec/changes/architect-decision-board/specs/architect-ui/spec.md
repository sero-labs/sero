# Spec Delta

## ADDED Requirements

### Requirement: The project page is one board

The project page SHALL be one board that follows the approved prototype `apps/styleguide/public/prototypes/architect-one-screen.html`. A top tile SHALL always show the Architect's latest saved sentence, or the user's request when none is saved, with one state line that reads Working, Waiting for you, Stopped or Finished, and meters for plan progress and spend. The progress meter SHALL appear only when a plan exists. Working SHALL be shown only for work this session has observed.

Under the top tile the board SHALL show exactly one large tile, chosen in this order: a decision or approval the user must give; a stop that needs the user, with its saved cause and its recovery control; work that is running; a delivered result; otherwise a short statement that nothing is running. A Plan tile SHALL exist only when the project has plan steps, and a Decisions made tile only when at least one decision exists. The board MUST NOT show an empty or placeholder tile. A message box for the Architect SHALL remain available.

A checked plan step SHALL show its captured proof picture when one exists and a link to its checks. Full plans, research, evidence, model settings, the inspector and history SHALL open as separate views. Every action on the board SHALL use the same authoritative tool action as the equivalent menu or detail control.

#### Scenario: Just started
- **WHEN** a project has started and has no plan and no question
- **THEN** the board shows the top tile, the live work as the large tile, and the user's start cap under Decisions made
- **AND** it shows no Plan tile and no progress meter

#### Scenario: A question is open
- **WHEN** the Architect has raised a decision
- **THEN** the large tile is the question with its choices and the state line reads Waiting for you
- **AND** no live tile is shown while nothing runs

#### Scenario: Work is running
- **WHEN** observed work is running and nothing needs the user
- **THEN** the large tile is the live work and the state line reads Working

#### Scenario: The cap stopped the work
- **WHEN** the project reaches its spending cap
- **THEN** the large tile states the stop and holds the field that raises the cap and resumes
- **AND** the state line reads Stopped

#### Scenario: Delivered
- **WHEN** every plan step is closed and at least one was accepted on evidence
- **THEN** the large tile is the result, with the Architect's result sentence and the ways to open the preview and the checks
- **AND** the state line reads Finished

#### Scenario: Nothing to show is not a tile
- **WHEN** a project has no plan steps, or no decisions
- **THEN** that tile is absent and the remaining tiles use the space

#### Scenario: History is not on the page
- **WHEN** the board is open
- **THEN** history is reachable as a separate view and no history entries are on the board

### Requirement: Live work is on the board

While observed work runs, the board SHALL show it without a further click. For each agent that is working it SHALL show who it is, what it is doing in plain words with the tool's own short detail, and how long the current action has run. It SHALL show the arriving text of the Architect, or of the one agent the user selects when several work at once, and up to three of the most recent finished actions. It SHALL link to the complete saved session. Showing live work MUST NOT alter execution or grant authority, and live text MUST NOT be saved by the board.

#### Scenario: The Architect works itself
- **WHEN** the Architect is editing files in its own turn
- **THEN** the live tile names the action, shows its timer and shows the Architect's text as it arrives

#### Scenario: Several agents work
- **WHEN** a Room has two members working
- **THEN** the live tile lists both with their actions and timers, and shows the text of the selected one

#### Scenario: The page opens during a turn
- **WHEN** the user opens the board while a turn is under way
- **THEN** the recent actions of that turn are shown, not an empty list

### Requirement: Decisions made are visible and can be reopened

The board SHALL list the decisions that shape the work: each answered question with the chosen option, each assumption the Architect recorded, and the spending limit. Each row SHALL say whether the user or the Architect decided. Change on a row SHALL place a short message naming that decision in the message box and focus it. Change MUST NOT send a message or alter the project by itself.

#### Scenario: An assumption is shown
- **WHEN** the Architect records an assumption in its working plan
- **THEN** the board lists it as decided by the Architect

#### Scenario: Change opens a message
- **WHEN** the user presses Change on a decision
- **THEN** the message box holds a sentence that names the decision and has the focus
- **AND** nothing is sent until the user sends it

## REMOVED Requirements

### Requirement: Project page shows four parts

**Reason**: Replaced by "The project page is one board". The four compact areas left the page nearly empty and put the live work behind a second view.

**Migration**: None for saved projects. The board reads the same record.

### Requirement: Watch work is a separate live surface

**Reason**: Live work is now on the project board, under "Live work is on the board". A separate view made the user look for it.

**Migration**: The Work view keeps Plan, Research and Evidence. A link or saved tab that names the live view opens the project board.
