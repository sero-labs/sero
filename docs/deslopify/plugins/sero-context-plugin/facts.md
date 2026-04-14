# Facts — plugins/sero-context-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-context-plugin/` adds three SessionManager-driven context tools (`context_tag`, `context_log`, `context_checkout`) plus a bundled skill that teaches the agent when to use them. The extension writes a workspace-scoped snapshot to `.sero/apps/context/state.json`, and the federated React UI renders that snapshot as a usage dashboard, linearized context graph, and quick-reference guide.

## Shape & metrics
- Total files: 16
- Largest file: `plugins/sero-context-plugin/extension/index.ts` (376 LOC)
- Files over 500 LOC: none
- External dependencies of note: `@sinclair/typebox`, `@sero-ai/app-runtime`, `@sero-ai/ui`, Module Federation/Vite runtime
- Upstream callers: Sero plugin discovery + Module Federation load the `ContextApp` remote; Pi session resource loading registers the three tools and `/context` command for each active session
- Downstream dependencies: `SessionManager` labels/branch summaries, workspace-scoped `.sero/apps/context/state.json`, bundled `skills/context-management/SKILL.md`

## Architectural notes
- The plugin is self-contained and does not currently depend on any desktop-only IPC bridge; all mutations happen inside the Pi extension via `SessionManager` and `pi.setLabel()` / `branchWithSummary()`.
- The UI consumes only app state via `useAppState()`; there is no canonical host/app action bridge for tag/checkout operations yet.
- The state file is workspace-scoped (`.sero/apps/context/state.json` under the resolved cwd) rather than profile-global.
- Production remote config is correct: `vite.config.ts` uses `base: './'` in production.
- The core projection logic is duplicated today: `extension/index.ts` builds the human-readable log, while `extension/snapshot.ts` rebuilds similar sequence/content/interesting-node logic for the UI snapshot.

## Runtime-sensitive surfaces
- Snapshot freshness is the key behavior seam: only the context tools currently write snapshots, so session history changes that do not pass through those tools do not reach the UI automatically.
- The plugin mutates session history via labels and `branchWithSummary()`; cleanup work must preserve the rule that checkout rewrites conversation history only, not disk files.
- UI actions are currently prompt-routed. Any cleanup here must either add a truthful execution path or make the indirection explicit in the UX copy.
- The bundled skill, README, and UI copy all teach the workflow; if behavior changes, those docs must stay aligned.

## Surprising discoveries
- The README says the UI renders the graph “in real time,” but the extension only writes snapshots after `context_tag`, `context_log`, and `context_checkout` execute.
- The timeline’s “Checkout here” and “Tag” affordances are not direct actions; they only send natural-language prompts to the agent.
- There are no files over the repo’s 500-LOC cap, but the package’s behavioral core still lives in one extension file plus a parallel snapshot builder, so drift risk is architectural rather than file-size-driven.

## Post-fix snapshot — 2026-04-13 (D3 partial)

### Metrics after fixes
- Largest file: `plugins/sero-context-plugin/extension/index.ts` (376 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: unchanged outside the still-pending snapshot/projection seams

### What changed
- Reworded the Context UI so refresh/tag/checkout affordances are explicitly prompt-routed agent requests.
- Removed the stale README/extension copy that claimed the graph updates “in real time”; the surface now describes the latest saved snapshot instead.
- Kept the plugin self-contained: no new desktop IPC bridge was introduced for this interim truthfulness fix.
- Package-local `typecheck` and monorepo `pnpm typecheck` still pass.

### Still outstanding
- The remaining High item is snapshot freshness / lifecycle truthfulness.
- Medium projection dedupe, extension typecheck expansion, and failure-surface work remain pending.

## Post-fix snapshot — 2026-04-14 (D4)

### Metrics after fixes
- Largest file: `plugins/sero-context-plugin/extension/index.ts` (388 LOC)
- Files over 500 LOC: none
- Targeted extension compile: `extension/index.ts` + `extension/snapshot.ts` + `extension/helpers.ts` now compile cleanly under strict standalone checks

### What changed
- The extension now writes a snapshot on session entry instead of waiting for `context_log` / `context_tag` / `context_checkout` to run first.
- Added an `agent_end` snapshot refresh so the UI reflects the latest saved session state after normal turns, not only after explicit context-tool use.
- Tightened the extension snapshot/log builders around nullable context-usage fields uncovered during targeted compile.
- Package-local UI `typecheck`, targeted extension compile, and monorepo `pnpm typecheck` still pass.

### Still outstanding
- High items are cleared for this plan.
- Medium projection dedupe, package-local extension quality gate, and failure-surface work remain pending.

## Post-fix snapshot — 2026-04-14 (E3)

### Metrics after fixes
- Total files: 14
- Largest file: `plugins/sero-context-plugin/extension/index.ts` (388 LOC)
- Files over 500 LOC: none
- Targeted validation: package-local UI + extension typecheck, package-local snapshot/helper tests, and monorepo `pnpm typecheck` all pass

### What changed
- Added a package-local extension tsconfig so `extension/`, `shared/`, and the focused tests now compile under the plugin’s own quality gate.
- Added focused tests for `resolveTargetId()`, hidden-node accounting, nearest-tag distance, and snapshot usage breakdown math.
- Kept the runtime behavior unchanged in this E3 batch; the remaining projection-dedupe work still lives in the later runtime batch.

### Still outstanding
- Shared projection extraction between `extension/index.ts` and `extension/snapshot.ts` is still pending.
- Failure-surface visibility for repeated snapshot write issues is still pending.

## Post-fix snapshot — 2026-04-14 (E4)

### Metrics after fixes
- Total files: 13
- Largest source file: `plugins/sero-context-plugin/extension/index.ts` (337 LOC)
- Files over 500 LOC: none
- Targeted validation: package-local tests, package-local typecheck, and monorepo `pnpm typecheck` all pass

### What changed
- Added `extension/context-projection.ts` as the single owner for branch-sequence expansion, entry-content extraction, interesting-node filtering, nearest-tag math, and assistant-tool-call parsing.
- Rebased both `extension/index.ts` and `extension/snapshot.ts` on the shared projection layer so `context_log` and the UI snapshot now interpret the same session graph the same way.
- Removed the local projection `any` walkers while keeping the current `context_log` / snapshot output shape intact.

### Still outstanding
- Low snapshot-write failure visibility is still pending.
