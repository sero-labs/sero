# Facts — apps/desktop/electron/features/subagent

_Last reviewed: 2026-04-16_

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

## Post-fix snapshot — 2026-04-12

### Metrics after fixes
- Total files: 10 (unchanged)
- Largest file: `apps/desktop/electron/features/subagent/index.ts` (492 LOC)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: 0 new High-priority escape hatches in the runner/tracker path

### What changed
- Bulk aborts now mark matching tracker entries aborted before the concurrency pool cancels controllers.
- Added a local Pi SDK module augmentation so `systemPromptSuffix` is typed without a cast, and removed the remaining `session!` assertion from runner debug logging.

### Still outstanding
- `index.ts` is still a near-cap façade and needs the shared single-run executor extraction from the Medium plan.
- Policy knobs (`tools`, `extensions`, `blockedExtensions`) are still stored without runtime enforcement.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 11 (was 10)
- Largest file: `apps/desktop/electron/features/subagent/runtime/runner.ts` (396 LOC)
- Files over 500 LOC: none (unchanged)
- Near-cap files (≥400 LOC): none (was `index.ts` at 492 LOC)
- Type escape hatches remaining: unchanged from prior pass; no new escape hatches introduced

### What changed
- Added `core/single-run.ts` as the shared single-run execution seam for resolve/configure/track/run/finalize flow.
- Reduced `SubagentManager` single-mode methods to thin wrappers over `executeSingleRun()` while preserving string vs structured return shapes.
- Dropped `apps/desktop/electron/features/subagent/index.ts` from 492 LOC to 333 LOC.

### Still outstanding
- Medium: decide whether `tools`/`extensions`/`blockedExtensions` should be enforced in runtime filtering or removed as unsupported knobs.
- Low: update `runtime/loader.ts` comments so reduced-extension behavior documentation matches the implementation.

## Post-fix snapshot — 2026-04-16 (policy cleanup pass)

### Metrics after fixes
- Total files: 11 (unchanged)
- Largest file: `apps/desktop/electron/features/subagent/runtime/runner.ts` (396 LOC)
- Files over 500 LOC: none (unchanged)
- Near-cap files (≥400 LOC): none (unchanged)
- Type escape hatches remaining: unchanged; no new escape hatches introduced

### What changed
- Deleted non-functional runtime policy fields from subagent core contracts and manager settings (`tools`, `extensions`, `blockedExtensions`).
- Discovery now warns when agent frontmatter includes unsupported `tools`/`extensions` fields and intentionally ignores them.
- Added focused discovery coverage to lock the ignored-field warnings and keep runtime contracts truthful.

### Still outstanding
- Low: `runtime/loader.ts` top-of-file behavior comments still mention `@ws:` path expansion and need to be aligned with the current reduced extension factory.
