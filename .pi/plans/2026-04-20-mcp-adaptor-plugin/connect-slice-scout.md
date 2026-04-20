# MCP connect/reconnect slice scout

## 1) Minimal modules/functions to port next
- `server-manager.ts`
  - `connect()` / `createConnection()` with real transport creation, dedupe, and `needs-auth` handling.
  - `close()` / `closeAll()` for lifecycle teardown.
  - `fetchAllTools()` / `fetchAllResources()` for post-connect discovery.
  - `isIdle()` and in-flight tracking if the lifecycle manager keeps using idle shutdown.
- `lifecycle.ts`
  - `startHealthChecks()` + reconnect loop for keep-alive servers.
  - reconnect callback hook so metadata can refresh after a successful reconnect.
- `init.ts`
  - startup bootstrap that connects eager/keep-alive servers, builds metadata from live connections, and seeds cache.
  - `lazyConnect()` path so first use can connect and then write metadata/cache.
  - reconnect callback wiring to refresh metadata and status.
- `tool-metadata.ts`
  - `buildToolMetadata()` for converting live tools/resources into exposed tool metadata.
  - `totalToolCount()` for status bar/snapshot summaries.
- `metadata-cache.ts`
  - cache read/write/validate helpers plus serialize/reconstruct helpers.
  - server hash computation so cache invalidation matches config changes.
- `mcp-auth-flow.ts`
  - only the preconditions: `supportsOAuth(definition)` and the auth status result shape used by connect() when a server needs auth.

## 2) Recommended destination files under `plugins/sero-mcp-plugin/extension/`
- `runtime/mcp-runtime.ts`
  - expose connect/reconnect manager actions and route them through the singleton.
- `runtime/runtime-utils.ts`
  - add small formatting helpers for reconnect/connect results if needed.
- `tools/types.ts`
  - extend `ManagerAction` with connect/reconnect or refresh-style actions.
- `tools/manager-tool.ts`
  - add tool parameters for server name / reconnect target and dispatch to runtime.
- `cache/metadata-cache.ts`
  - keep as the persistence layer for tool/resource counts and cache entries.
- `state/snapshot.ts`
  - keep snapshot counts aligned with cached metadata after connect/reconnect.

## 3) Smallest viable manager action/API additions
- Add a single explicit action for `connect_server` or `reconnect_server` instead of a broader lifecycle API.
- Input should be minimal: `serverName` only, with runtime looking up the config from current state.
- Return a `ToolResult` that includes:
  - `connectionStatus`
  - `toolCount`
  - `resourceCount`
  - `authStatus`
  - `snapshotWritten` / `metadataCache` if the reconnect changed persisted state
- Keep `refresh` separate from connect/reconnect if it already means “rewrite snapshot from current files”; don’t overload it.

## 4) Metadata/tool-count/resource-count refresh path
- On successful connect/reconnect:
  1. connect the server through the manager
  2. fetch tools/resources from the live client
  3. rebuild tool metadata via `buildToolMetadata()`
  4. update in-memory metadata map
  5. persist the cache entry with serialized tools/resources and counts
  6. refresh the snapshot/state so UI summaries pick up new counts
- On reconnect callback from lifecycle:
  - re-run the same metadata rebuild + cache write path for that server only.
- If resources are unsupported or empty, preserve existing cached resources only when the config hash still matches and the server returned none.

## 5) Auth precondition handling for OAuth/bearer servers
- `supportsOAuth(definition)` gates the OAuth path.
- For OAuth servers:
  - if `connect()` hits `UnauthorizedError`, return `needs-auth` instead of throwing.
  - do not attempt SSE fallback after an auth failure on HTTP servers.
  - reconnect should short-circuit to auth-required state until tokens exist.
- For bearer servers:
  - add the Authorization header before transport creation.
  - treat missing bearer token / env token as not connectable or auth-not-ready.
- Keep the auth decision at transport creation time so the manager API can stay simple.

## 6) Biggest gotchas
- Concurrent connect dedupe matters: reconnect checks can overlap with lazy connect or user-triggered actions.
- Cache writes are merged by file, so a reconnect slice should only update the one server entry it owns.
- Tool/resource counts are derived from live discovery, not config alone; reconnect must rebuild metadata from the live client.
- OAuth failures are semantically different from transport failures; don’t collapse them into a generic connect error.
- `keep-alive` health checks may reconnect servers that are already being connected elsewhere.
- Snapshot counts in the plugin UI come from the metadata cache, so refreshing in-memory metadata alone is not enough.
- Be careful not to expand scope into CRUD or config editing; the next slice is just real connect/reconnect plus metadata refresh.
