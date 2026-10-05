# live-agent-watch Specification

## Purpose

Show a running agent's live progress on the Workflow step, Room member, chat tool call or screen that started it, and send live data only while a person can see it.

## Requirements

### Requirement: One live block shows what an agent does now

A live view of a running agent SHALL show one line naming what it does now, then the last lines of text it wrote. The line SHALL name the running tool and its main argument with the time that tool has run. When no tool runs and the producer reports an in-flight model request, the line SHALL name that observed request wait with its measured duration where available; it MUST NOT claim the agent is writing. Where the producer already streams reasoning text as live output, as structured-subagent runs do, the block MAY keep showing that text identified as reasoning; metadata summaries never carry it. The text SHALL keep its newest line in view. Where one place shows several agents, each block SHALL start its line with the agent's name. A live block MUST NOT carry a model tag, a figures footer, a tool-call count or a tool-call list. The layout SHALL match `apps/styleguide/public/prototypes/live-agent-progress.html`.

#### Scenario: An agent running a tool

- **WHEN** an agent is editing `src/components/LibraryFilters.tsx` and has written two sentences
- **THEN** its block shows `edit src/components/LibraryFilters.tsx` with that tool's elapsed time, and the two sentences under it

#### Scenario: A quiet request

- **WHEN** an agent has an in-flight model request, no tool runs and no text has arrived
- **THEN** its block names the request wait and shows no text, rather than saying it is writing its answer

#### Scenario: Two agents in one place

- **WHEN** one `subagent` call runs `scout` and `researcher` together
- **THEN** each has its own block, and each block's line starts with that agent's name

### Requirement: Live data flows only while it is visible

A view SHALL open a live watch for a run or a member session when its live block becomes visible, and SHALL close it when the block is hidden or the view closes. The host SHALL send live text and detailed tool activity only for runs and sessions that have an open watch. The producer SHALL keep a bounded latest partial for its active turn independently of watches, in the existing live registries, and SHALL clear it at terminal handoff. Closing the last watch SHALL release that watch's subscriptions, timers and pending delivery buffers and MUST NOT erase the producer's partial. Opening a watch SHALL show the current partial and where the agent is now; the host MUST NOT replay text sent while no watch was open. Scoped metadata, including start, end, request and tool state, SHALL continue to reach observing surfaces without an open watch. A watch on a Room member's session SHALL be refused unless the member belongs to the Room whose view asks for it.

#### Scenario: A hidden block

- **WHEN** a person closes a step's live block while its agent keeps writing
- **THEN** the host sends no live text or detailed tool activity for that run until a block for it opens again, and the run's row still updates its current action

#### Scenario: Reopening

- **WHEN** the block opens again after its agent wrote more text
- **THEN** the block shows the agent's current line and the bounded latest text, including text produced while the block was closed, not a replay of each missed event

#### Scenario: Nobody watches

- **WHEN** a subagent runs and no view shows its live block
- **THEN** its start, end and scoped metadata reach the windows and no live text does

### Requirement: Parallel runs each keep their updates

The host SHALL limit the rate of live updates for each run separately. An update from one run MUST NOT replace or delay an update from another run.

#### Scenario: Two agents write at once

- **WHEN** two watched agents write text continuously
- **THEN** both blocks update, and neither stops updating while the other writes

### Requirement: A running Workflow step opens its live view on request

A running step whose work is done by a background agent or a model call SHALL offer an eye control in its header. The live block SHALL be closed until the person opens it. While the step's result, a recovery choice or the stop condition is being checked, the step SHALL stay running and its live block SHALL show that check. A fan-out step SHALL show one block per running item, named by the item. A step that runs in the chat session SHALL NOT offer the control, because the chat shows that work. A step that is not running SHALL NOT offer it.

#### Scenario: Opening a running step

- **WHEN** a person selects the eye control on a running step
- **THEN** the step shows its live block under the header, and selecting the control again closes it

#### Scenario: The result is being checked

- **WHEN** a step's agent has finished and the Workflow is checking its result
- **THEN** the step still reads Running, and its live block shows `checking the result` and the reply as it is written

#### Scenario: An active-session step

- **WHEN** a step runs in the chat session
- **THEN** the step shows no eye control

### Requirement: One-answer calls can be watched where they are waited on

Every Orchestrator call that returns one answer SHALL offer the eye control where its wait is shown: Reflect and Skill in the Workflow top bar, where the running button SHALL read `Reflecting…` or `Preparing skill…` and the control SHALL open the block in a pop-up that Escape closes; Refine plan, beside its rewriting line; the checks between steps, on the step card; and the check of a newly arrived event, on the Workflow's state line, which SHALL name the event. The planner wait is set out in `orchestrator-ui`. The block's text SHALL be the call's raw reply as the model writes it, in a fixed-width face.

#### Scenario: Reflecting

- **WHEN** a person selects Reflect on a Workflow
- **THEN** the button reads `Reflecting…` with a spinner, and the eye control beside it opens the reply as it is written

#### Scenario: A new event is checked

- **WHEN** pull request #612 opens and the Workflow checks the event's condition
- **THEN** the state line reads `checking a new event: pull request #612 opened` with the eye control

### Requirement: Room Watch streams its members

While a Room's Watch view is visible, each live member's tile SHALL stream the text of its current turn and name its running tool. A member running a `subagent` call SHALL list each child agent in its tile with what the child does now and its elapsed time. A waiting or finished member's tile SHALL show the end of its last reply, dimmed, under its Waiting or Finished label, with no live caret. The tile MUST NOT show a fixed sentence in place of that reply. The member's own session view SHALL show `subagent` calls as it does today.

#### Scenario: A member writing

- **WHEN** a member is mid-turn and writing
- **THEN** its tile shows the text as it arrives, without waiting for the Room record to change

#### Scenario: A member with subagents

- **WHEN** a member runs `scout` and `researcher` through one `subagent` call
- **THEN** its tile lists `scout` and `researcher`, each with its current tool and elapsed time

#### Scenario: A finished member

- **WHEN** a member has finished
- **THEN** its tile shows the end of its last reply, dimmed, under Finished, and not `Its session is closed but kept`

### Requirement: A chat subagent call shows its agents while it runs

While a chat `subagent` tool call runs, its body SHALL show one live block per agent in place of the start lines. The block SHALL use the chat's live colour. When the call ends, its body SHALL show the call's input and output as it does today.

#### Scenario: A parallel call from chat

- **WHEN** chat runs two agents through one `subagent` call
- **THEN** the open tool call shows two blocks, one per agent, each naming its agent

### Requirement: Design Library generation can be watched

A Design Library tile for a reference being generated SHALL offer the eye control. Opening it SHALL show the live block inside the tile in place of the spinner and its line. Closing it SHALL restore them.

#### Scenario: Watching a generation

- **WHEN** a person opens the eye control on a pending reference
- **THEN** the tile shows what the agent writes now and its latest text

### Requirement: Explorer has no Orchestration view

Explorer SHALL NOT offer an Orchestration view, its activity bar item, its running-count badge, Clear completed or a workspace total of subagent runs. The subagent start and end events and the snapshot SHALL remain available to plugins, and a plugin that shows live subagent text SHALL open a watch for each run it shows.

#### Scenario: The activity bar

- **WHEN** Explorer opens
- **THEN** its activity bar shows no Orchestration item

#### Scenario: A plugin that shows its own agents

- **WHEN** the Research plugin shows a running research agent
- **THEN** it receives that agent's live text after it opens a watch for the run
