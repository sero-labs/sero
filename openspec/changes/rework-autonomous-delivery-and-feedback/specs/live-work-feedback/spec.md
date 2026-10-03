## Purpose

Provide trustworthy live feedback at every level of autonomous work, so users can see what is happening, make needed decisions and inspect details without managing the internal process. The `live-agent-watch` delta in this change carries the three rule changes to the `localise-live-agent-progress` behaviour (no writing label without a tool, scoped metadata without a watch, retained producer partial); this spec states the cross-surface requirements. Neither touches that change's chat or Design Library requirements.

## ADDED Requirements

### Requirement: All work levels expose the same observed facts

Architect's dashboard widget, projects list, project overview and work view; Orchestrator Home, Workflow list/page/step view and Room list/page/Watch/member view SHALL expose scope-appropriate activity from the same observed work. Each overview SHALL name the current work or wait, its owner, last meaningful activity and observation freshness, available spend/limit facts and whether the user must act. Detailed views SHALL expose the underlying work, including delegated children. Work created directly in Orchestrator SHALL not depend on an Architect parent for feedback. Full transcripts MUST NOT be the default overview.

#### Scenario: Parallel work across surfaces
- **WHEN** a project has one Workflow step and two Room members active
- **THEN** their parent summaries show the concurrent work truthfully rather than replacing it with one arbitrary last message
- **AND** opening each level reveals only work belonging to that level

#### Scenario: Standalone Room
- **WHEN** a Room was created directly in Orchestrator
- **THEN** its list, page, Watch and member detail receive the same current observations without any Architect record

### Requirement: Liveness and progress are different facts

The system SHALL track current-session producer contact separately from last meaningful activity. Contact is derived from the producer's open request or tool state in the current session epoch, not from a timer; a renewal timer is added only where that state cannot be observed. A quiet attached model/tool request SHALL remain observable, with its actual request/tool state and any measured wait. A contact update MUST NOT update a progress timestamp, invent output or imply completion. Lost or absent contact SHALL result in Last known, not a claim of failure or continued execution. Unknown source timings MUST remain unavailable, including first-token timing that the source does not measure. The absence of a running tool MUST NOT by itself produce a writing label; a quiet model request SHALL show its observed wait. Where a producer already streams reasoning text as live output, as structured-subagent runs do, Watch MAY keep showing it identified as reasoning; metadata summaries MUST NOT carry it.

#### Scenario: Waiting for a model
- **WHEN** a model request is in flight and the attached producer is responsive but no text is emitted
- **THEN** the overview identifies the observed request wait and retains the earlier meaningful activity time
- **AND** Watch states that no output is available yet without substituting a previous turn's reply

#### Scenario: Lost contact
- **WHEN** the current session loses the producer while the saved status remains running
- **THEN** every affected surface labels the work Last known and shows its last real activity when available
- **AND** it does not turn a disconnect into failed or completed work

### Requirement: Feedback reaches the screen before completion

On a healthy local connection, metadata SHALL reach subscribed surfaces during execution and an opened Watch view SHALL receive available output, tool activity and child activity before the producing turn finishes. An available initial snapshot SHALL arrive before the view is described as empty. Updates arriving out of order MUST NOT roll the view back to an older run, attempt or turn. A live update MUST NOT rely on saving a final record or finishing an entire operation.

#### Scenario: Text arrives mid-turn
- **WHEN** an attached member emits text and a Watch view is subscribed
- **THEN** that text appears while the turn is still in flight

#### Scenario: Watch is opened late
- **WHEN** a user opens Watch after a turn already emitted output
- **THEN** the current available partial snapshot appears without waiting for another token or the final reply

#### Scenario: Old event arrives after a new turn
- **WHEN** a delayed snapshot belongs to an earlier turn or attempt
- **THEN** it does not overwrite the current turn's activity or output

### Requirement: Observation survives navigation without duplicating work

Closing or navigating away from a detailed Watch SHALL release that view's observation resources without stopping execution or losing saved work. Overview observation SHALL receive scoped metadata during execution without transcript subscriptions; it MUST NOT be restricted to start/end events when no Watch is open. Live text and detailed tool payloads SHALL be sent only to authorized open watches. The producer SHALL retain a bounded latest partial for the active turn independently of output watches, using the existing live registries rather than a second transcript store. Closing the last watch SHALL release its subscriptions, timers and pending delivery buffers, not erase that producer snapshot. A late watch SHALL receive the latest partial, not a replay of missed events. Terminal handoff SHALL clear the active partial and use existing history. Returning or reconnecting SHALL reacquire a scoped snapshot and subscribe to later updates without duplicating a run. Opening two observers SHALL not make one observer's close disconnect the other.

#### Scenario: Two Watch views
- **WHEN** two views observe the same Room and one closes
- **THEN** the other continues receiving current snapshots and the Room continues running

#### Scenario: List remains open after Watch closes
- **WHEN** the last Watch closes while its turn continues and a list still observes the work
- **THEN** scoped metadata keeps the list current without sending it text or detailed tool payloads
- **AND** reopening Watch receives the current bounded partial, including output produced while Watch was closed, without replaying each missed event

#### Scenario: Return after a disconnect
- **WHEN** the user returns to a running Workflow after observation was disconnected
- **THEN** the view confirms the attached run, fetches its current snapshot and resumes updates without creating another attempt

### Requirement: Details remain scoped and private

Observation and Watch SHALL enforce authorized profile, workspace, project, run, attempt, session, turn, member and child relationships wherever those identities exist. A missing identity MUST NOT be guessed or joined by display name. Metadata summaries MUST NOT contain prompts, raw tool arguments/results, secrets or hidden model reasoning. Authorized live detail SHALL use the existing bounded output policy and session history for complete saved replies, not a second durable transcript store.

#### Scenario: Similar titles in different workspaces
- **WHEN** two Rooms share a title but belong to different workspaces
- **THEN** opening or observing one never exposes the other's members, output or usage

#### Scenario: Unknown child ancestry
- **WHEN** a child event lacks a verified relationship to the selected run
- **THEN** it is not attached to that run by its label or timing

### Requirement: Worker organization remains inspectable

A work view SHALL identify active owner, planner, steps, Room members, fan-out items and delegated child workers with their actual state and current task. It SHALL let the user follow linked work with its workspace and context intact. A child request wait, tool execution, failure or recovery SHALL be visible without requiring the parent turn to end. Concurrent workers MUST NOT suppress each other's updates.

#### Scenario: One member delegates
- **WHEN** a Room member delegates to two child workers while another member runs a tool
- **THEN** Watch shows each worker's actual activity under the correct parent
- **AND** the other member's tool activity continues updating independently

### Requirement: Holds have a safe recovery path

A hold SHALL name its actual cause, preserve saved work and present the applicable action on the same operation. Resuming an exhausted Room time limit SHALL require approval of a larger total time limit; it MUST NOT silently raise spending or other access. Recoverable holds within existing authority SHALL be controlled by Architect on linked work or by the direct Orchestrator user. Recovery feedback MUST reflect the resulting runtime state, and an already completed operation MUST not be resumed or recreated.

#### Scenario: Expired Room time limit
- **WHEN** a Room is held because its total active-time limit expired
- **THEN** the user can open a separate recovery dialog showing usage, proposed new total and unchanged spending authority
- **AND** an insufficient total cannot be submitted

#### Scenario: In-flight turn completes during pause
- **WHEN** pausing prevents new turns but a current turn finishes
- **THEN** feedback shows the real completion and saved result rather than suggesting the completed Room still needs a resume

### Requirement: Overview feedback is accessible and bounded

State and decision meaning SHALL use readable words and accessible controls, not animation or color alone. The default overview SHALL not grow with raw output, technical documents or historical events. Long documents and complete saved output SHALL remain reachable in separate detail. Required decision, scope, authority and safety information MUST remain visible and MUST NOT be silently truncated.

#### Scenario: Long running work
- **WHEN** several long outputs and research reports accumulate
- **THEN** the overview remains a short current-work account with links to detail rather than a multi-screen technical report

#### Scenario: Reduced motion
- **WHEN** the user enables reduced motion or uses only the keyboard
- **THEN** actual activity, observation loss, Watch access and necessary decisions remain readable and usable
