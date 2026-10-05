## Purpose

Defines which tools and Sero CLI commands each kind of agent session is given, and guarantees that every tool or command a session is shown can be called from that session.

## Requirements

### Requirement: Shown means callable
Every tool in a session's tool list, and every Sero CLI command listed in that session's system prompt, SHALL be callable from that session. A call with valid arguments MUST NOT fail because the tool is unknown, the command is unknown, the session is not recognised, or the session lacks a runtime the tool needs. This applies to chat, workflow step, subagent, Architect, Room member and cron sessions, on host and container workspaces.

#### Scenario: Probe every shown tool
- **WHEN** a session of any listed kind is opened in a fresh profile and each shown tool and listed command is called with valid read-only arguments
- **THEN** no call returns an unknown-tool, unknown-command, "requires an active agent session" or "No active agent session" error

#### Scenario: A new tool without a probe
- **WHEN** a session is shown a tool or command that the contract test has no probe arguments for
- **THEN** the contract test fails and names that tool or command

### Requirement: Chat direct tools
A chat session SHALL have exactly these direct tools: `read`, `write`, `edit`, `bash`, `find`, `grep`, `multi_grep`, `codemode`, `subagent` and `sero-cli`, plus the goal terminal tools while a goal is attached. Plugin tools, including `design_library_assets`, `design_library_settings`, `mcp_manager` and `automation_browser`, SHALL reach a chat session only as Sero CLI commands.

#### Scenario: Fresh chat session
- **WHEN** a chat session opens with no goal attached
- **THEN** its tool list is exactly `read`, `write`, `edit`, `bash`, `find`, `grep`, `multi_grep`, `codemode`, `subagent` and `sero-cli`

#### Scenario: Moved tool is a command
- **WHEN** the agent in a chat session runs `mcp_manager`, `design_library_settings`, `design_library_assets` or `automation_browser` through `sero-cli` with valid arguments
- **THEN** the command runs and returns the same result the direct tool returned before

#### Scenario: Plugin UI still calls a moved tool
- **WHEN** the Design Library UI imports an image or changes a setting
- **THEN** the call succeeds through the app's own tool path, whether or not the tool is bridged into `sero-cli`

### Requirement: Moved commands say when to use them
Each Sero CLI command that replaces a direct tool SHALL have a summary in the CLI command list that states the situation it is for. No command summary SHALL end mid-word.

#### Scenario: Summary lines
- **WHEN** the CLI command list is built
- **THEN** every summary ends at a word boundary, and the summaries for `mcp_manager`, `design_library_assets`, `design_library_settings` and `automation_browser` each name the task they are for

#### Scenario: A real model picks a moved command
- **WHEN** a cheap real model in a chat session is asked to do a task that only a moved command can do
- **THEN** it calls that command through `sero-cli`

### Requirement: Goal terminal tools follow the goal
The goal terminal tools SHALL be active only while a goal is attached to the session. Activating them MUST NOT add any other tool, MUST NOT add them to a session whose allowlist excludes them, and MUST keep any tool the user disabled in that session disabled.

#### Scenario: No goal
- **WHEN** a chat session has no goal attached
- **THEN** `goal_complete`, `goal_blocked` and `goal_wait` are not in its tool list

#### Scenario: Goal starts and ends
- **WHEN** a goal starts in a session and later completes, blocks or parks
- **THEN** the three terminal tools are in the tool list while the goal runs and are gone after it ends

#### Scenario: User-disabled tool survives activation
- **WHEN** the user disabled a tool in a session and a goal then starts
- **THEN** that tool stays disabled

### Requirement: Goals run only in chat sessions
Only chat sessions SHALL be able to start a goal. Room member sessions MUST NOT be given the `goal` command or the goal terminal tools.

#### Scenario: Room member command list
- **WHEN** a Room member session starts
- **THEN** its Sero CLI commands do not include `goal`, and its tool list does not include `goal_complete`, `goal_blocked` or `goal_wait`

### Requirement: Subagents get no goal or Rooms tools
Subagent and workflow step sessions MUST NOT be given `goal`, `goals`, `goal_complete`, `goal_blocked`, `goal_wait`, `room` or `rooms`, as direct tools or as Sero CLI commands, whatever their tool policy or allowlist.

#### Scenario: Default subagent
- **WHEN** a chat starts a subagent whose agent definition names no tools
- **THEN** none of those tools or commands are in the subagent's tool list or CLI command list

#### Scenario: Allowlist names a goal tool
- **WHEN** a workflow step's allowlist includes `goal` or `rooms`
- **THEN** the step session still does not have it

### Requirement: A default subagent reaches plugin tools through Sero CLI
A subagent or workflow step session that has `sero-cli` and no tool allowlist SHALL reach plugin tools as Sero CLI commands, as a chat does, and MUST NOT have them as direct tools. A session with an allowlist keeps each named tool as a direct tool, because an allowlist approves tools by name.

#### Scenario: Default subagent tool list
- **WHEN** a chat starts a subagent whose agent definition names no tools
- **THEN** its direct tools are the core file, search, shell and code tools plus `sero-cli`, and plugin tools such as `web_search` and `git_manager` are Sero CLI commands

#### Scenario: Subagent with an allowlist
- **WHEN** a subagent's allowlist names `web_search`
- **THEN** `web_search` is a direct tool in that session

### Requirement: Plugins declare which session kinds a tool is for
A plugin SHALL be able to declare, per tool, the session kinds it is for: chat, subagent (including workflow steps) and member (Architect and Room members). The host MUST keep a declared tool out of every session kind not listed for it, as a direct tool and as a Sero CLI command. A tool with no declaration SHALL stay available to every kind.

#### Scenario: Chat-only tool in a subagent
- **WHEN** a plugin declares a tool for chat only and a subagent session loads that plugin
- **THEN** the subagent does not have that tool, and a chat session still does

#### Scenario: Member-only tool in chat
- **WHEN** a plugin declares a tool for members only
- **THEN** a chat session does not list it, and a Room member session does

#### Scenario: Undeclared tool
- **WHEN** a plugin tool has no session-kind declaration
- **THEN** every session kind that loads the plugin gets it, as today

### Requirement: Member file tools use the workspace runtime
In Architect and Room member sessions, the approved `read`, `write` and `edit` tools SHALL act on the same filesystem as the approved `bash` tool.

#### Scenario: Container workspace member
- **WHEN** a Room member in a container workspace writes a file with `write` and then lists it with `bash`
- **THEN** `bash` sees the file

### Requirement: Members get the tools they were approved for
An Architect or Room member session SHALL get every tool its approval grants that the permission profile allows, including tools that come from plugins other than the one that owns the grant. The approval dialog MUST NOT offer a tool that a member session of that kind can never get. When an approved tool cannot be provided when the session opens, the host SHALL log its name.

#### Scenario: Approved plugin tool
- **WHEN** a Room member is approved for `web_search` with a network permission that allows it
- **THEN** the member session can run a web search

#### Scenario: Tool a member can never get
- **WHEN** the approval dialog is built for a Room member
- **THEN** it does not offer `goal`, `goals`, `rooms` or the goal terminal tools

#### Scenario: Approved tool that is gone
- **WHEN** a member session opens and an approved tool's plugin is no longer installed
- **THEN** the session opens without that tool and the host log names it

### Requirement: Room members get only the room command from the Orchestrator
A Room member session SHALL get `room` and no other Orchestrator command.

#### Scenario: Member command list
- **WHEN** a Room member session starts
- **THEN** its Orchestrator commands are exactly `room`

### Requirement: Private command sets hold only callable commands
A session with its own private command set SHALL NOT list slash commands in it, because it cannot run them.

#### Scenario: Member CLI list
- **WHEN** a Room member or the Architect lists its Sero CLI commands
- **THEN** every command listed runs from that session
