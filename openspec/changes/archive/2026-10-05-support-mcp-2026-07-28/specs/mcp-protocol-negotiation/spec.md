# Spec Delta

## Purpose

Lets Sero connect to MCP servers that speak the `2026-07-28` revision and to servers that speak only a 2025 revision, and shows the user which protocol and extensions each server uses.

## ADDED Requirements

### Requirement: Era negotiation with legacy fallback
When Sero connects to a configured MCP server, it SHALL first try the `2026-07-28` revision through `server/discover`, without an `initialize` / `initialized` exchange. If the server does not positively answer as a modern server, Sero SHALL fall back to the 2025 `initialize` handshake. An HTTP `401` or `403`, an HTTP `5xx`, or an HTTP timeout on the probe MUST NOT select the legacy era. Sero MUST report these as authorization, server or timeout failures.

#### Scenario: Modern server
- **WHEN** Sero connects to a server that answers `server/discover` with `2026-07-28`
- **THEN** the connection succeeds without an `initialize` request
- **AND** the server's runtime state reports era `modern` and revision `2026-07-28`

#### Scenario: Legacy stdio server
- **WHEN** Sero connects to a stdio server that supports only a 2025 revision
- **THEN** the connection succeeds through the `initialize` handshake
- **AND** the server's runtime state reports era `legacy` and the negotiated 2025 revision

#### Scenario: Stdio server that exits on an unknown request
- **WHEN** a legacy stdio server exits when it receives `server/discover`
- **THEN** Sero connects to it through the `initialize` handshake
- **AND** the server process that Sero keeps for the session never receives `server/discover`

#### Scenario: Probe rejected by authorization
- **WHEN** an HTTP server answers the `server/discover` probe with `401`
- **THEN** Sero starts the existing authorization flow for that server
- **AND** Sero does not record the server as legacy

### Requirement: Per-request envelope and routing headers
For a server in the modern era, every request and notification that Sero sends SHALL carry the protocol version, client identity and client capabilities in the request `_meta` envelope. Over Streamable HTTP, each modern request SHALL carry the `MCP-Protocol-Version`, `Mcp-Method` and, where the method names a target, `Mcp-Name` headers. Sero MUST NOT depend on `Mcp-Session-Id` for a modern server.

#### Scenario: Modern HTTP tool call
- **WHEN** the agent calls tool `search` on a modern Streamable HTTP server
- **THEN** the HTTP request has `Mcp-Method: tools/call` and `Mcp-Name: search`
- **AND** the request `_meta` contains the protocol version, client identity and client capabilities

#### Scenario: Client capabilities follow host readiness
- **WHEN** a host feature such as Tasks or Skills is disabled
- **THEN** the client capabilities that Sero sends do not declare that extension

### Requirement: Per-request cancellation
When the user or the agent stops an in-flight MCP request, Sero SHALL cancel only that request. On a modern Streamable HTTP connection the cancellation SHALL close the request's response stream. On legacy connections and stdio it SHALL send `notifications/cancelled`.

#### Scenario: Cancel one of two calls
- **WHEN** two tool calls to the same modern HTTP server are in flight and the user stops one
- **THEN** the stopped call ends as cancelled
- **AND** the other call completes normally

### Requirement: No new deprecated client features
Sero MUST NOT add new dependencies on the deprecated Roots, Sampling or Logging client features. Sero SHALL NOT declare Sampling or Roots client capabilities to modern servers.

#### Scenario: Modern capability envelope
- **WHEN** Sero sends a request to a modern server
- **THEN** the client capabilities in the envelope do not include `sampling` or `roots`

### Requirement: Transport choice and SSE compatibility
New server configuration and setup flows SHALL offer stdio and Streamable HTTP only. A saved server entry that uses the deprecated SSE transport SHALL continue to connect, and its detail view SHALL show that it uses a deprecated transport.

#### Scenario: Add a new remote server
- **WHEN** the user adds a remote server in the MCP app
- **THEN** the transport choices do not include SSE

#### Scenario: Saved SSE entry
- **WHEN** Sero loads a saved configuration with an SSE server entry
- **THEN** Sero connects to the server over SSE
- **AND** the server detail view shows a deprecated-transport warning

### Requirement: Protocol diagnostics
Each server detail view SHALL show the negotiated era and revision, the extensions that the server and Sero both support, the metadata cache state, and whether the server uses a deprecated transport. When a connection or operation fails, the view SHALL name the phase that failed: discovery, legacy fallback, authorization, extension negotiation, app loading, task polling or skill loading.

#### Scenario: Diagnostics for a modern server
- **WHEN** the user opens the detail view of a connected modern server that supports MCP Apps
- **THEN** the view shows `2026-07-28` and the MCP Apps extension

#### Scenario: Failure phase
- **WHEN** a server fails during authorization
- **THEN** the detail view names authorization as the failed phase

### Requirement: Existing behavior is kept
The upgrade MUST keep existing MCP configuration files, OAuth sessions, tool calls, resource reads, Agent Plugin-owned servers and the `mcp` CLI commands working without user action.

#### Scenario: Existing configuration after upgrade
- **WHEN** Sero starts with an MCP configuration saved by the previous version
- **THEN** every server entry loads with the same identity and settings
- **AND** a server that was authorized before stays authorized

#### Scenario: Agent Plugin-owned server
- **WHEN** an Agent Plugin declares an MCP server
- **THEN** that server connects and its tools are available to the agent as before

### Requirement: Small agent tool surface
Sero SHALL expose new protocol features to the model through the existing `mcp` dispatcher (the `sero mcp` CLI commands) and its actions. Sero MUST NOT register one model tool for each protocol operation. Sero MUST NOT expose protocol bookkeeping such as envelopes, request state or cache hints to the model.

#### Scenario: Tool list after upgrade
- **WHEN** the agent lists its tools
- **THEN** the agent has no new MCP model tools
- **AND** task, skill and input features are reachable through `sero mcp` commands
