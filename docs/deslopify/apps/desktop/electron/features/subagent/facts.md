# Facts — apps/desktop/electron/features/subagent

_Last reviewed: 2026-04-12_

## What this code does
This feature is Sero's AD-021 subagent runtime. It discovers markdown-defined agents from `SERO_AGENT_DIR`, resolves per-run model/thinking/timeout config, enforces concurrency limits, creates transient child `AgentSession`s, tracks live status/tool activity for the renderer, and exposes the `subagent` / `create_agent` tools to parent sessions.

## Shape & metrics
- Total files: 10
- Largest file: `apps/desktop/electron/features/subagent/index.ts` (491 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): `apps/desktop/electron/features/subagent/index.ts` (491)
- External dependencies of note: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`, TypeBox, container tools, shared infra/model registry, `SERO_AGENT_DIR`
- Upstream callers: `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/features/apps/extensions/create-sero-extension.ts`, kanban implementation/planning/review executors, IPC subagent handlers, collaboration flows, subagent tests
- Downstream dependencies: child-session prompt construction, tracker snapshots/events in renderer UI, container/host coding tool selection, agent-definition authoring under `~/.sero-ui/agent/agents/`

## Architectural notes
- This feature is the main implementation of AD-021, so runtime behavior matters more than aesthetic cleanup: child sessions must stay isolated, non-recursive, and UI-observable.
- `index.ts` acts as a façade over discovery, pool, tracker, and runner, but it is already carrying duplicated execution logic for single/parallel/chain modes.
- The runner uses a reduced extension factory plus `skillsOverride`, not the full app extension stack, so comments and settings around blocked tools/extensions need to stay truthful.

## Runtime-sensitive surfaces
- Child-session creation and teardown must preserve tool visibility, container cwd handling, session disposal, and debug logging behavior.
- Tracker and pool behavior drive the renderer's snapshot + live-event model; abort paths that miss tracker updates will present stale or misleading status.
- Discovery and `create_agent` file format handling affect real user-authored agent definitions in `SERO_AGENT_DIR`; migrations need backward compatibility.

## Surprising discoveries
- `SubagentManager.abortAll()` aborts controllers in the pool but does not update the tracker, even though `abortOne()` does.
- The reduced extension-factory comments still promise `@ws:` path expansion, but the implementation only injects prompt blocks, provider logging, and notifications.
- The feature stores `tools`, `extensions`, and `blockedExtensions` policy fields, but the runtime never enforces them in the child-session loader.
- `runtime/runner.ts` still relies on a casted `createAgentSession()` call to smuggle the Sero-only `systemPromptSuffix` field through the SDK type surface.
