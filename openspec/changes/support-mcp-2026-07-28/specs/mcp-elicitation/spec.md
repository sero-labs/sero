# Spec Delta

## Purpose

Lets an MCP server ask the user for input during a request, through the modern multi-round-trip (`input_required`) model or the legacy `elicitation/create` request, with clear ownership and safe handling.

## ADDED Requirements

### Requirement: Answer input-required results
When a request to a modern server returns `resultType: "input_required"`, Sero SHALL present each input request to the user. Sero SHALL then send the original request again with the user's answers in `inputResponses` and with `requestState` unchanged, byte for byte. This SHALL apply to `tools/call`, `prompts/get` and `resources/read`.

#### Scenario: One input round
- **WHEN** a tool call returns `input_required` with one form request and a `requestState`
- **AND** the user submits the form
- **THEN** Sero sends the tool call again with the form answer in `inputResponses` and the same `requestState`
- **AND** the tool's final result goes to the agent

#### Scenario: Two input rounds
- **WHEN** the retried call returns `input_required` again with a new request
- **THEN** Sero presents the new request
- **AND** the next retry carries only the new round's answers and the new `requestState`

### Requirement: Legacy elicitation uses the same path
For a legacy-era server, Sero SHALL answer server-sent `elicitation/create` requests through the same user-facing path, with the same rules, as modern input requests.

#### Scenario: Legacy server asks for input
- **WHEN** a legacy server sends `elicitation/create` during a tool call
- **THEN** Sero shows the same form surface that it uses for a modern input request
- **AND** Sero returns the user's answer as the elicitation result

### Requirement: Ownership is visible
Each input request that Sero shows SHALL name the server and, where one exists, the tool or task that asked for it. The server name SHALL be the host-assigned server label, not the server's self-reported name.

#### Scenario: Form header
- **WHEN** server `github` asks for input during tool `create_issue`
- **THEN** the form shows `github` and `create_issue` as its source

### Requirement: Server input is untrusted
Sero MUST treat the input schema, labels, descriptions and annotations of an input request as untrusted. Sero SHALL render only the supported primitive form field types and SHALL render server text as plain text. A URL-mode request SHALL show the full target URL and SHALL open it only after the user chooses to open it.

#### Scenario: Markup in a label
- **WHEN** a field label contains HTML or Markdown link syntax
- **THEN** the form shows the label as plain text

#### Scenario: Unsupported field type
- **WHEN** a form request contains a field type that Sero does not support
- **THEN** Sero does not show a partial form
- **AND** Sero answers the request as declined and tells the user why

### Requirement: Decline, cancel and timeout
The user SHALL be able to decline or cancel each input request. A cancel SHALL stop the originating request. Each round SHALL obey the same approval, cancellation, timeout and authorization rules as the original request. Sero SHALL stop after a fixed maximum number of rounds and report the stop as an error to the agent.

#### Scenario: User declines
- **WHEN** the user declines an input request
- **THEN** Sero sends the retry with a decline answer for that request

#### Scenario: User cancels
- **WHEN** the user cancels an input request
- **THEN** the originating tool call ends as cancelled
- **AND** Sero sends no more retries for it

#### Scenario: Too many rounds
- **WHEN** a server keeps returning `input_required` past the round limit
- **THEN** the tool call fails with an error that names the round limit

### Requirement: Headless sessions
When no user can answer, for example in a background or automated session, Sero SHALL decline input requests at once and SHALL tell the agent that user input was required.

#### Scenario: Input in a background session
- **WHEN** a tool call in a session with no attached user returns `input_required`
- **THEN** Sero declines the request without waiting
- **AND** the agent receives a result that says the server required user input
