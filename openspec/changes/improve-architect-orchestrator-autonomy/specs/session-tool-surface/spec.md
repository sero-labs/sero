# Spec Delta

## MODIFIED Requirements

### Requirement: Members get the tools they were approved for

An Architect or Room member session SHALL be able to activate every tool its approval grants that the permission profile and session kind allow, including tools from plugins other than the grant owner. Loaded schemas SHALL be distinct from approved access; unloaded authorized tools SHALL remain discoverable. The approval dialog MUST NOT offer a tool that a member session of that kind can never get. When an approved tool cannot be provided, the host SHALL log its name and return the reason to discovery or activation callers. User-disabled tools MUST stay disabled.

#### Scenario: Approved plugin tool
- **WHEN** a Room member is approved for `web_search` with a network permission that allows it
- **THEN** the member session can discover, activate and run a web search

#### Scenario: Tool a member can never get
- **WHEN** the approval dialog is built for a Room member
- **THEN** it does not offer `goal`, `goals`, `rooms` or the goal terminal tools

#### Scenario: Approved tool that is gone
- **WHEN** a member session opens and an approved tool's plugin is no longer installed
- **THEN** the session opens without that tool, the host log names it, and discovery or activation explains its unavailability

## ADDED Requirements

### Requirement: Agents can discover approved capabilities

Architect owners, Workflow workers and Room members SHALL have bounded discovery of authorized tools and skill metadata without loading all schemas or skill bodies. Discovery SHALL distinguish available, disabled, unsupported and denied capabilities. It MUST NOT reveal another project's private resources, expose commands unavailable to that session kind or authorize execution.

#### Scenario: The planner did not load a needed tool
- **WHEN** a worker discovers a need for an already-authorized tool during execution
- **THEN** it can find and activate that tool in the same task without restarting or requesting repeated approval

#### Scenario: An owner needs a project skill
- **WHEN** an authorized skill is relevant to the owner's current work
- **THEN** the owner can discover its metadata and load its instructions without preloading every skill

### Requirement: Owner approval separates access from initial loading

Phase 2 SHALL propose relevant skills and supported Code Mode in new owners' host-clamped start approval, storing approved access separately from the small initial loaded selection. Existing owner grants MUST retain their authority until phase 3 can amend them with explicit user approval. Discovery MUST NOT replace a grant or session to expand access.

#### Scenario: A new owner loads approved access later
- **WHEN** the user approves a new owner's grant containing a skill and supported Code Mode that are initially unloaded
- **THEN** the owner can discover and activate them in phase 2 without a grant amendment or another approval

#### Scenario: An existing owner has no approved skills
- **WHEN** phase 2 opens an existing owner whose grant has an empty skill set
- **THEN** discovery does not authorize skill loading or replace its grant or session
- **AND** new skill access remains unavailable until phase 3 can apply an explicitly approved amendment

### Requirement: Activation never widens authority

Activation SHALL check the host-authorized capability set, permission profile, session kind, current catalogue and user-disabled settings. Tool schemas and skill instructions SHALL load only within those bounds. Code Mode SHALL be activatable consistently where supported and authorized, and each invoked capability SHALL retain execution-time checks. A skill MUST NOT grant tools or permissions described in its text.

#### Scenario: Code Mode is approved but unloaded
- **WHEN** an owner or worker activates supported, authorized Code Mode
- **THEN** it becomes callable without a session replacement
- **AND** a nested denied tool call remains denied

#### Scenario: A skill names an unapproved tool
- **WHEN** an agent loads an approved skill that refers to an unapproved capability
- **THEN** the instructions load without granting that capability, and a request for new access uses the existing approval path

#### Scenario: User disabled a capability
- **WHEN** discovery, activation, compaction or reopening encounters a user-disabled tool or skill
- **THEN** it stays disabled until the user changes that setting

### Requirement: Capability changes preserve mandatory context

Activation and deactivation SHALL preserve repository instructions, host-required authority context, session identity and task history. Failed activation SHALL leave the effective loaded set truthful and return an actionable reason. Activating tools MUST NOT expose unrelated plugin commands or install a second autonomous driver.

#### Scenario: Activation fails
- **WHEN** a tool's runtime cannot be constructed
- **THEN** it is not shown as callable and the agent receives the missing runtime or capability reason
