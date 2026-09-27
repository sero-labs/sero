## Purpose

Guarantees that extensions loaded into desktop agent sessions receive the Pi session start event with the correct reason, and a session shutdown event when any session ends, so extensions can start and release session work reliably.

## ADDED Requirements

### Requirement: Session start delivered to extensions
The desktop host SHALL deliver `session_start` to the extensions of every chat, plugin app agent, persistent and subagent session exactly once when the session is created or resumed, before the first user turn. The event reason SHALL be `startup` for a new session, `resume` for a resumed session, and `fork` for a forked session.

#### Scenario: New chat session
- **WHEN** the user opens a new chat session
- **THEN** each loaded extension receives `session_start` once with reason `startup`, before `before_agent_start` for the first turn

#### Scenario: Resumed session after restart
- **WHEN** the app restarts and the user reopens an existing session
- **THEN** each loaded extension receives `session_start` once with reason `resume`

#### Scenario: Subagent session
- **WHEN** a subagent session is created
- **THEN** each loaded extension receives `session_start` once

### Requirement: Session reload delivers both events
When the host reloads a session's resources, the extensions that handle the session's next turn SHALL receive `session_shutdown` and then `session_start` with reason `reload`.

#### Scenario: Resource reload
- **WHEN** the user reloads resources in a chat session
- **THEN** each extension that handles the next turn has received `session_start` with reason `reload` before that turn

### Requirement: Session shutdown delivered to extensions
The desktop host SHALL deliver `session_shutdown` to the extensions of every chat, plugin app agent, persistent and subagent session before the session is disposed, and SHALL wait for the extension handlers to finish. This SHALL also apply when a plugin is unloaded or refreshed and when the app quits.

#### Scenario: Plugin unloaded
- **WHEN** a plugin with open app sessions is unloaded
- **THEN** each of those sessions' extensions finishes its `session_shutdown` handler before the session is disposed

#### Scenario: App quits
- **WHEN** the app quits with app sessions open
- **THEN** their `session_shutdown` handlers finish before the process exits

#### Scenario: Subagent finishes
- **WHEN** a subagent session completes, fails or is aborted
- **THEN** each loaded extension receives `session_shutdown` before the session is disposed

#### Scenario: Persistent session closed
- **WHEN** a persistent session is closed
- **THEN** each loaded extension receives `session_shutdown` before the session is disposed

### Requirement: Probe sessions do not start extensions
Sessions that the host creates only to inspect tools or configuration SHALL NOT deliver `session_start`.

#### Scenario: Tool catalog probe
- **WHEN** the host builds the subagent tool catalog
- **THEN** no extension receives `session_start`

### Requirement: UI context kept
Delivering `session_start` SHALL NOT remove the Sero UI context from extensions.

#### Scenario: Notify after session start
- **WHEN** an extension calls `ctx.ui.notify` in its `session_start` handler or later
- **THEN** the notification reaches the desktop UI
