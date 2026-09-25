# Design

## Context

See `proposal.md` for the reasons. This section gives the current state that shapes the approach. `P` is `plugins/sero-mcp-plugin` and `D` is `apps/desktop`.

- **Client.** `P/extension/manager/server-manager.ts` creates a v1 `Client` with no options. So it declares no client capabilities and registers no request or notification handlers. It uses stdio, Streamable HTTP, and SSE as a fallback after any Streamable HTTP error. The SSE path gets no `authProvider`. No request timeouts are set, and there are no `onclose` handlers.
- **Runtime.** `getMcpRuntime()` is a process-wide singleton. The plugin's Pi extension (`P/extension/index.ts`) connects it to each session through `session_start`, `session_shutdown` and `before_agent_start`. Every runtime operation, including tool calls, runs in one `runExclusive` queue (`mcp-runtime.ts:79-89`). A tool call that waits for the user would block all MCP work.
- **Agent surface.** The `mcp` tool is bridged to `sero-cli` (`sero mcp …`). `mcp_manager` is a direct tool that the MCP app UI also uses. The `details` of a bridged tool result pass through `schema-bridge.ts` and `cli/core/tool.ts` into `ChatToolCallMessage.details` in the renderer.
- **Metadata cache.** `$SERO_HOME/apps/mcp/metadata-cache.json` is keyed by server name and a config hash. It is per profile only because `$SERO_HOME` is per profile. It has no auth principal and no TTL. `D/electron/features/agent-plugins/cli.ts` reads it directly.
- **OAuth.** `McpOAuthProvider` stores `tokens.json`, `client.json` and `flow.json` under `$PI_CODING_AGENT_DIR/mcp-oauth/<server>/`, keyed by server name and a `serverUrl` check. It stores no issuer and no discovery state. `completeAuth` calls `finishAuth(code)`.
- **MCP Apps.** A loopback HTTP server (`P/extension/viewer/ui-server.ts`) serves a hand-written host shell (`host-template.ts`) and the app HTML, and allows only one session at a time. The shell never sends `tool-result`. `ui/message` and `ui/update-model-context` are accepted and then dropped. `tools/list` is not filtered. When the resource has no CSP metadata, the app gets no CSP. Apps render only in the MCP app pane. The chat has no plugin hook for custom tool-result UI.
- **User input.** The desktop already has a question and questionnaire surface on the global `__seroUserFeedbackBus` (`packages/common/src/user-feedback.ts`, `PendingQuestionCard.tsx`). Its questions support options, multi-select and free text (`allowOther`). `requestChoice` shows that when no renderer listens, `listenerCount === 0`.
- **Skills.** Pi skills are file based. Sero composes them through `skillsOverride` hooks, for example `withAgentPluginSkills`. A Pi `Skill` needs a `filePath`, so a lazy remote skill does not fit that model without a fetch ahead of need.
- **File size.** `mcp-runtime.ts` (496 lines) and `runtime-proxy.ts` (482 lines) are at the 500-line limit.
- **Plugin rules.** [`.agents/skills/sero-plugin/SKILL.md`](../../../.agents/skills/sero-plugin/SKILL.md) applies to all plugin work in this change:
  - `extension/` stays Pi-CLI safe.
  - Plugin-specific logic and types stay in the plugin (`shared/`). Only neutral cross-plugin contracts go to `@sero-ai/common`.
  - A plugin never gets a plugin-specific host bridge or IPC channel. The UI reaches plugin logic through plugin tools (`useAppTools`), and a new host seam must be a host-defined extension point or tool metadata.
  - State is JSON and written atomically.
- **Extension points.** Component contributions are typed in `packages/common/src/app-contributions.ts` and validated in `D/electron/features/apps/discovery/contributions.ts`. The renderer mounts them with `FederatedContributionMount`, which passes no per-mount props today. No extension point exists for the conversation.
- **CLI timeout.** The desktop exempts only a hard-coded set of tools (`question`, `questionnaire`, `interview`) from the CLI bridge timeout (`INTERACTIVE_TOOLS` in `D/electron/cli/index.ts`). A tool's `cli` metadata (`CustomToolCliBridge`) has no interactive flag.
- **SDK v2.** The v2 client (`@modelcontextprotocol/client` 2.1.0) implements the probe and its policy, the per-request envelope, the SEP-2243 headers, per-request cancellation, MRTR auto-fulfilment through the registered `elicitation/create` handler, the response cache (`cachePartition`), `subscriptions/listen` behind `listChanged`, and the OAuth opt-ins (`finishAuth(URLSearchParams)`, issuer stamps, `discoveryState()`, `clientMetadataUrl`, `onInsufficientScope`). `@modelcontextprotocol/ext-apps` 2.x needs the v2 SDK as a peer and keeps the 1.x wire protocol. `@modelcontextprotocol/ext-tasks` 0.1.0 gives task sessions with `serializeReference()`, `handoff()` and `resumeTask()`. No npm package exists for Skills. The stable spec is `specification/stable/skills.mdx` in `modelcontextprotocol/experimental-ext-skills` (SEP-2640, Final).

## Goals / Non-Goals

**Goals:**
- Use the SDK's behavior for the protocol mechanics. Sero code only configures the SDK and adds host policy: user interaction, storage, identity and UI.
- Keep one path for each concern: one elicitation handler for both eras and for task input, one cache partition identity, and one viewer server for inline and manual apps.
- Land the work in reviewable slices (see Migration Plan).

**Non-Goals:**
- Sero does not become a general MCP server.
- No Sampling or Roots support, and no `logging/setLevel`.
- No disk cache for remote skill files. Only an in-memory cache is kept, because the spec says hosts SHOULD cache, not MUST.
- The unused `@modelcontextprotocol/sdk` declaration in `plugins/sero-web-plugin` stays. It has no source imports, and removing it is an unrelated edit.
- No new desktop IPC channels and no MCP-specific desktop code. The host gets two neutral seams only (D3, D6). Everything else uses plugin tools (`useAppTools`, `window.sero.appAgent.invokeTool`) and the user-feedback bus.
- No resource templates, prompts UI or completion support beyond what the cache rules need.

## Decisions

### D1. Replace the SDK with v2 packages and configure the client once
Run the official codemod (`npx @modelcontextprotocol/codemod v1-to-v2`) in `P`, then fix what it marks. Dependencies: add `@modelcontextprotocol/client`. Add `@modelcontextprotocol/core` only if Sero imports a `*Schema` constant. Remove `@modelcontextprotocol/sdk`. Upgrade `@modelcontextprotocol/ext-apps` to `^2.0.1`. The e2e fixture needs `@modelcontextprotocol/server` and `@modelcontextprotocol/node` in `P` `devDependencies`, because the fixture resolves the SDK from the plugin's `package.json`. The workspace `zod` catalog (`^4.4.3`) already satisfies `^4.2.0`.

One factory, `createMcpClient(serverName, features)`, builds every `Client` (connection, OAuth coordinator):
- `versionNegotiation: { mode: 'auto', probe: { timeoutMs: 10_000 } }`
- `capabilities.elicitation: { form: {}, url: {} }`, added together with the elicitation handler (D3). The extension capabilities for Apps, Tasks and Skills are added only when their host feature flag in `MCP_CLIENT_FEATURES` is on. Each flag turns on in the task group that finishes its host path (8, 9 and 10). This keeps the "advertise only when ready" rule in one place.
- `inputRequired: { maxRounds: 10 }`, `cachePartition: principalId` (D4), `listChanged` handlers (D4)
- One `elicitation/create` handler (D3)

After `connect()`, record `getProtocolEra()`, `getNegotiatedProtocolVersion()`, the server extensions (from `getServerCapabilities()`), and `getServerVersion()` on `ManagedConnection`.

Alternative considered: stay on v1 and add the 2026 wire by hand. This was rejected. The issue forbids duplicated wire types, and v1 cannot negotiate eras.

### D2. Transports and failure phase
Stdio and Streamable HTTP work as they do now. The v2 stdio transport probes on a separate short-lived process. SSE stays only as a compatibility fallback. It is used only when Streamable HTTP answers `404` or `405`, or when the Agent Plugin source sets `portableTransport: 'sse'`, and it now receives the `authProvider`. Then the connection is marked `deprecatedTransport: true`. The setup UI already offers only stdio and HTTP, so no UI option needs to be removed. The connection flow records a `failurePhase` (`discovery | legacy-fallback | auth | extension | app | task | skill`) from the step that threw. `SdkError` codes such as `EraNegotiationFailed`, `ClientHttpAuthentication` and `RequestTimeout` map to the phase. The agent-visible error text stays short.

### D3. One elicitation handler, rendered by the existing questionnaire UI
The SDK sends both modern `input_required` rounds and legacy server-to-client `elicitation/create` requests through the one registered `elicitation/create` handler. The handler converts the request to a `UserFeedbackPendingQuestion` of type `questionnaire` on the global bus:
- Each form property becomes one question. An enum becomes options, with `multiSelect` for array enums. A boolean becomes Yes and No. A string, number or integer becomes free text (`allowOther: true`, no options).
- The first question has an exclusive **Decline** option. A bus `cancelled` response means **cancel**.
- `context.source` is `MCP · <server label> · <tool or task>`. All server text goes into plain-text `label` and `prompt` fields.
- Answers are coerced to the schema types and checked in the plugin. When a value fails, the handler asks again once and then declines. A form with an unsupported field type is declined without being shown, and the user gets a notice with the reason.
- URL mode is one question with **Open** and **Decline**. It shows the full URL. **Open** opens the URL through the host's external-link path.
- When the bus has no listener (headless session), the handler declines at once.
- A `questionnaire` opens the User Feedback app, and the host returns to the previous app after the answer. The `QuestionnaireForm` does not show `context.source` today, so it gets one source line under its title. This is a general change in the user-feedback plugin, not MCP code.

The server, tool and session context for the question comes from an `AsyncLocalStorage` scope that is set around each tool call, read and task input.

Pi-CLI safety: the bus comes from `@sero-ai/common`, which the extension already imports. Under the plain Pi CLI no listener exists, so input requests are declined and approval prompts (D6, D8) are denied. Nothing in `extension/` imports desktop code.

Alternative considered: a new JSON-schema form renderer in the desktop. This was rejected, because it adds four IPC and UI layers for field types that the questionnaire already covers.

Tool calls and reads move out of the `runExclusive` queue after `ensureConnectedServer` finishes. Otherwise a pending question would block all MCP work. Connection changes stay in the queue. To keep the CLI bridge timeout from ending a call while the user answers, `CustomToolCliBridge` gets an optional `interactive: boolean` flag. `bridgeTool()` honors it next to the existing `INTERACTIVE_TOOLS` set, and the `mcp` tool sets it in its own `cli` metadata. The host does not name the plugin. Each MCP request keeps its own SDK timeout, and each round is a new request.

### D4. Cache identity and TTL
- **Principal ID.** Each server connection has a `principalId`. It is `anon` for no auth. For bearer auth it is `bearer:<sha256(token)>`, and the token itself is never stored. For OAuth it is a random ID that is created when a new authorization completes, stored in `tokens.json`, and removed on sign-out. The ID is passed as the SDK `cachePartition`. The SDK then applies `ttlMs` and `cacheScope` to the in-memory response cache.
- **Persisted metadata cache.** `metadata-cache.json` keeps its role as the last known inventory for offline display and for Agent Plugin CLI generation. It moves to `version: 2` and adds `principalId`, `cacheScope` and `expiresAt` to each entry. Tool and resource fields keep their shape, so the reader in `agent-plugins/cli.ts` needs only a version check. A private entry is ignored when its `principalId` differs from the current one. An expired entry is shown as stale and is re-listed on the next use of a connected server.
- **Invalidation.** `listChanged` handlers, which the SDK maps to `subscriptions/listen` on the modern era, invalidate the entry and refresh the snapshot. Sign-out, server removal and config-hash changes remove entries as they do now. Persisted server order is sorted by server name.

### D5. OAuth conformance through SDK opt-ins
- `McpOAuthProvider` stores the objects that it receives from `saveTokens` and `saveClientInformation` field for field, including `issuer`. It returns them unchanged.
- It adds `saveDiscoveryState()` and `discoveryState()`, stored in `discovery.json` next to `flow.json`.
- `completeAuth` checks `state`, then calls `finishAuth(new URL(callbackUrl).searchParams)` so that the SDK reads `iss`. On `IssuerMismatchError`, the UI shows a fixed message and never the callback's `error*` values.
- Tokens that were stored without an issuer continue to work, and the SDK stamps them again.
- `clientMetadataUrl` is read from one constant. While that constant is unset, the flow uses DCR. The SDK already derives `application_type: 'native'` from the loopback redirect URI, and a test checks this.
- `onInsufficientScope` stays `'reauthorize'`.
- Token endpoint TLS is enforced by the SDK and needs no Sero code.

### D6. MCP Apps: one viewer server, the official bridge, inline in chat
- **Viewer server.** `ui-server.ts` holds a map of sessions keyed by a random token, with a limit on concurrent sessions and teardown on close. It no longer holds one global session. The loopback origin (`127.0.0.1:<random port>`) is separate from the Sero UI origin. The app frame keeps `sandbox` without `allow-same-origin`.
- **Host shell.** The hand-written bridge in `host-template.ts` is replaced by a small TypeScript entry that uses `AppBridge` and `PostMessageTransport` from `@modelcontextprotocol/ext-apps/app-bridge`. The plugin's Vite build bundles it, and `ui-server.ts` serves it. The shell sends `tool-input` and `tool-result`. It forwards `ui/message` and `ui/update-model-context` to the runtime, which delivers them into the owning session with `pi.sendMessage` and labels them with the app and server. It declares only the capabilities that Sero implements.
- **App tool calls.** The proxy checks the owning server and filters `tools/list` to tools whose `_meta.ui.visibility` includes `app` and that are not in `excludeTools`. `tools/call` accepts only those tools.
- **CSP and permissions.** When the resource declares no CSP domains, the app gets a default-deny CSP (no network). Requested permissions (the `allow` attribute) are granted only after a per-app choice on the bus. Links open only after the user confirms.
- **Inline in chat, through a new host extension point.** The host adds a component extension point `ui.chat.tool-result`:
  - A tool result opts in with a neutral marker in its `details`: `seroToolResultView: { appId, contributionId }`. The marker type lives in `@sero-ai/common` next to the other contribution types, and that package gets a version bump.
  - The host validates the contribution in `contributions.ts` like the other points. The tool-call detail view in `D/src/components/layout/tool-call-helpers/` mounts the matching contribution with `FederatedContributionMount`, which gets an optional `componentProps` pass-through: `{ sessionId, toolCallId, details, isError }`. When no contribution matches, or the mount fails, the host shows the normal tool result only.
- **MCP side.** `call_tool` adds the marker and a plugin-owned `details.mcpApp = { serverName, toolName, uiResourceUri, arguments, result }` (type in `P/shared/types.ts`). The result is capped at 256 KB. Above the cap, `result` is left out and the app gets only the input. The MCP plugin exposes an `McpToolResultApp` federated component for the point. The component calls `mcp_manager` `open_tool_ui` through `useAppTools()` with `{ …, sessionId, toolCallId }` to get a viewer URL, and renders the sandboxed iframe or a fallback line with the reason. Viewer URLs are never persisted. After a restart, the component asks for a new session from the stored `details`.

Alternative considered: an MCP-specific renderer and an `McpAppToolResultDetails` contract in the desktop. This was rejected because it breaks the plugin host-ownership rule. The extension point is the pattern the host already uses for plugin UI in host surfaces, and another plugin can use it later.

### D7. Tasks through `ext-tasks`, with Sero-owned durable records
- **Task session.** Each connection whose server declares the Tasks extension gets a task session, `createTaskSessionFromClient(client, { endpointId })`. The `endpointId` is `createTaskSessionEndpointId('sero-mcp', { serverName, configHash, principalId })`. `call_tool` uses `session.callTool(name, args, { task: { preference: 'allow' } })`.
- **Immediate result.** The call works as it does now.
- **Task result.** The runtime saves a `TaskRecord` in `$SERO_HOME/apps/mcp/tasks.json` through the existing atomic state writer. The record holds `reference` (from `serializeReference()`), `serverName`, `principalId`, `originSessionId`, `toolCallId`, `toolName`, `status`, `retentionMs`, `createdAt`, `nextPollAt` and `lastError`. The runtime then calls `handoff()`. The `mcp` call returns at once with the task ID and the `sero mcp task status|wait|cancel <id>` commands.
- **Task tracker.** A tracker in the runtime drives each record with `resumeTask(reference)` and `settle({ onEvent })`. The poll interval is `max(suggestedPollIntervalMs, 1000)`. On the modern era, the tracker opens a `subscriptions/listen` stream for task status when the server offers it. When the stream closes, polling continues.
- **Task input.** Task input uses the D3 handler through the ext-tasks application input callbacks, and the answers go back with `update()`.
- **Start and connection loss.** On runtime start, the tracker loads the records and resumes those whose `principalId` matches the current one. Records that do not match are marked `blocked-principal`. Records whose retention has ended are marked `expired` and pruned. A lost connection sets the status `disconnected` and a retry backoff. The record is not removed.
- **Delivery.** On completion, the final outcome goes to the originating session through that session's `pi.sendMessage` when the session is live. Otherwise it stays on the record until the session opens again, or until the user takes it from the MCP app's Tasks panel.

Alternative considered: implement `tasks/get` polling on raw requests. This was rejected, because it duplicates the official extension package.

### D8. Skills over MCP through the `mcp` dispatcher, not the Pi skill registry
- **Discovery.** Remote skills are discovered only when the server declares `io.modelcontextprotocol/skills`. Sero uses `client.request({ method: 'skills/list' | 'skills/get' | 'resources/directory/read' }, schema)`. The schemas are small local zod schemas for the extension's result shapes. No SDK package exists for Skills, so this is the one justified exception to "no duplicated wire types". The exception is commented.
- **Registry.** A per-server registry is keyed by (server label, URI). It lives in memory and is persisted in `$SERO_HOME/apps/mcp/skills.json`. The file holds enablement, the last refresh time, and content-bound approvals keyed by (label, URI, manifest digest).
- **Model exposure.** `before_agent_start` adds a "Remote MCP skills" block with the name, description and server label of each enabled skill. The model loads a skill with `sero mcp skill load <server> <name|uri>` and reads a supporting file with `sero mcp skill read <server> <skill> <path>`. `sero mcp skill ls` is available only when the server declares `directoryRead`. Remote skills never enter Pi's skill list, so they cannot shadow a local or Agent Plugin skill. The per-server namespace is part of the command address.
- **Load.**
  1. Check the listed size limits.
  2. `resources/read` the `SKILL.md`.
  3. Check the size and the digest.
  4. Parse the frontmatter with the same Pi `parseFrontmatter` and Agent Skills name rules as local skills.
  5. Compare the frontmatter field by field with the entry.
  6. Return the content wrapped in a block that names the server label and URI.
  7. Mark the session as "acting on remote skill X".

  Reads are allowed only for URIs in the held entry's manifest and on the same server. A cross-server read is refused, which is stricter than the spec's approval gate.
- **Code-execution gate.** The plugin's `pi.on('tool_call')` hook blocks `bash` and `run_code` in a session that acts on a remote skill, unless an approval exists for that skill's current manifest. When no approval exists, the hook asks the user on the bus with **Allow for this skill** or **Deny**. The skill's `allowed-tools`, hooks and script fields are never interpreted.
- **Refresh.** Refresh runs on connect, on `list_changed`, and on a manual refresh. A skill that disappears is checked with `skills/get`, then removed. A changed manifest removes the approval and marks the skill as changed.

Alternative considered: materialize `SKILL.md` files into a cache folder and add them through `skillsOverride`. This was rejected. It fetches content ahead of need, which the spec forbids, and it makes remote skills look like local files.

### D9. Diagnostics and state shape
`McpServerSnapshot` adds `protocol: { era, version, extensions, deprecatedTransport } | null`, `failurePhase: … | null`, and `cache: { state: 'fresh' | 'stale' | 'none', expiresAt }`. `McpAppState` adds `tasks` and `remoteSkills` summaries. `McpServerDetailPanel` shows them. New UI panels (Tasks, Remote skills) go into new files. `mcp-runtime.ts` and `runtime-proxy.ts` are split before new actions are added (task, skill and cache actions go into their own `runtime-*.ts` modules), so that each file stays under 500 lines.

### D10. Prototype before production UI
The change adds or alters these user-facing surfaces:
- the inline app in a tool call, with its fallback and permission consent
- how an MCP input request looks in the question UI, over two rounds, with decline
- the task status message in chat and the MCP app's Tasks panel
- the Remote skills panel and the code-execution approval prompt
- the protocol diagnostics on the server detail view

Before production UI work starts, one interactive prototype, `apps/styleguide/public/prototypes/mcp-2026-07-28/`, shows these surfaces. It follows [`.agents/skills/sero-prototype/SKILL.md`](../../../.agents/skills/sero-prototype/SKILL.md) and is linked from `PrototypeArchive.tsx`. It starts from `tool-call-group-expanded.html` and `sero-agent-plugins-integration.html` and checks them against the current components. It also shows the product defaults that the user must confirm: remote skills disabled by default, input declined in headless sessions, and task delivery without a new turn. Production UI tasks (3.7, and the UI tasks in groups 8, 9 and 10 of `tasks.md`) follow the approved prototype. The protocol, cache and OAuth work has no UI dependency and can go in parallel.

UI rules for the prototype and for the production UI:
- Cards can nest one level: a card may hold cards, but those inner cards hold no more cards. Use the inner level only where it groups content, for example the details of an opened row.
- No labels, subheadings or descriptions that repeat what the control or heading already shows. A default state (for example a verified skill) gets no badge; only an exception gets one.
- Explanations are one short sentence and appear only where the user must act or where something failed.
- Where the current surface already has this clutter and the change touches it, simplify it.

### D11. Test fixtures
`D/e2e/fixtures/test-mcp-server/` gets:
- one server factory served in modern and legacy mode through `serveStdio` (both eras), with a `--legacy` flag that uses a plain `StdioServerTransport` (2025 only)
- the same factory over HTTP through `createMcpHandler` and `toNodeHandler`

The factory adds:
- a two-round `inputRequired` tool
- an ext-apps tool and `ui://` resource registered with `@modelcontextprotocol/ext-apps/server` helpers, with one app that calls a tool and one that declares a CSP domain and a permission
- a task-returning tool
- a skills-extension handler with one skill and one supporting file

Plugin unit tests use the in-process `createMcpHandler` fetch pattern from the SDK guide.

## Risks / Trade-offs

- [Codemod gaps and v2 behavior changes (list auto-pagination, empty lists without a capability, lazy output-schema validation)] → Remove the hand-written pagination in `fetchAllTools` and `fetchAllResources`. Run the existing plugin tests and `mcp.contract.spec.ts` after the SDK swap, before any feature work.
- [Stdio probe delay for legacy servers that ignore unknown requests (up to 10 s per connect)] → Persist the era verdict for each server and config hash, and connect with `prior: { kind: 'legacy' }` the next time. Drop the verdict when the config changes or a manual reconnect happens. When the verdict is stale, the SDK succeeds silently against an upgraded server. The detail view shows "legacy (cached)", and a manual reconnect probes again.
- [Questionnaire UI limits (no field-level validation or ranges)] → Validate in the plugin and ask again once. If this is not good enough, a dedicated form renderer can come later.
- [Leaving `runExclusive` for calls could race with reconnect] → Take a connection snapshot for each call. A reconnect closes the old client, and in-flight calls fail with a clear "server reconnected" error.
- [`details.mcpApp` makes session files larger] → The 256 KB cap. Above it, only the input is kept.
- [`ext-tasks` is 0.1.0 and can change] → Pin the exact version. All use goes through one adapter module.
- [Skills spec behavior is strict (digests, acting window)] → Refuse whenever in doubt, and state the reason to the user as the spec requires.
- [Blocking `bash` in a session that acts on a remote skill can surprise users] → The prompt names the skill and server. The approval lasts for that manifest.

## Migration Plan

This change lands as a sequence of pull requests. Each one passes `pnpm typecheck`, the plugin tests and the MCP e2e specs.
0. Prototype (task group 1). This pull request adds only the styleguide prototype. The UI slices below wait for its approval.
1. Protocol slice: SDK v2 swap and negotiation, diagnostics, elicitation, cache and OAuth (task groups 2–7). After this step, existing servers work as before and modern servers connect. Only task 3.7 waits for the prototype.
2. MCP Apps (task group 8).
3. Tasks (task group 9).
4. Skills (task group 10), followed by the integration check (task group 11).

Each slice includes its own tests and documentation.

Stored data migrates forward only when it is read: the `metadata-cache.json` version increases to 2 and the old file is treated as stale, and tokens without an issuer are stamped again. The new files are `tasks.json`, `skills.json` and `discovery.json`. To roll back, revert the pull request. The old version ignores the new files and rebuilds the cache.

## Prototype review

On 2026-09-25 the user approved the prototype (`apps/styleguide/public/prototypes/mcp-2026-07-28/`, commit `c3a1042`). The approval covers the defaults that the prototype asked about:
- Remote skills start off.
- With no person to answer (a headless session or the plain Pi CLI), Sero declines a server input request at once.
- A task result goes into its chat without a new agent turn.

The production UI tasks (3.7, 4.7, 8.7, 8.8, 9.7 and 10.6) follow the prototype and the UI rules in D10.

## Open Questions

- Sero does not publish a Client ID Metadata Document yet. Hosting one needs a stable HTTPS URL that Sero owns. Until that exists, the constant stays unset and DCR is used. The design does not change when the URL is added.
- Should the official `ext-apps` and `ext-tasks` example servers be added to CI next to the fixture? This depends on whether they are published in a form that can run offline.
