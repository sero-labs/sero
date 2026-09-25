# Spec Delta

## Purpose

Keeps MCP tool, prompt and resource metadata fresh by honoring the server's cache hints, and prevents cached data from leaking across profiles or authorization principals.

## ADDED Requirements

### Requirement: Honor cache hints
For results of `tools/list`, `prompts/list`, `resources/list` and `resources/read` that carry `ttlMs` and `cacheScope`, Sero SHALL treat an entry as fresh only until `ttlMs` has passed. After that, Sero SHALL revalidate the entry with the server before it relies on it. A `ttlMs` of `0` SHALL mean the entry is never served from cache without a request. A result from a legacy server with no hints SHALL keep the current behavior: Sero reuses it until a change notification, a reconnect or a manual refresh.

#### Scenario: Fresh entry
- **WHEN** `tools/list` returned `ttlMs: 60000` thirty seconds ago
- **THEN** Sero uses the cached tool list without a request

#### Scenario: Expired entry
- **WHEN** the same entry is older than sixty seconds and the agent needs the tool list
- **THEN** Sero requests `tools/list` again and replaces the entry

### Requirement: Cache isolation
Cached metadata and resource contents SHALL be keyed by profile and server. An entry with `cacheScope: "private"`, or with no scope, SHALL also be keyed by the authorization principal that received it. Sero MUST NOT return an entry to a different profile, a different server or a different principal.

#### Scenario: Different account on the same server
- **WHEN** a private `resources/read` result was cached while the user was signed in as account A
- **AND** the user signs in to the same server as account B
- **THEN** Sero does not return account A's cached content

#### Scenario: Different profile
- **WHEN** two profiles configure the same server URL
- **THEN** neither profile reads cache entries written by the other

### Requirement: Invalidation
Sero SHALL remove the relevant entries when it receives a `list_changed` or `resources/updated` notification, when the server's configuration changes, when the user signs out, and when the server is removed.

#### Scenario: Tool list changes
- **WHEN** a server sends `notifications/tools/list_changed`
- **THEN** the next use of that server's tool list makes a request

#### Scenario: Sign out
- **WHEN** the user signs out of a server
- **THEN** that principal's private entries for the server are removed

### Requirement: Deterministic persisted order
Persisted server metadata SHALL keep a deterministic server order, independent of the order in which servers answer.

#### Scenario: Servers answer in a different order
- **WHEN** two servers answer their list requests in a different order on two starts
- **THEN** the persisted metadata lists the servers in the same order both times
