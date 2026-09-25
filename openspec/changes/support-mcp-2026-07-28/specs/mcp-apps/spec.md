# Spec Delta

## Purpose

Lets Sero act as a complete MCP Apps host: it shows the interactive view that a tool declares, both for tool calls the model starts in a conversation and for manual calls in the MCP app, with strict isolation from the host and from other servers.

## ADDED Requirements

### Requirement: Extension negotiation and app detection
Sero SHALL declare the MCP Apps extension to servers, and SHALL detect an app from the `ui` resource URI in a tool's metadata. Sero SHALL read the `ui://` resource before or after the tool call, as the tool declares.

#### Scenario: Tool with an app
- **WHEN** a tool's metadata names a `ui://` resource
- **THEN** Sero treats the tool as having an app and reads that resource to render it

### Requirement: Inline apps for model-initiated calls
When the agent calls a tool that has an app, the conversation SHALL show the app inline with that tool call. The normal tool result SHALL still go to the agent and SHALL still be visible to the user. The manual tool runner and viewer in the MCP app SHALL keep working for inspection.

#### Scenario: Agent calls an app tool
- **WHEN** the agent calls a tool that has an app
- **THEN** the conversation shows the app next to the tool call
- **AND** the app receives the tool input and the tool result

#### Scenario: Manual run
- **WHEN** the user runs the same tool from the MCP app tool runner
- **THEN** the MCP app viewer shows the app

### Requirement: App Bridge protocol
Sero SHALL talk to an app through the official App Bridge protocol. It SHALL support `ui/initialize`, delivery of tool input and results, app-to-server tool calls, context updates, messages to the conversation, link opening and the host capabilities that Sero declares. Sero SHALL declare only the host capabilities that it implements.

#### Scenario: App asks to open a link
- **WHEN** an app asks the host to open an external URL
- **THEN** Sero shows the full URL and opens it in the system browser only after the user agrees

#### Scenario: App sends a message
- **WHEN** an app sends a message to the conversation
- **THEN** the message appears as coming from that app and server, not from the user

### Requirement: App tool calls are restricted
An app SHALL call only tools of the server that owns it. Sero SHALL check each app tool call against the tool's visibility and against the same approval rules as a model tool call. Sero MUST refuse a call to a tool that is not visible to apps or that belongs to another server.

#### Scenario: Approved app tool call
- **WHEN** an app calls a visible tool of its own server and the call is approved
- **THEN** the tool runs and the app receives the result

#### Scenario: Call to another server
- **WHEN** an app tries to call a tool of a different server
- **THEN** Sero refuses the call and the other server receives no request

### Requirement: Isolation, CSP and permissions
Sero SHALL render each app in a sandboxed frame on an origin separate from the Sero UI and from other apps. Sero SHALL apply a Content Security Policy built from the resource's declared domains, and SHALL block network access to other domains. Sero SHALL accept bridge messages only from the app's own frame. Sero SHALL grant a requested sensitive permission, such as camera, microphone, clipboard or geolocation, only after explicit user consent for that app.

#### Scenario: Undeclared domain
- **WHEN** an app requests a resource from a domain that its CSP metadata does not declare
- **THEN** the request is blocked

#### Scenario: Message from another frame
- **WHEN** a bridge message arrives from a window other than the app's frame
- **THEN** Sero ignores the message

#### Scenario: Permission request
- **WHEN** an app requests microphone access
- **THEN** Sero asks the user, and grants access only if the user agrees
- **AND** the app can use the approved API from its own frame origin

### Requirement: No persisted viewer sessions
Sero MUST NOT persist viewer session URLs, tokens or IDs. After a restart, an inline app SHALL render again from its stored tool call and result, or show the fallback.

#### Scenario: Reopen a conversation
- **WHEN** the user reopens a conversation with an app after restarting Sero
- **THEN** the app renders again from the stored tool call and result with a new viewer session

### Requirement: Safe fallback
When an app cannot load, is not supported, or fails its checks, Sero SHALL show a short fallback message that names the reason, and SHALL keep the normal tool result.

#### Scenario: App resource fails to load
- **WHEN** reading the `ui://` resource fails
- **THEN** the conversation shows the fallback message and the normal tool result
