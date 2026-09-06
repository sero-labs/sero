# Programmatic Tool Calling Specification

## Purpose

Programmatic tool calling lets an agent use bounded JavaScript or TypeScript to compute over data and compose the tools already available to its current session.

## Requirements

### Requirement: Execute a bounded program
The system SHALL provide a `run_code` tool that executes JavaScript or type-stripped TypeScript in an isolated runtime and returns the value produced by the program.

#### Scenario: Parse and transform a file
- **WHEN** a program reads a JSON file through an available tool and processes it with standard JavaScript methods
- **THEN** the tool returns the program's transformed value as one result

#### Scenario: Program exceeds a limit
- **WHEN** a program exceeds an execution, memory, call-count, concurrency, or output limit
- **THEN** the run stops and returns a clear error without automatically retrying

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
The tools available inside a program MUST be limited to the tools active for the calling session. `run_code` MUST NOT grant a tool or permission that the session does not already have, and it MUST NOT expose itself for recursive calls.

#### Scenario: Use an active tool
- **WHEN** a tool is active for the calling session and the program calls it with valid arguments
- **THEN** the system executes it with the same workspace, permission, and runtime context as a direct call

#### Scenario: Call a disabled tool
- **WHEN** a tool is disabled or excluded by the calling session's tool policy
- **THEN** the tool is unavailable inside the program

#### Scenario: Use a plugin tool
- **WHEN** an installed plugin tool is active for the calling session
- **THEN** the program can call it by its existing tool name

### Requirement: Validate nested tool calls
The system MUST validate each nested tool call against that tool's input schema before execution and SHALL propagate cancellation from `run_code` to active nested calls.

#### Scenario: Invalid nested arguments
- **WHEN** a program calls a tool with arguments that do not satisfy its schema
- **THEN** that call fails without executing the tool

#### Scenario: Cancel a running program
- **WHEN** the calling session cancels `run_code`
- **THEN** the program and its active nested calls receive cancellation

### Requirement: Provide code-friendly tool results
Each nested tool call SHALL return plain, serializable data that preserves its text output and structured details without exposing Pi's internal result envelope.

#### Scenario: Parse tool text
- **WHEN** a program reads a text file through a nested tool call
- **THEN** it can access the returned text directly and parse it with standard JavaScript methods

### Requirement: Return a concise run result
The `run_code` result SHALL contain the program's final value and a bounded summary of nested tool calls. It MUST NOT add every full nested tool result to the conversation.

#### Scenario: Complete a multi-tool program
- **WHEN** a program completes after several nested tool calls
- **THEN** the conversation receives one final value and a short call summary

#### Scenario: Nested tool fails
- **WHEN** a nested tool fails and the program does not handle the error
- **THEN** `run_code` returns the failure and identifies the failed nested tool
