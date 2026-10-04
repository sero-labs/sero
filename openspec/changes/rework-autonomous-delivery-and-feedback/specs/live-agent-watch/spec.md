## MODIFIED Requirements

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
