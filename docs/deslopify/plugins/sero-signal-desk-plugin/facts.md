# Facts — plugins/sero-signal-desk-plugin

_Last reviewed: 2026-05-03_

## What this code does
`plugins/sero-signal-desk-plugin/` is an external Sero plugin for an RSS-first intelligence desk. It ships a `signal_desk` Pi extension tool, shared RSS/parsing/clustering/state helpers, a federated React UI, prompt templates, a skill, and a workspace-scoped background runtime. The state file lives at `.sero/apps/signal-desk/state.json` and stores sources, watchlists, fetched articles, story clusters, briefings, saved insights, actions, refresh runs, settings, and UI selection state.

## Shape & metrics
- Total reviewed source/config/doc files: 30 (excluding `node_modules/`, `.git/`, `dist/`, and MF temp files)
- Total reviewed LOC: 3,697
- Largest files:
  - `ui/styles.css` (1,345 LOC)
  - `ui/SignalDeskApp.tsx` (729 LOC)
  - `extension/index.ts` (348 LOC)
- Files over 500 LOC:
  - `ui/styles.css` (1,345 LOC)
  - `ui/SignalDeskApp.tsx` (729 LOC)
- External dependencies of note:
  - Pi extension APIs (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`)
  - `@sero-ai/common` runtime contracts
  - `@sero-ai/app-runtime` declared for UI/runtime integration, though the current UI bypasses the hooks
  - `fast-xml-parser` for RSS/Atom parsing
  - Module Federation via `@module-federation/vite`
- Upstream callers / consumers of note:
  - Sero app discovery reads `sero.app` / `sero.plugin` from `package.json`
  - Module Federation loads `SignalDeskApp` from `./dist/ui/remoteEntry.js`
  - AD-020 manifest bridging exposes the `signal_desk` tool through `sero-cli`
  - The plugin UI calls `window.sero.appAgent.invokeTool(...)` for refresh/briefing flows and writes app state directly for many CRUD/status flows
- Downstream dependencies:
  - Workspace state at `.sero/apps/signal-desk/state.json`
  - External RSS/Atom feeds and Google News/Hacker News/GitHub release feed URLs
  - Clipboard APIs for OPML/export/copy actions
  - Sero agent prompt handoff for Kanban, reminders, memory, OPML import, and story summaries
- Test / validation surface:
  - `pnpm test` passed: 7 files, 30 tests
  - `pnpm typecheck` passed for UI, extension, and runtime tsconfigs
  - `pnpm build` passed and produced a production MF remote under `dist/ui/`
  - Existing tests cover shared parsing/clustering/source helpers, manifest shape, and state normalization; they do not cover `ui/SignalDeskApp.tsx`, extension state I/O failure modes, or background-runtime behavior

## Architectural notes
- The plugin gets the important packaging basics right: `keywords: ["pi-package"]`, relative production Vite `base: './'`, `devPort` aligned with Vite port `5178`, `pi.extensions` points at the extension, `sero.plugin.bridgeTools` includes `signal_desk`, and host capabilities declare `appAgent.invokeTool`, `tool.cli`, and `appRuntime.background`.
- The extension uses `pi.registerTool()` for the app tool, aligning with AD-020. It also registers a small prompt command for a briefing handoff.
- The UI intentionally avoids `@sero-ai/app-runtime` hooks and redeclares the Sero context / bridge types in `ui/SignalDeskApp.tsx`. `README.md` says this is to avoid duplicate-React hook crashes in external dev-plugin mode. That workaround keeps the app running, but it is now a local compatibility seam that can drift from `@sero-ai/app-runtime` contracts.
- Domain state ownership is split. The extension owns `add_source`, `remove_source`, `add_watchlist`, `remove_watchlist`, `refresh`, `briefing`, `save_insight`, `create_action`, and `mark`, but the UI directly mutates the same state file for source/watchlist/status/insight/action flows instead of consistently invoking the canonical tool.
- The background runtime currently only reconciles stuck `running` refresh runs and schedules a timer that does not execute refresh work.

## Runtime-sensitive surfaces
- State reads are behavior-sensitive. `extension/index.ts` currently treats every read/parse error as an empty default state; the next successful mutation can overwrite a malformed or unreadable state file.
- RSS refresh is network-facing and intentionally tolerant per source: individual feed failures are stored on the source and reflected in the `RefreshRun` record.
- Production MF loading depends on preserving `vite.config.ts` `base: './'`, `remoteEntry.js`, and the `./SignalDeskApp` exposure.
- The UI depends on `globalThis.__sero_app_context__` and `window.sero.*` rather than published app-runtime hooks. Any host bridge shape change can break this plugin without compiler help from `@sero-ai/app-runtime`.
- The no-op background timer is a runtime-truthfulness risk if `settings.refreshIntervalMinutes` is ever set by a tool, migration, or future UI control; users would expect scheduled refreshes, but no refresh is executed.

## Surprising discoveries
- `ui/SignalDeskApp.tsx` imports `dailyDigest` but never uses it; the package tsconfigs do not enable `noUnusedLocals`, so this passes typecheck.
- The UI uses `window.prompt(...)` for editing watchlists, sources, actions, and insights, which is out of step with Sero’s Radix/shadcn interaction language and makes validation hard to test.
- `removeSource` in the UI filters clusters against the old article list and does not recluster, while the extension `remove_source` action removes source references, deletes related articles, and reclusters. This is a concrete example of the split ownership already producing different state shapes.
- `runtime/index.ts` declares a refresh interval timer but the callback only contains comments. The manifest still asks for `appRuntime.background`, so the package pays for a background runtime without delivering scheduled refresh behavior yet.
- The package has a healthy shared-helper test suite for a new plugin, but the largest and riskiest files (`ui/SignalDeskApp.tsx`, `ui/styles.css`, and `extension/index.ts` state I/O) have little/no direct coverage.

## Post-fix snapshot — 2026-05-03

### Metrics after fixes
- Total reviewed source/config/doc files: 49 (was 30)
- Total reviewed LOC: 3,972 (was 3,697; increased because oversized files were split into explicit modules and state I/O tests were added)
- Largest file: `plugins/sero-signal-desk-plugin/extension/index.ts` (386 LOC)
- Former over-cap files:
  - `ui/SignalDeskApp.tsx` — 729 → 353 LOC
  - `ui/styles.css` — 1,345 → 12-line stylesheet entrypoint; largest imported CSS section is `ui/styles/panels-settings.css` at 291 LOC
- Files over 500 LOC: none (was `ui/styles.css`, `ui/SignalDeskApp.tsx`)
- Type escape hatches remaining: no `as any`, `as unknown`, `@ts-ignore`, or `@ts-expect-error` found in reviewed source; enum string casts in prompt-based Medium follow-up remain but are not `any` escape hatches

### What changed
- `ui/SignalDeskApp.tsx` is now a smaller class-shell that preserves the documented duplicate-React workaround while delegating UI rendering to focused components under `ui/components/`.
- `ui/styles.css` remains the single Module Federation stylesheet entrypoint but now imports section-owned CSS files under `ui/styles/`, keeping every CSS source file under the cap.
- `extension/state-io.ts` owns Signal Desk state reads/writes. Missing first-run state still defaults, but malformed/unreadable state now returns an explicit tool error and does not overwrite the existing file.
- The UI now routes domain mutations through `signal_desk` tool actions instead of local reducers: source/watchlist CRUD, article/cluster marking, insight/action updates, briefing persistence, and source removal all share extension semantics.
- `extension/index.ts` added `save_briefing`, `update_insight`, `delete_insight`, and `update_action`; `mark` now marks articles inside selected clusters so UI and tool cluster-status behavior match.
- `tests/state-io.test.ts` adds focused regression coverage for missing state, malformed state, and atomic writes.

### Still outstanding
- Medium: the app-runtime contract workaround is still local to `SignalDeskApp.tsx`; it should be isolated into a bridge/runtime module or revalidated against `@sero-ai/app-runtime` hooks in external dev-plugin mode.
- Medium: `runtime/index.ts` still advertises a scheduled refresh timer but does not execute refresh work.
- Medium: prompt-based editors remain and should be replaced with controlled plugin UI forms.
- Medium: direct UI/runtime tests for app-state watch/unwatch and tool invocation are still pending; this pass added state I/O coverage only.
