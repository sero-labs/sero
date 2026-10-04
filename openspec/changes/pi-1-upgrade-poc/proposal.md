## Why

Sero bundles Pi SDK 0.84.2. Pi 1.0.2 now ships Code Mode, nested tool execution, transcript-backed prompt and tool changes, and prompt-cache warming, and each one overlaps with code Sero wrote itself. Issue #594 asks for a bounded proof of concept that shows what the upgrade breaks and which native features can replace Sero code without losing a Sero capability. Dependabot already skips `@earendil-works/*` and waits for this migration.

This change covers candidates 1 to 5 of issue #594. Pi Durable (candidate 6) and Cloudflare-managed remote agents (candidate 7) are separate later changes.

## What Changes

This is an investigation. Its output is two draft pull requests with evidence, and a decision for each candidate. It does not approve a runtime migration.

- **Upgrade compatibility (candidate 1).** On a POC branch, move the four Pi packages from 0.84.2 to 1.0.2 and keep every custom Sero implementation. Fix what the upgrade breaks. The breaks already confirmed from the Pi 1.0.2 source are:
  - `AgentSession._baseSystemPrompt` no longer exists and `agent.state.systemPrompt` has no setter, so the context editor's prompt write throws.
  - `SessionManager` is the source of provider context, so the legacy checkpoint restore that assigns `agent.state.messages` has no effect on the next request.
  - Tool call arguments and tool result `details` must be JSON-compatible, and an extension tool with no parameter schema is rejected.
  - Custom provider stream functions receive a `TranscriptContext` and must read the prompt and tools from it.
  - Session files gain `system` message entries, `context_edit` entries and `usage` entries.
  - Cache warming is on by default (`"streaming"`). The POC sets it to `"off"` so that the upgrade adds no model requests.
- **Native Code Mode (candidate 2).** On a second, stacked branch, wire Pi's `codemode` tool into chat sessions in place of `run_code`, and compare the two on behaviour, tool restrictions, nested call events and start-up size. Build a working mockup in the chat that shows a script's inner tool calls inside its card as they occur.
- **Prompt and tool history (candidate 3).** Replace the private prompt write with a supported route as part of the upgrade, then assess branch-aware overrides, reload and resume, and cache effects.
- **MCP (candidate 4).** Keep the Sero MCP plugin. Prove that the upgraded build and native Code Mode run with no Pi MCP activation. Record, capability by capability, what Pi's MCP package could replace later.
- **Cache warming and related features (candidate 5).** Assess cache warming, virtual-model routing, the native classifier and image operations, and per-model compaction budgets against existing Sero code.
- **Deliverables.** A compatibility matrix, an adopt, retain or defer decision for each candidate, a list of Sero code that native Pi can remove, and one follow-up issue for each adopt decision. These go in the pull request descriptions and in a summary comment on issue #594.

Not in this change: Pi Durable, remote agents, replacement of the Sero MCP plugin, removal of `run_code` on `main`, and any change to external plugin repositories.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change sets `skip_specs: true`. The upgrade branch must keep the behaviour that the existing specs describe, so no requirement changes. The Code Mode experiment would change `programmatic-tool-calling` (tool name, TypeScript support, limits, result shape) if Sero adopts it. That delta belongs to the follow-up change that performs the replacement, after the decision.

## Impact

- Dependencies: the `@earendil-works/pi-*` catalog entries in `pnpm-workspace.yaml` and the Dependabot ignore entry. Pi 1.0.2 adds `pi-codemode`, `pi-mcp`, `chord`, `pi-telemetry` and `quickjs-wasi` as transitive packages.
- `apps/desktop/electron/ipc/agent/core/`: `sdk-private-adapter.ts`, `agent-context-overrides.ts`, `agent-checkpoint.ts`, `agent-prompt.ts`, `agent-subscription.ts`, `agent-session-open.ts`.
- `apps/desktop/electron/features/`: `code-mode/`, `tool-capture/bash-result-error-status.ts`, `subagent/runtime/`, `apps/extensions/create-sero-extension.ts`, `container/tools/`.
- `apps/desktop/electron/shared/`: `infra/ai-infra.ts` and the custom providers in `providers/`.
- `apps/agent-node` (Bun-compiled, uses `createAgentSessionServices` and the `pi-ai/bun-oauth` subpath).
- In-repo plugins that register tools or providers. The 14 plugin directories import Pi types.
- Packaging: `apps/desktop/scripts/build-release.sh` and `electron-builder.yml`. Native Code Mode loads a WASM file and a worker file from `node_modules`, which the asar archive may not serve.
- Published packages: `@sero-ai/common` and `@sero-ai/extension-runtime` import Pi types. If the POC changes their source, bump the version in the same pull request.
- External plugin repositories are read for an impact list only.
