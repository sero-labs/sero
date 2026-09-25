# Spec Delta

## Purpose

Lets the agent use Agent Skills that an MCP server serves through the Skills extension (`io.modelcontextprotocol/skills`, SEP-2640), while it keeps them separate from local and Agent Plugin skills and prevents them from gaining capabilities.

## ADDED Requirements

### Requirement: Negotiated discovery only
Sero SHALL discover remote skills only from servers that declare the Skills extension, by `skills/list`. Sero MUST NOT infer that a resource is a skill from its URI scheme or name. Sero SHALL support a skill given only its URI through `skills/get`, and MUST NOT treat an empty or partial listing as proof that a server has no skills.

#### Scenario: Server without the extension
- **WHEN** a server that does not declare the Skills extension exposes a `skill://` resource
- **THEN** Sero does not list it as a skill

#### Scenario: Server with the extension
- **WHEN** a server declares the extension and `skills/list` returns two entries
- **THEN** both skills appear under that server in the MCP app with name, description and source

### Requirement: Progressive disclosure
Sero SHALL give the model only skill metadata until a skill is loaded. Sero MUST NOT fetch a skill's files ahead of need. Sero SHALL fetch `SKILL.md` when the skill is loaded and a supporting file only when it is read.

#### Scenario: Listing does not fetch content
- **WHEN** Sero lists a server's skills
- **THEN** Sero sends no `resources/read` for any skill file

### Requirement: Verification
When a skill entry lists its files, Sero SHALL check each fetched file against its listed size and digest, and SHALL compare the `SKILL.md` frontmatter field by field with the entry. A mismatch MUST stop the load or the read. While Sero acts on a skill, it SHALL read only files listed in the held entry. Sero SHALL parse and validate skill content with the same Agent Skills parser and rules as local skills. Sero SHALL decline a skill that exceeds the extension's size limits and SHALL tell the user why.

#### Scenario: Digest mismatch
- **WHEN** the fetched `SKILL.md` does not match the entry digest
- **THEN** Sero does not load the skill and shows it as changed

#### Scenario: Unlisted file
- **WHEN** the skill body refers to a file that is not in the entry's file list
- **THEN** Sero refuses the read and shows the skill as changed

### Requirement: Namespace and precedence
Sero SHALL key each remote skill by its host-assigned server label and its URI. Remote skills SHALL live in a per-server namespace separate from local skills and Agent Plugin skills. A remote skill MUST NOT shadow or replace a skill of the same name from any other origin. Same-name entries inside one server SHALL be shown with their distinguishing path.

#### Scenario: Same name as a local skill
- **WHEN** server `docs` serves skill `review` and a local skill `review` exists
- **THEN** the local skill keeps the name `review`
- **AND** the remote skill is addressed as `docs` / `review`
- **AND** the model sees both, with the remote one tagged with server `docs`

### Requirement: Untrusted content and no granted capabilities
Sero MUST tag remote skill content with its server label when it enters model context, and MUST NOT present it as a local skill. Remote skill content MUST NOT grant tools, host capabilities or permissions. Sero MUST ignore declarative execution fields in remote skills, and MUST require explicit per-skill user approval before a code-execution tool call runs while the model acts on a remote skill. A remote skill MUST NOT cause a resource read on a different server without explicit per-call user approval that names both servers.

#### Scenario: Skill asks to run a script
- **WHEN** the model acts on a remote skill and calls the bash tool
- **THEN** Sero asks the user to approve code execution for that skill before the command runs

#### Scenario: Skill asks for a tool it does not have
- **WHEN** a remote skill's frontmatter lists allowed tools that the session does not have
- **THEN** the session's tools do not change

### Requirement: Visible source, trust and state
The MCP app SHALL show each remote skill's server, URI, trust state, enablement and last refresh time. The user SHALL be able to enable or disable each remote skill. Remote skills SHALL be disabled until the user enables them.

#### Scenario: New remote skill
- **WHEN** a server adds a new skill
- **THEN** the skill appears as disabled with its server and last refresh time

### Requirement: Inventory refresh
Sero SHALL update remote skills when the server's inventory changes, when the server reconnects and when the user refreshes. A skill that the server no longer serves SHALL be removed. A skill whose file list or digests changed SHALL lose any content-bound approval and SHALL require approval again.

#### Scenario: Server removes a skill
- **WHEN** a refreshed listing no longer contains a skill and `skills/get` for its URI fails
- **THEN** Sero removes the skill from the list

#### Scenario: Skill content changes
- **WHEN** a refreshed entry has different digests for an enabled skill
- **THEN** Sero marks the skill as changed and asks for approval again before it loads
