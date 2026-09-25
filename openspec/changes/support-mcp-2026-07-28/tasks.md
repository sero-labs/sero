# Tasks

## 1. Make room in the files at the size limit

- [ ] 1.1 Move the action handlers out of `P/extension/runtime/mcp-runtime.ts` into a `runtime-*.ts` module, and move the result formatting and argument parsing out of `P/extension/runtime/runtime-proxy.ts` into a `runtime-proxy-format.ts` module. Do not change behavior. Verify: both files are under 400 lines, `pnpm --filter @sero-ai/plugin-mcp test` passes, and `pnpm typecheck` passes.

## 2. SDK v2, era negotiation and diagnostics

- [ ] 2.1 Run `npx @modelcontextprotocol/codemod@latest v1-to-v2 .` in `plugins/sero-mcp-plugin`. Replace `@modelcontextprotocol/sdk` with `@modelcontextprotocol/client` (and `@modelcontextprotocol/core` only if a `*Schema` import remains). Upgrade `@modelcontextprotocol/ext-apps` to `^2.0.1`. Add `@modelcontextprotocol/server` and `@modelcontextprotocol/node` as `devDependencies` for the fixture, and run `pnpm install`. Verify: `grep -rn '@mcp-codemod-error\|@modelcontextprotocol/sdk' plugins/sero-mcp-plugin apps/desktop/e2e` finds nothing, and `pnpm typecheck` passes.
- [ ] 2.2 Remove the manual pagination in `fetchAllTools` and `fetchAllResources` (v2 aggregates pages), and remove v1-era casts on SDK types. Verify: `server-manager.test.ts` and `runtime-proxy.test.ts` pass.
- [ ] 2.3 Add `createMcpClient()` in `P/extension/manager/` with `versionNegotiation: { mode: 'auto', probe: { timeoutMs: 10_000 } }` and feature-flagged extension capabilities. Use it in `server-manager.ts` and `oauth-coordinator.ts`. Verify: a unit test asserts that `sampling` and `roots` are absent and that a disabled feature adds no extension capability.
- [ ] 2.4 Record `era`, `protocolVersion`, the server extensions, `serverVersion` and `deprecatedTransport` on `ManagedConnection`. Persist the legacy era verdict for each server and config hash, and use `prior: { kind: 'legacy' }` on the next connect. A manual reconnect or a config change drops the verdict. Verify: a unit test connects twice to a legacy fixture and asserts that the second connect sends no `server/discover`.
- [ ] 2.5 Limit the SSE fallback to a Streamable HTTP `404`/`405` or `portableTransport: 'sse'`, pass the `authProvider` to SSE, and set `deprecatedTransport`. Verify: a unit test asserts that a `500` on Streamable HTTP does not fall back to SSE and that a `405` falls back with the flag set.
- [ ] 2.6 Map connection errors to `failurePhase` (`discovery`, `legacy-fallback`, `auth`, `extension`) and add `protocol`, `failurePhase` and `cache` to `McpServerSnapshot` in `P/shared/types.ts` and `extension/state/snapshot.ts`. Verify: `state-snapshot.test.ts` covers a modern server, a legacy server and an auth failure.
- [ ] 2.7 Show the negotiated revision, extensions, deprecated transport warning and failure phase in `McpServerDetailPanel.tsx`. Verify: a UI test renders a modern server and an SSE server with the warning.
- [ ] 2.8 Rework `D/e2e/fixtures/test-mcp-server/` into one server factory. Serve it through `serveStdio` (both eras), through a `--legacy` mode with a plain `StdioServerTransport`, and through an HTTP entry with `createMcpHandler` and `toNodeHandler`. Verify: new `server-manager.test.ts` cases connect to each mode and assert era `modern` with `2026-07-28` for stdio and HTTP, and era `legacy` for `--legacy`.
- [ ] 2.9 Add a modern HTTP test that records request headers and asserts `MCP-Protocol-Version`, `Mcp-Method: tools/call`, `Mcp-Name: <tool>` and the `_meta` envelope. Add a test that cancels one of two in-flight calls and asserts that the other one completes. Verify: both tests pass.
- [ ] 2.10 Update `P/README.md` (transports, negotiation, diagnostics) and `apps/docs-site/docs/guide/mcp.md` with a "Protocol versions" section. Verify: the docs name `2026-07-28`, the legacy fallback and the SSE deprecation, and `pnpm --filter docs-site build` passes if that script exists.
- [ ] 2.11 Run the existing MCP e2e specs (`mcp.contract.spec.ts`, and `mcp-agent.agent.spec.ts` when a model key is available) against the upgraded fixture. Verify: they pass, which shows that saved config, tool calls, resource reads, Agent Plugin servers and CLI commands still work.

## 3. Elicitation (MRTR and legacy)

- [ ] 3.1 Add `P/extension/elicitation/` with a mapping from an elicitation form schema to a `UserFeedbackPendingQuestion` questionnaire (enum, multi-enum, boolean, string, number, integer, a Decline option, plain-text labels) and back, with type coercion and checks. Verify: unit tests cover each field type, markup in labels, an unsupported type that is declined, and one re-ask after a bad value.
- [ ] 3.2 Register one `elicitation/create` handler in `createMcpClient()` that emits on the user-feedback bus. It reads server, tool and session context from an `AsyncLocalStorage` scope that is set around calls and reads, declines at once when the bus has no listener, and handles URL mode with Open and Decline. Set `inputRequired.maxRounds: 10`. Verify: a unit test with a fake bus answers a modern two-round tool, a legacy `elicitation/create`, a decline, a cancel (the call ends as cancelled) and a headless decline.
- [ ] 3.3 Run tool calls and resource reads outside `runExclusive` after `ensureConnectedServer`, with a connection snapshot for each call. Verify: a test shows that a status request completes while a call waits for input.
- [ ] 3.4 Add `mcp` to `INTERACTIVE_TOOLS` in `apps/desktop/electron/cli/index.ts`. Verify: the existing CLI bridge test asserts that `mcp` is timeout-exempt, and `pnpm typecheck` passes.
- [ ] 3.5 Add the two-round `inputRequired` tool to the fixture, and an e2e case in `mcp.contract.spec.ts` that answers both rounds through the question UI. Verify: the e2e case passes.
- [ ] 3.6 Document server input requests (what the user sees, decline and cancel) in `apps/docs-site/docs/guide/mcp.md`. Verify: the section is present and matches the e2e flow.

## 4. Metadata cache

- [ ] 4.1 Add `principalId` resolution (`anon`, `bearer:<sha256>`, and an OAuth random ID stored in `tokens.json`, created on a new authorization and removed on sign-out), and pass it as `cachePartition`. Verify: a unit test asserts that a new authorization changes the ID and that a bearer token is never written to disk.
- [ ] 4.2 Move `metadata-cache.json` to `version: 2` with `principalId`, `cacheScope` and `expiresAt` for each entry and sorted server order. Treat a version 1 file as stale. Update the reader in `apps/desktop/electron/features/agent-plugins/cli.ts` to accept version 2. Verify: `metadata-cache.test.ts` covers TTL expiry, a private entry with another principal being ignored, and stable order. The agent-plugins CLI test still generates commands.
- [ ] 4.3 Register `listChanged` handlers that invalidate the entry and refresh the snapshot. Remove private entries on sign-out. Verify: a fixture test sends `tools/list_changed` and asserts that the next list makes a request. A sign-out test asserts that the entries are removed.
- [ ] 4.4 Add a fixture test for `ttlMs`: a fresh entry makes no request, and an expired one makes a request. Verify: the test passes on the modern HTTP fixture.
- [ ] 4.5 Document cache behavior and isolation in `P/README.md` → Storage. Verify: the section names the partition keys.

## 5. OAuth conformance

- [ ] 5.1 Store tokens and client information from the SDK field for field, including `issuer`, and add `saveDiscoveryState()` and `discoveryState()` backed by `discovery.json`. Verify: a unit test round-trips an `issuer` stamp and a discovery state, and loads a pre-upgrade `tokens.json` with no issuer.
- [ ] 5.2 Make `completeAuth` check `state` and then call `finishAuth(searchParams)`. On `IssuerMismatchError`, show a fixed message and never the callback `error*` text. Verify: `oauth-coordinator.test.ts` covers a mismatched `iss` (no token request), a missing `iss` when it is required, and a wrong `state`.
- [ ] 5.3 Add the `clientMetadataUrl` constant (unset) and assert DCR metadata. Verify: a unit test with a mock authorization server asserts `application_type: "native"` in the registration body and no registration call when a configured client ID exists.
- [ ] 5.4 Add a test in which the authorization server changes after authorization. Verify: the stored tokens are not sent to the new server and the status becomes `needs-auth`.
- [ ] 5.5 Update `P/README.md` → OAuth behavior (issuer check, re-authorization after a server change, DCR fallback). Verify: the section is present.

## 6. Protocol slice check

- [ ] 6.1 Run `pnpm typecheck`, `pnpm --filter @sero-ai/plugin-mcp test` and the MCP e2e specs. Verify: all pass, and the result is noted in the pull request for groups 1–5.

## 7. MCP Apps

- [ ] 7.1 Change `ui-server.ts` to a session map keyed by token, with a concurrent session limit and teardown. Verify: `ui-server.test.ts` opens two sessions and closes one without affecting the other.
- [ ] 7.2 Replace the hand-written bridge in `host-template.ts` with a bundled host-shell entry that uses `AppBridge` and `PostMessageTransport` from `@modelcontextprotocol/ext-apps/app-bridge`, built by the plugin's Vite config and served by `ui-server.ts`. It sends `tool-input` and `tool-result` and declares only implemented host capabilities. Verify: `pnpm --filter @sero-ai/plugin-mcp build` emits the shell, and a jsdom test sees `ui/initialize` answered and `tool-result` delivered.
- [ ] 7.3 Restrict the app proxy: `tools/list` filtered by `_meta.ui.visibility` and `excludeTools`, and `tools/call` only to those tools on the owning server. Verify: `runtime-viewer.test.ts` asserts that a refused cross-server or hidden-tool call sends no request.
- [ ] 7.4 Apply a default-deny CSP when no domains are declared. Grant `allow` permissions only after a per-app bus choice. Open links only after confirmation. Accept messages only from the app frame. Verify: `ui-server.test.ts` covers the CSP header with and without domains and the permission denial. A shell test ignores a message from another window.
- [ ] 7.5 Deliver `ui/message` and `ui/update-model-context` to the owning session with `pi.sendMessage`, labeled with the app and server. Verify: a runtime test asserts that the message reaches the session registry with the label.
- [ ] 7.6 Add `McpAppToolResultDetails` and `isMcpAppToolResultDetails()` to `@sero-ai/common` and bump its version. Make `call_tool` attach `details.mcpApp`, with the result capped at 256 KB. Verify: `runtime-proxy.test.ts` asserts the details and the cap, and `pnpm typecheck` passes.
- [ ] 7.7 Add an inline app component under `apps/desktop/src/components/layout/shell/tool-call-helpers/` that detects `details.mcpApp`, asks `mcp_manager` `open_tool_ui` for a viewer URL through `window.sero.appAgent.invokeTool`, and renders the sandboxed iframe, or a fallback line with the reason. Verify: a renderer test covers the render path and the fallback. No viewer URL appears in persisted state.
- [ ] 7.8 Add the fixture apps (one that calls a tool, and one that declares a CSP domain and a permission) with `@modelcontextprotocol/ext-apps/server` helpers, and an e2e case: a model-initiated call renders inline, the app's approved tool call succeeds, and an unsupported app shows the fallback. Verify: the e2e case passes.
- [ ] 7.9 Document MCP Apps (inline rendering, isolation, permissions, fallback) in `apps/docs-site/docs/guide/mcp.md` and `P/README.md` → Interactive MCP UIs. Verify: the sections are present.

## 8. MCP Tasks

- [ ] 8.1 Add `@modelcontextprotocol/ext-tasks` at an exact version and one adapter module that builds a task session for each connection (with the endpoint ID from `serverName`, `configHash` and `principalId`) when the server declares Tasks and the feature flag is on. Verify: a unit test asserts no task session and no Tasks capability when the flag is off.
- [ ] 8.2 Add the `TaskRecord` store in `$SERO_HOME/apps/mcp/tasks.json` through the atomic state writer. Verify: a unit test round-trips records and prunes expired ones.
- [ ] 8.3 Route `call_tool` through the task session. Keep immediate results. For a task result, persist the record, call `handoff()`, and return the task ID and commands. Verify: `runtime-proxy.test.ts` covers the immediate and task outcomes.
- [ ] 8.4 Add the task tracker: resume records on start (principal guard), use `settle({ onEvent })` with a poll floor of 1 s, use `subscriptions/listen` when offered with polling as fallback, set `disconnected` with backoff on a lost connection, and deliver the outcome to the originating session with `pi.sendMessage`. Verify: fixture tests cover completion, failure, cancellation, input through the D3 handler and `update()`, expiry, a principal mismatch, a lost connection and a closed subscription stream.
- [ ] 8.5 Add a restart test: start a task, dispose the runtime, create a new runtime from the same state directory, and assert that the task completes and the outcome reaches the session registry. Verify: the test passes.
- [ ] 8.6 Add the `sero mcp task status|wait|cancel <id>` CLI actions and the `mcp_manager` `list_tasks`, `cancel_task`, `dismiss_task` and `task_result` actions. Verify: `proxy-tool.test.ts` parses the commands, and `manager-tool.test.ts` routes the actions.
- [ ] 8.7 Add a Tasks panel to the MCP app (server, tool, status, age, result, cancel, dismiss), in new files. Verify: a UI test renders running, completed and blocked-principal tasks.
- [ ] 8.8 Add a task tool to the fixture and an e2e case that starts a task, restarts the app, and sees the result. Verify: the e2e case passes.
- [ ] 8.9 Document Tasks (status, restart behavior, cancel, retention) in `apps/docs-site/docs/guide/mcp.md`. Verify: the section is present.

## 9. Skills over MCP

- [ ] 9.1 Add local zod schemas for the `skills/list`, `skills/get` and `resources/directory/read` results, with a comment that explains why (no SDK package), and a skills client that calls them only when the server declares `io.modelcontextprotocol/skills`. Verify: a unit test asserts that no call is made to a server without the extension and that a `skill://` resource is not listed as a skill.
- [ ] 9.2 Add the remote skill registry keyed by (server label, URI), persisted in `skills.json` with enablement (default disabled), last refresh and approvals keyed by manifest digest. Verify: unit tests cover same-name entries in one server, a removed skill (after a `skills/get` check), and a changed manifest that removes the approval.
- [ ] 9.3 Add the loader: size-limit check, `resources/read` of `SKILL.md` only on load, size and digest check, frontmatter parse with Pi `parseFrontmatter` and the Agent Skills name rules, a field-by-field compare, a tagged output block, reads limited to the manifest on the same server, and cross-server reads refused. Verify: unit tests cover a digest mismatch, a frontmatter mismatch, an unlisted file, a `"dynamic"` skill and a listing that fetches no content.
- [ ] 9.4 Add `sero mcp skill load|read|ls` (with `ls` only when `directoryRead` is declared) and the "Remote MCP skills" prompt block for enabled skills. Verify: `proxy-tool.test.ts` parses the commands, and a prompt test lists only enabled skills with their server labels.
- [ ] 9.5 Add the `pi.on('tool_call')` gate: in a session that acts on a remote skill, `bash` and `run_code` need an approval for that skill's current manifest. Ask with Allow or Deny on the bus. Verify: unit tests cover a blocked call, an approved call, and a revoked approval after a manifest change. A frontmatter `allowed-tools` value does not change the session tools.
- [ ] 9.6 Add a Remote skills panel to the MCP app (server, URI, trust state, enabled, last refresh, refresh action), in new files. Verify: a UI test renders enabled, disabled and changed skills.
- [ ] 9.7 Add a skills handler to the fixture and an e2e case: enable the skill, load it through `sero mcp skill load`, and read its supporting file. Verify: the e2e case passes.
- [ ] 9.8 Document Skills over MCP (SEP-2640 stable, namespacing, approval and security) in `apps/docs-site/docs/guide/mcp.md`. Verify: the section is present and names the extension ID.

## 10. Integration check

- [ ] 10.1 Run `pnpm typecheck`, `pnpm --filter @sero-ai/plugin-mcp test`, the affected desktop unit tests and all MCP e2e specs on the final branch. Check each acceptance criterion of issue #359 against a test or a documented manual check. Verify: all pass, and the criterion-to-test map is in the pull request description.
