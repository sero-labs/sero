# Spec Delta

## ADDED Requirements

### Requirement: Tool coverage cannot fall behind
Every tool Sero ships to an agent session, every action of that tool and every subcommand of a core Sero CLI command SHALL have either a real-run scenario or an exemption that states why it cannot run. A check SHALL fail when an entry is missing, names a tool or action that no longer exists, or is an exemption with no reason. The check MUST run with the unit tests and MUST NOT need a model, a browser or a container.

#### Scenario: New tool with no scenario
- **WHEN** a plugin registers a new tool and no scenario or exemption names it
- **THEN** the coverage check fails and names the tool

#### Scenario: New action on an existing tool
- **WHEN** a tool's parameter schema gains a new action value and no scenario or exemption names it
- **THEN** the coverage check fails and names the tool and the action

#### Scenario: New subcommand on a core command
- **WHEN** a core Sero CLI command gains a subcommand and no scenario or exemption names it
- **THEN** the coverage check fails and names the command and the subcommand

#### Scenario: Stale entry
- **WHEN** a scenario or exemption names a tool or action that no session can be given
- **THEN** the coverage check fails and names the entry

#### Scenario: Exemption with no reason
- **WHEN** an exemption has an empty reason
- **THEN** the coverage check fails

### Requirement: Every tool action works when run
The tool check SHALL run every non-exempt tool action for real against a fresh profile and workspace, with the real runtime, browser and Code Mode pipeline. Each scenario MUST check the action's effect, such as a file written or a PNG returned, not only that the call returned without an error.

#### Scenario: Action does what it says
- **WHEN** the tool check runs an action whose scenario expects a file in the workspace
- **THEN** the action passes only if the file exists with the expected content

#### Scenario: Action reports success without the effect
- **WHEN** an action returns a success result but its expected effect is absent
- **THEN** the tool check fails and names the action

#### Scenario: Screenshot in a host workspace
- **WHEN** the browser tool takes a screenshot in a host workspace
- **THEN** it returns a PNG and does not fail with "Host path must be inside a workspace root"

#### Scenario: Recording in a host workspace
- **WHEN** the browser tool starts and stops a recording in a host workspace
- **THEN** the recording file is written inside that workspace

### Requirement: Tools work in both runtime modes
The tool check SHALL run every non-exempt action on a host workspace and on a container workspace. On Linux it SHALL cover host and Docker. On macOS and Windows it SHALL cover host. Apple Container SHALL be runnable on a Mac.

#### Scenario: Container run
- **WHEN** the tool check runs with a Docker workspace on Linux
- **THEN** every non-exempt action runs inside the workspace container and is recorded against the Docker runtime

#### Scenario: Host run
- **WHEN** the tool check runs with a host workspace
- **THEN** every non-exempt action runs on the host and is recorded against the host runtime

### Requirement: Every call site runs its tools for real
The tool check SHALL open each call site a tool can run from: the Chat panel, a subagent, a Workflow worker, the Architect owner, a Room member and a Code Mode script. Each site SHALL run every tool it is given at least once for real, in each runtime mode.

#### Scenario: Room member on a host workspace
- **WHEN** a Room member in a host workspace runs each tool its grant allows
- **THEN** every call works from the member's own working directory

#### Scenario: Tool reached through the Sero CLI
- **WHEN** a Chat panel session runs the browser tool through `sero-cli`
- **THEN** the call works as it does when a subagent calls the browser tool directly

### Requirement: A failed tool call reaches its caller as a failure
At every call site, a tool call that fails SHALL return an error result to its caller. Inside a Code Mode script, the failed call SHALL reject, so the script does not continue as if it succeeded.

#### Scenario: Failed CLI command in a Code Mode script
- **WHEN** a Code Mode script runs a `sero-cli` command that exits non-zero and the next line of the script writes a marker file
- **THEN** the call rejects, the marker file is not written and the session sees the error

#### Scenario: Failed shell command
- **WHEN** a session runs `bash` with a command that exits non-zero
- **THEN** the tool result is an error that carries the exit code

### Requirement: Tool arguments arrive unchanged
A tool SHALL receive each argument exactly as the caller sent it, including line breaks, quotes and non-ASCII text.

#### Scenario: Quoted argument with line breaks
- **WHEN** a session runs a `sero-cli` command whose quoted argument contains line breaks
- **THEN** the command receives one argument with the line breaks intact

### Requirement: Tool calls finish, fail or recover in bounded time
A tool call SHALL finish or fail within its scenario's time limit. A browser page stuck in its own code MUST NOT leave the browser tool unusable.

#### Scenario: Launch and navigate wait for load
- **WHEN** the browser tool launches or navigates to a local page with `wait_until` set to `load`
- **THEN** the call returns within 10 seconds

#### Scenario: Page stuck in its own code
- **WHEN** a click runs page code that never returns
- **THEN** the call fails and says the browser was reset, and the next `launch` and `evaluate` work

### Requirement: Cancelling a tool call stops it
Cancelling a session turn SHALL stop the running tool call at every call site, and the session SHALL accept the next prompt.

#### Scenario: Cancel a long shell command
- **WHEN** a session turn is cancelled while `bash` runs a command that would take minutes
- **THEN** the command stops and the session accepts the next prompt

#### Scenario: Cancel a Code Mode script
- **WHEN** a session turn is cancelled while a Code Mode script waits on a nested tool call
- **THEN** the script and the nested call stop and the session accepts the next prompt

### Requirement: A tool check run lists what it did not prove
Each tool check run SHALL record every action it ran, per call site and runtime, with its result. The run SHALL list every exemption with its reason. A run MUST NOT pass when a non-exempt action is missing from its record.

#### Scenario: Scenario skipped at run time
- **WHEN** a non-exempt action's scenario does not run in a tool check run
- **THEN** the run fails and names the action, call site and runtime

#### Scenario: Run report
- **WHEN** a tool check run ends
- **THEN** its report lists every exemption and its reason

### Requirement: The full tool check runs only when started by a person
The full tool check SHALL run only when a person starts it, locally or from a manually started CI workflow. It MUST NOT run on pull requests or on a schedule. The coverage check is not part of this rule.

#### Scenario: Pull request
- **WHEN** a pull request is opened
- **THEN** the coverage check runs with the unit tests and the full tool check does not run

### Requirement: Optional real-model pass
A person starting the tool check SHALL be able to add a pass in which a real model, not the stub, completes one short task at each call site using that site's tools.

#### Scenario: Real-model pass selected
- **WHEN** the tool check is started with the real-model pass on
- **THEN** a real model completes one task per call site and runtime, and the run records the result of each
