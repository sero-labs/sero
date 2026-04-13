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
