# Proposal

## Why

The MCP `2026-07-28` revision changes how clients connect to servers. It adds `server/discover`, per-request capability envelopes, multi-round-trip requests (MRTR), cache hints and new authorization rules. Servers built for this revision will not work fully with Sero's current `@modelcontextprotocol/sdk` 1.x client. Also, MCP Apps, Tasks and Skills are now official extensions. Sero supports only part of MCP Apps and has no support for Tasks or Skills. Issue #359 tracks this work.

## What Changes

- Replace `@modelcontextprotocol/sdk` 1.x with the split v2 packages (`@modelcontextprotocol/client`, and `@modelcontextprotocol/core` where Sero needs schemas). Upgrade `@modelcontextprotocol/ext-apps` to 2.x, which needs the v2 SDK as a peer.
- Connect with `versionNegotiation: { mode: 'auto' }`. Prefer `2026-07-28` through `server/discover`. Fall back to the 2025 `initialize` handshake for legacy servers. Record the negotiated era, revision and extensions for each server.
- Answer `input_required` results (MRTR) and legacy `elicitation/create` requests through one Sero elicitation path that shows the owning server and tool, and supports more than one round, decline and cancel.
- Honor `ttlMs` and `cacheScope` on list and read results. Partition the cache by profile, server and auth principal. Revalidate expired entries instead of keeping metadata permanently.
- Adopt the v2 OAuth conformance duties: validate `iss` (RFC 9207) before code exchange, keep the issuer stamp on stored credentials, persist discovery state, and prefer Client ID Metadata Documents with DCR as fallback.
- Complete MCP Apps host support. Render an app inline for a tool call that the model starts, keep the manual viewer, restrict app tool calls to the owning server, and enforce sandbox, CSP and consent rules.
- Add MCP Tasks (`io.modelcontextprotocol/tasks`) through `@modelcontextprotocol/ext-tasks`. Persist task references so that tasks resume after Sero restarts. Route task input through the same elicitation path and show task status in the conversation and in the MCP app.
- Add Skills over MCP (`io.modelcontextprotocol/skills`, SEP-2640). Discover skills through `skills/list`, load them on demand with digest checks, keep them in a per-server namespace separate from local and Agent Plugin skills, and require approval before a remote skill can cause code to run.
- Show negotiated protocol, extensions, cache state, deprecated transport use and the failed phase on each server detail view.
- **BREAKING (setup only):** New server setup flows no longer offer the deprecated SSE transport. Saved SSE entries continue to connect through a documented compatibility path.

Assumption recorded from research: SEP-2640 became Final on 2026-09-13, after the issue was written. The issue asks to remove the experimental flag when the extension is stable. Thus this change targets the stable Skills specification and does not add an experimental flag.

## Capabilities

### New Capabilities

- `mcp-protocol-negotiation`: SDK v2 client, era negotiation with legacy fallback, per-request envelope and routing headers, transports, and per-server protocol diagnostics.
- `mcp-elicitation`: MRTR `input_required` handling and legacy elicitation requests, presented to the user with server and tool ownership, over one or more rounds.
- `mcp-metadata-cache`: TTL and scope aware caching of tool, prompt and resource metadata, partitioned by profile, server and auth principal.
- `mcp-oauth`: issuer validation, issuer-bound credentials, discovery state, client registration preference and safe failure on mix-up.
- `mcp-apps`: MCP Apps host behavior for model-initiated and manual tool calls, including the App Bridge surface, sandboxing and fallback.
- `mcp-tasks`: task-augmented tool calls, durable task records, polling, input, cancellation, expiry and recovery after restart.
- `mcp-skills`: discovery, on-demand loading, verification, namespacing, approval and refresh of skills that MCP servers serve.

### Modified Capabilities

None. No existing spec under `openspec/specs/` covers MCP.

## Impact

- `plugins/sero-mcp-plugin`: `package.json`, `extension/manager/`, `extension/runtime/`, `extension/auth/`, `extension/cache/`, `extension/viewer/`, `extension/tools/`, `extension/state/`, `shared/types.ts`, `ui/`, `README.md` and tests.
- Desktop host, with neutral seams only and no MCP-specific code: a new `ui.chat.tool-result` component extension point, so that a plugin can render UI for its own tool results in the conversation; and an `interactive` flag in a tool's `cli` metadata, so that a bridged tool that waits for the user is not ended by the CLI timeout.
- `@sero-ai/common`: the contribution type for the new extension point. This is a published package, so it gets a version bump.
- `apps/styleguide/public/prototypes/`: an interactive prototype of the new UI, for review before any production UI work.
- `apps/desktop/e2e/fixtures/test-mcp-server/`: a fixture that serves both eras and the three extensions.
- `apps/docs-site/docs/guide/mcp.md`: protocol negotiation, extensions, security and Skills.
- Dependencies: remove `@modelcontextprotocol/sdk`; add `@modelcontextprotocol/client`, `@modelcontextprotocol/core` (if schemas are needed), `@modelcontextprotocol/ext-tasks`; upgrade `@modelcontextprotocol/ext-apps` to 2.x. `zod` must satisfy `^4.2.0`.
- No other published npm package changes are expected.

## References

- Sero plugin rules (surfaces, Pi-safe extension, host ownership, CLI bridging, state, file limits): [`.agents/skills/sero-plugin/SKILL.md`](../../../.agents/skills/sero-plugin/SKILL.md), with [`references/api-and-widgets.md`](../../../.agents/skills/sero-plugin/references/api-and-widgets.md) and [`references/templates.md`](../../../.agents/skills/sero-plugin/references/templates.md).
- Host extension points: [`apps/docs-site/docs/reference/plugin-extension-points.md`](../../../apps/docs-site/docs/reference/plugin-extension-points.md).
- Prototype workflow for the UI changes: [`.agents/skills/sero-prototype/SKILL.md`](../../../.agents/skills/sero-prototype/SKILL.md).
- Issue: https://github.com/sero-labs/sero/issues/359.
- MCP TypeScript SDK v2 migration guides: [upgrade-to-v2.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md), [support-2026-07-28.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md).
- Skills extension specification (SEP-2640, Final): https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/specification/stable/skills.mdx.
