# Programmatic Tool Calling Specification

## Purpose

Programmatic tool calling lets an agent use bounded JavaScript to compute over data and compose the tools already available to its current session.

## Requirements

### Requirement: Execute a bounded program
The system SHALL provide a `codemode` tool that executes JavaScript in an isolated runtime and returns the value produced by the script. A script SHALL run under a memory limit and an output limit. A script MAY set a time limit for itself in its options line, and the system SHALL NOT add a time limit of its own.

#### Scenario: Parse and transform a file
- **WHEN** a script reads a JSON file through an available tool and processes it with standard JavaScript methods
- **THEN** the tool returns the script's transformed value as one result

#### Scenario: Program exceeds a limit
- **WHEN** a script exceeds its memory limit, its output limit, or the time limit it set for itself
- **THEN** the run stops and returns a clear error without automatically retrying

#### Scenario: Script sets no time limit
- **WHEN** a script that sets no time limit runs for longer than 30 seconds
- **THEN** the script continues until it completes or the calling session cancels it

### Requirement: Support standard computation
The program SHALL support standard JavaScript computation, including objects, arrays, strings, regular expressions, JSON parsing, loops, conditions, helper functions, and promises.

#### Scenario: Compose concurrent results
- **WHEN** a program calls several available tools with `Promise.all` and combines their results
- **THEN** the program can filter, sort, and return the combined data

### Requirement: Restrict direct host access
The program MUST NOT receive direct access to Node.js APIs, the host filesystem, environment variables, network APIs, or arbitrary package imports. It SHALL reach external capabilities only through tools provided by Sero.

#### Scenario: Attempt direct filesystem access
- **WHEN** a program attempts to use a host filesystem API instead of an available Sero tool
- **THEN** the API is unavailable and the program cannot access the filesystem

### Requirement: Preserve session authority
The tools available inside a script MUST be limited to the tools active for the calling session. `codemode` MUST NOT grant a tool or permission that the session does not already have, and it MUST NOT expose itself for recursive calls. A chat session and a subagent session SHALL use the same tool under the same rules.

#### Scenario: Use an active tool
- **WHEN** a tool is active for the calling session and the script calls it with valid arguments
- **THEN** the system executes it with the same workspace, permission, and runtime context as a direct call

#### Scenario: Call a disabled tool
- **WHEN** a tool is disabled or excluded by the calling session's tool policy
- **THEN** the tool is unavailable inside the script, by a direct call and through tool discovery

#### Scenario: Use a plugin tool
- **WHEN** an installed plugin tool is active for the calling session
- **THEN** the script can call it

#### Scenario: Subagent session
- **WHEN** a subagent session starts with a tool policy that permits programmatic tool calls
- **THEN** it has the `codemode` tool and no `run_code` tool

### Requirement: Validate nested tool calls
The system MUST validate each nested tool call against that tool's input schema before execution and SHALL propagate cancellation from `codemode` to active nested calls.

#### Scenario: Invalid nested arguments
- **WHEN** a script calls a tool with arguments that do not satisfy its schema
- **THEN** that call fails without executing the tool

#### Scenario: Cancel a running program
- **WHEN** the calling session cancels `codemode`
- **THEN** the script and its active nested calls receive cancellation

### Requirement: Provide code-friendly tool results
Each nested tool call SHALL resolve to data a script can use directly. A tool that declares a structured output SHALL resolve to that structured value, and any other tool SHALL resolve to its text output. A shell command that exits with a non-zero code SHALL resolve to its structured value, which carries the exit code, and SHALL NOT reject.

#### Scenario: Parse tool text
- **WHEN** a script reads a text file through a nested tool call
- **THEN** the call resolves to the file's text and the script can parse it with standard JavaScript methods

#### Scenario: Read a failed command's exit code
- **WHEN** a script runs a shell command that exits with a non-zero code
- **THEN** the call resolves to a value with the command's output and exit code, and the script decides whether to continue

### Requirement: Return a concise run result
The `codemode` result SHALL contain the script's final value and a bounded summary of nested tool calls. It MUST NOT add every full nested tool result to the conversation.

#### Scenario: Complete a multi-tool program
- **WHEN** a script completes after several nested tool calls
- **THEN** the conversation receives one final value and a short call summary

#### Scenario: Nested tool fails
- **WHEN** a nested tool fails and the script does not handle the error
- **THEN** `codemode` returns the failure and identifies the failed nested tool

### Requirement: Show nested calls in the chat
The chat SHALL show each nested tool call of a script as a row inside the script's card, with the tool name and its state. Rows SHALL appear while the script runs. A plugin that rewrites tool output SHALL leave the result of a nested call unchanged.

#### Scenario: Rows appear while the script runs
- **WHEN** a script has started a nested call and has not completed
- **THEN** the card shows a row for that call in a running state

#### Scenario: A nested call fails
- **WHEN** a nested call fails
- **THEN** its row shows the failed state and the error text

#### Scenario: Reopen a session
- **WHEN** the user reopens a session that has a completed script
- **THEN** the card shows a row for each nested call with its name and final state

#### Scenario: Output rewrite plugin is active
- **WHEN** the output optimizer plugin is active and a script runs a shell command
- **THEN** the script receives the command's output unchanged
