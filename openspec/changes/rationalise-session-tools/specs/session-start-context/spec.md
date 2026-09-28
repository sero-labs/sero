## Purpose

Defines what an agent session's system prompt and skill list contain when the session starts, so that start-up text is accurate, is not duplicated, and names only what the session can use.

## ADDED Requirements

### Requirement: Prompt names only reachable tools and commands
A session's system prompt SHALL mention a tool or Sero CLI command only if that session can call it. The Sero CLI block SHALL appear only when the session has the `sero-cli` tool. A plugin's prompt block SHALL appear only when the session can call that plugin's tool or command.

#### Scenario: Subagent without sero-cli
- **WHEN** a subagent or workflow step runs with a tool policy that excludes `sero-cli`
- **THEN** its system prompt contains no Sero CLI block, no MCP block and no memory instructions

#### Scenario: Cron job
- **WHEN** a cron job session starts
- **THEN** its system prompt does not tell it to use `sero memory`, `sero mcp` or any other Sero CLI command

### Requirement: User-global agent skills are not loaded
Sessions SHALL NOT load skills from the user-global `~/.agents/skills` folder. Skills from a project's own `.agents/skills` folders SHALL still load. The Skills UI SHALL list the same skills the agent is given.

#### Scenario: Skill in the user-global folder
- **WHEN** `~/.agents/skills/example/SKILL.md` exists and a session starts
- **THEN** `example` is not in the session's skills and not in the Skills UI

#### Scenario: Skill in a project folder
- **WHEN** a workspace's project contains `.agents/skills/example/SKILL.md` and is trusted
- **THEN** `example` is in the session's skills

### Requirement: Bundled skills
A new profile SHALL receive the bundled skills without the taste skill pack, and SHALL receive a `pi-docs` skill that explains how to read the Pi documentation. Upgrading Sero MUST NOT delete skills that already exist in a profile.

#### Scenario: Fresh profile
- **WHEN** a new profile is created
- **THEN** its skills folder contains no taste-pack skills and contains `pi-docs`

#### Scenario: Existing profile with the taste pack
- **WHEN** Sero starts on a profile that already has the taste-pack skills
- **THEN** those skill folders are unchanged

### Requirement: One Pi documentation pointer
A session's system prompt SHALL give the Pi documentation location exactly once, as a path that session's tools can read: the shared copy on the host, or its mounted path in a container.

#### Scenario: Host chat
- **WHEN** a host workspace chat session starts
- **THEN** the prompt contains one Pi docs location, and `read` on that location's README succeeds

#### Scenario: Container chat
- **WHEN** a container workspace chat session starts
- **THEN** the prompt contains one Pi docs location, and `bash` in the container can read that location's README

### Requirement: Accurate runtime environment block
A chat session SHALL get an environment block that matches its runtime: a container block for a container workspace and a host block for a host workspace. Facts in the container block about the image SHALL match the image the workspace runs.

#### Scenario: Container workspace chat
- **WHEN** a chat session starts in a container workspace
- **THEN** its prompt contains the container block, including the rule to bind dev servers to `0.0.0.0` and the container IP

#### Scenario: Host workspace chat
- **WHEN** a chat session starts in a host workspace
- **THEN** its prompt contains the host block and not the container block

### Requirement: Profile instructions name only real tools
The `AGENTS.md` seeded into a new profile SHALL name only tools and commands that exist, and SHALL NOT contradict the memory instructions.

#### Scenario: Fresh profile AGENTS.md
- **WHEN** a new profile is created
- **THEN** its `AGENTS.md` does not mention `kanban`, `register_dev_server`, a `daily` memory, or editing memory files with `write`

### Requirement: Usage tips live in command help
Detailed usage tips for `sero app` and `sero browser` SHALL be in their help output, not in the system prompt. The prompt SHALL tell the agent to read that help before using those commands.

#### Scenario: Help output
- **WHEN** the agent runs `sero help app` or `sero help browser`
- **THEN** the output contains the usage tips that were removed from the prompt
