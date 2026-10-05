## Purpose

Lets the agent in chat sessions keep important or surprising facts about the user and each project across sessions, and put a fact into context only when it applies, so memory changes behaviour without polluting context.

## ADDED Requirements

### Requirement: Memory only in chat sessions
Memory SHALL exist only in chat sessions. Chat sessions SHALL receive the identity profile, the user profile, pinned memories, open scratchpad items, on-match recall, and the memory and scratchpad tools. Subagent sessions (including orchestrator workflow steps), persistent sessions (Architect and Rooms) and plugin app agent sessions MUST NOT receive any memory in their prompt or context, and MUST NOT have any tool that reads or changes memory.

#### Scenario: Chat session receives memory
- **WHEN** a chat session starts
- **THEN** its system prompt contains the identity profile, the user profile and the pinned memories

#### Scenario: Subagent receives no memory
- **WHEN** a chat session starts a subagent
- **THEN** the subagent's system prompt and context contain no memory, and it has no memory or scratchpad tool

#### Scenario: Architect session receives no memory
- **WHEN** an Architect or Rooms session runs
- **THEN** its system prompt and context contain no memory, and it has no memory or scratchpad tool

### Requirement: Memory scope
Each memory SHALL have one scope: `global`, visible in every workspace, or `workspace`, visible only in the workspace where it was saved.

#### Scenario: Workspace memory stays in its workspace
- **WHEN** a memory is saved with workspace scope in workspace A
- **THEN** chat sessions in workspace B never receive it

#### Scenario: Global memory in every workspace
- **WHEN** a memory is saved with global scope in workspace A
- **THEN** chat sessions in workspace B can receive it

### Requirement: Pinned memories
A memory with pinned delivery SHALL be in the system prompt of every chat session in its scope. The number of pinned memories MUST NOT exceed a configurable cap for each scope, with defaults of 10 global and 5 workspace. The profile files MUST NOT count toward the cap.

#### Scenario: Pin refused at the cap
- **WHEN** the agent pins a global memory while 10 global memories are pinned
- **THEN** the pin is refused and the agent receives the current pinned list, so it can unpin or replace one

#### Scenario: Unpin keeps the memory
- **WHEN** the agent unpins a memory
- **THEN** the memory stays stored with on-match delivery

### Requirement: Stable system prompt within a session
The memory part of a chat session's system prompt SHALL stay byte-identical on every turn of the session. It SHALL be rebuilt only when the session compacts.

#### Scenario: Save does not change the prompt
- **WHEN** the agent saves or pins a memory during a session
- **THEN** the system prompt of the next turn in that session is byte-identical to the previous one

#### Scenario: Compaction refreshes the prompt
- **WHEN** a session compacts after the agent pinned a memory or added a scratchpad item
- **THEN** the system prompt after compaction contains that memory and that item

### Requirement: On-match recall
Before each user message that starts a new agent run in a chat session, the system SHALL search the on-match memories of the global scope and of the current workspace with the user's message. It SHALL add the matches above the score threshold to the same turn as one message after the user's message. The system MUST add each memory at most once per session between compactions, MUST NOT remove earlier recall messages, and MUST add nothing when nothing matches. Pinned memories, unsorted memories, and the old daily and session files MUST NOT be searched. A message sent to a running agent (steering) SHALL NOT trigger recall.

#### Scenario: Steering message gets no recall
- **WHEN** the user sends a message while the agent is still running
- **THEN** no recall message is added for it, and the next message that starts a new run is searched as normal

#### Scenario: Relevant memory recalled
- **WHEN** an on-match memory about the JS package manager exists and the user asks to add a dependency in a JS project
- **THEN** that memory is added to the turn, after the user's message

#### Scenario: No match adds nothing
- **WHEN** no on-match memory scores above the threshold
- **THEN** no recall message is added to the turn

#### Scenario: Memory added once
- **WHEN** a memory was recalled earlier in the session and matches again
- **THEN** it is not added a second time

#### Scenario: Recall again after compaction
- **WHEN** a memory was recalled, the session compacted, and the memory matches again
- **THEN** it is added again

#### Scenario: Resumed session after restart
- **WHEN** the app restarts and the user resumes a session in which a memory was already recalled since the last compaction
- **THEN** that memory is not added again

### Requirement: Saving memories
A saved memory MUST have a type (`preference`, `decision`, `lesson` or `reference`), a scope, a delivery mode, a statement of how it changes behaviour, and the terms a future task would use. Before a new memory is written, the system SHALL report any close existing memory in the same scope and SHALL NOT write the new memory until the agent chooses to replace the existing one or confirms that the new one is distinct.

#### Scenario: Close memory reported
- **WHEN** the agent saves "use pnpm for JS projects" and a global memory "JS/TS: use pnpm" exists
- **THEN** nothing is written, and the agent receives the existing memory with the choice to replace it or to confirm the new one is distinct

#### Scenario: Missing fields rejected
- **WHEN** the agent saves a memory without a statement of how it changes behaviour
- **THEN** the save is rejected with the missing fields named

### Requirement: Profile editing
In chat sessions, the agent SHALL be able to read and rewrite the identity profile and the user profile through the memory tool. Profile writes SHALL NOT need the fields required for memories. Direct file edits to the profiles SHALL stay blocked.

#### Scenario: Profile change
- **WHEN** the user asks the agent to be more concise from now on
- **THEN** the agent rewrites the identity profile through the memory tool, and the next session's system prompt contains the new style

### Requirement: Restorable removal
Removing a memory SHALL keep its full content so that it can be restored. Restoring SHALL return the memory to its previous scope and delivery mode.

#### Scenario: Restore after remove
- **WHEN** the agent removes a memory and then restores it by its ID
- **THEN** the memory is back with the same content, scope and delivery mode

### Requirement: Workspace memory kept out of Git
Before the first workspace-memory write in each app run, the system SHALL make sure that the workspace's local Git exclude rules ignore Sero's workspace folder, and SHALL check whether Git tracks any file in the workspace memory folder. If Git tracks one, the system MUST refuse every workspace-memory write in that app run and tell the agent why. If the check or the exclude update fails, the system MUST refuse the write and MUST check again on the next write. Workspaces that are not Git repositories SHALL be unaffected.

#### Scenario: Missing exclude rule added
- **WHEN** the first workspace memory is saved in a Git workspace whose local exclude rules do not ignore Sero's workspace folder
- **THEN** the rule is added and the memory is saved

#### Scenario: Tracked memory file refused
- **WHEN** Git tracks any file in the workspace memory folder and the agent saves a workspace memory
- **THEN** the save is refused and the agent is told that Git tracks the memory files

#### Scenario: Failed check fails closed
- **WHEN** the Git check fails with an error on the first workspace-memory save
- **THEN** the save is refused, and the next save runs the check again

#### Scenario: Check runs once per app run
- **WHEN** the first check succeeds and the agent saves several more workspace memories in the same app run
- **THEN** the Git check does not run again

### Requirement: Workspace scratchpad
Chat sessions SHALL have a per-workspace checklist of open items with no expiry. Open items SHALL be in the system prompt of chat sessions in that workspace. A change during a session SHALL return the full current list to the agent. A finished item SHALL leave the system prompt at the next session or compaction.

#### Scenario: Item added mid-session
- **WHEN** the agent adds a scratchpad item
- **THEN** the tool result shows the full list with the new item, and the system prompt of the current turn does not change

#### Scenario: Old workspace keeps its items
- **WHEN** a workspace is reopened after weeks
- **THEN** its open scratchpad items are in the system prompt

### Requirement: Automatic tidy-up
At chat session start, the system SHALL run a background tidy-up for each scope when the last run for that scope was more than 7 days ago or unsorted memories exist. At most one tidy-up SHALL run for a scope at a time. It SHALL work without user review. It SHALL merge duplicates into one memory and sort unsorted memories into pinned or on-match within the pinned caps. It SHALL remove a memory only with checkable evidence: a merged memory that replaces it and has already been written, or, for a workspace memory only, a file path named by the memory that is inside that memory's own workspace and does not exist. A global memory MUST NOT be removed because of a missing file. Command names, package names and paths outside the workspace MUST NOT count as evidence. It MUST NOT remove a memory because of age or opinion alone, and it SHALL keep a memory when the evidence is unclear. It MUST NOT apply a decision to a memory that changed after the tidy-up read it. An on-match memory not recalled in 60 days SHALL only be re-checked. Every change SHALL be logged with its evidence, and every removal SHALL be restorable.

#### Scenario: Unused memory kept
- **WHEN** an on-match memory has not been recalled in 60 days and no evidence says it is wrong
- **THEN** the tidy-up keeps it

#### Scenario: Removal without evidence dropped
- **WHEN** the tidy-up model proposes a removal with no evidence, or with a command name or a path outside the workspace as evidence
- **THEN** the memory is kept and the rejected proposal is logged

#### Scenario: Global memory kept when a file is missing
- **WHEN** a global memory names `src/config.ts` and the current workspace has no such file
- **THEN** the tidy-up keeps the memory

#### Scenario: Correction during tidy-up kept
- **WHEN** the agent replaces a memory while the tidy-up waits for its model response, and the tidy-up then decides to merge or remove that memory
- **THEN** that decision is dropped and the replaced memory is unchanged

#### Scenario: Merge writes before it removes
- **WHEN** the tidy-up merges two memories
- **THEN** the merged memory exists before the two originals move to the restorable removed set

#### Scenario: Invalid output changes nothing
- **WHEN** the tidy-up model returns output that is not valid
- **THEN** no memory changes

### Requirement: Conversion of existing memory
On the first chat session after the update, the system SHALL convert the existing long-term memory file once, without a model call. It SHALL read every format the current plugin reads, including prose under headings. Each converted entry SHALL become a global memory that stays in the system prompt as unsorted, outside the pinned cap, until the tidy-up sorts it. Entries that exactly match an onboarding "none" answer SHALL be skipped. Before the original file is renamed, the system SHALL verify that every fact in it appears in the converted entries. If the check fails, the system MUST leave the original file in place and keep its content in the prompt. The original file SHALL be kept with unchanged content. An interrupted conversion SHALL be retried at the next chat session without losing or duplicating entries. The first chat session's prompt SHALL wait for the conversion. The system MUST NOT modify or delete existing daily log and session transcript files.

#### Scenario: Old facts stay visible
- **WHEN** a profile with 7 existing long-term entries opens its first chat session after the update
- **THEN** the system prompt contains those entries before the tidy-up has run

#### Scenario: Prose under headings kept
- **WHEN** the existing file holds prose paragraphs under headings
- **THEN** each paragraph becomes a converted entry

#### Scenario: Interrupted conversion retried
- **WHEN** the app quits during conversion and a chat session starts later
- **THEN** the conversion completes with each fact present exactly once

#### Scenario: Failed check keeps the original
- **WHEN** a fact in the existing file does not appear in the converted entries
- **THEN** the original file stays in place and its content stays in the prompt

#### Scenario: Conversion runs once
- **WHEN** the conversion has completed and another chat session starts
- **THEN** the conversion does not run again

### Requirement: No activity logging
The system SHALL NOT write daily logs, session summaries, activity lines or transcript copies, and SHALL NOT make model calls at session shutdown.

#### Scenario: Normal session writes no logs
- **WHEN** a chat session runs commands, edits files and ends
- **THEN** nothing is written under the daily log or session transcript folders

### Requirement: Memory activity in chat
Chat SHALL show one compact, collapsed line when memories are recalled into a turn, which expands to show the recalled memories, and one when the agent saves a memory. Chat SHALL show nothing for turns without memory activity. The memory-blocks toggle SHALL NOT exist.

#### Scenario: Recall shown
- **WHEN** two memories are recalled into a turn
- **THEN** the chat shows one collapsed line that expands to show both

#### Scenario: Quiet turn
- **WHEN** a turn has no recall and no save
- **THEN** the chat shows no memory line

### Requirement: Onboarding
Memory onboarding SHALL have two steps, identity and user profile. The user profile step SHALL include a coding style question written to the user profile. Onboarding SHALL NOT write long-term memories.

#### Scenario: Coding style saved to the profile
- **WHEN** the user picks "Prefer strong typing" during onboarding
- **THEN** the user profile contains that choice in its coding style field and no long-term memory is created

### Requirement: Evaluation
The system SHALL record a metrics event for each save, replace, remove, restore, pin, unpin, recall (with memory IDs, scores and latency), turn with no recall, miss, pinned-rule break, tidy-up change and scratchpad change. A miss SHALL be recorded when the agent replaces an on-match memory that was not recalled in the current session. A pinned-rule break SHALL be recorded when the agent replaces a pinned memory with the same fact. A save-recall evaluation and an offline search evaluation SHALL produce reports. The reports SHALL NOT gate the build.

#### Scenario: Miss recorded
- **WHEN** the user restates a preference that exists as an on-match memory which was not recalled in the session, and the agent replaces that memory
- **THEN** a miss event is recorded with the memory ID

#### Scenario: Save-recall report
- **WHEN** the save-recall evaluation runs its fixed conversations
- **THEN** it reports which save-worthy moments were saved and which saves were not save-worthy
