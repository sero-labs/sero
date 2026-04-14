# Facts — plugins/sero-admin-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-admin-plugin/` is Sero’s global control-surface plugin. It exposes a UI-only admin app for browsing/editing profile config files, listing sessions, tailing host/remote logs, managing global agents/skills/prompts, configuring global model tiers, installing plugins, and linking plugin source roots into the active workspace for in-place plugin development.

## Shape & metrics
- Total reviewable files: 36
- Total reviewable LOC: 5,463
- Largest source file: `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts` (473 LOC)
- Files over 500 LOC: none
- Near-cap files (≥300 LOC):
  - `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts` (473)
  - `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` (372)
  - `plugins/sero-admin-plugin/ui/components/ConfigPanel.tsx` (371)
  - `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx` (349)
  - `plugins/sero-admin-plugin/ui/components/SessionDetail.tsx` (332)
  - `plugins/sero-admin-plugin/ui/components/TierModelPicker.tsx` (324)
  - `plugins/sero-admin-plugin/ui/components/LogViewer.tsx` (311)
  - `plugins/sero-admin-plugin/ui/AdminApp.tsx` (307)
- External dependencies of note:
  - `@sero-ai/app-runtime` for persisted app section state and workspace context
  - `@sero-ai/ui` for shared UI primitives and model-selection widgets
  - `@sero/common` for model-selection helpers, plugin metadata, and thinking-level contracts
  - `window.sero` host bridges for profiles, sessions, app-state file IO, auth, model config, plugin install/uninstall, and workspace roots
  - Module Federation remote loading via `vite.config.ts` (`base: './'` is already correct)
- Upstream callers / consumers of note:
  - Manifest-driven host discovery loads `AdminApp` from `package.json`
  - `extension/index.ts` registers the `/admin` command as a UI-only entry point
  - `apps/desktop/electron/cli/index.ts:112,177` explicitly keeps `admin` out of the bridged agent CLI surface
  - Core host code imports this plugin’s `shared/skill-visibility.ts` from `apps/desktop/electron/features/apps/extensions/skill-visibility.ts:2` and `apps/desktop/electron/ipc/agent/handlers/skills.ts:25`
- Downstream dependencies:
  - Profile-scoped config files under `SERO_HOME/agent/` (`settings.json`, `auth.json`, `layout.json`, `workspaces.json`, `.env`) plus fixed-root `profiles.json`
  - Session JSONL files listed via `window.sero.sessions.list()` and read via `window.sero.appState.readText()`
  - Host/remote logs under `/tmp/sero-*.log`
  - Plugin install/uninstall flows in `window.sero.plugins.*`
  - Workspace additional-root management (`linked-plugin` roots) that feeds Explorer + AD-018 container bind mounts
- Test surface:
  - No package-local tests (`vitest.config.*`, `__tests__/`, and `*.test.*` are absent)
  - `package.json` only typechecks `ui/**` + `shared/**` through `ui/tsconfig.json`; `extension/index.ts` is outside the package-local typecheck target

## Architectural notes
- The extension boundary is intentionally conservative: `extension/index.ts` is UI-only and does not register agent-callable tools. That is correct for a plugin that can reveal `auth.json`, `.env`, logs, and profile internals.
- The largest seam is not the visible UI; it is `ui/hooks/useSeroFiles.ts`, which duplicates a large subset of the `window.sero` contract instead of consuming a canonical shared bridge type. That file currently mixes bridge typing, config-file IO hooks, profile loading, and session metadata loading.
- Admin owns one piece of logic that is no longer really plugin-local: `shared/skill-visibility.ts` is consumed by the Electron host itself, so the plugin is not a clean leaf package anymore. This directly conflicts with the plugin guide’s rule that neutral cross-package contracts should live in `packages/common/src`.
- The package still contains an abandoned provider-defaults UI layer: `ui/components/ProviderCard.tsx` and `ui/components/TierModelPicker.tsx` are not imported anywhere in the plugin.
- The plugin’s package-local quality gates are thin relative to its responsibility. It edits sensitive files and browses session/log diagnostics, but it has no direct test coverage and no package-local typecheck coverage for the extension entry.

## Runtime-sensitive surfaces
- Sensitive config access must stay UI-only. Future cleanup must preserve the current “not bridged to agent CLI” behavior for admin surfaces that expose `auth.json`, `.env`, and profile state.
- Session browsing is behavior-sensitive even though it is “just diagnostics”: this UI deliberately avoids `agent.open()` side effects by reading raw JSONL files. Refactors must preserve that no-side-effect read path.
- Linked plugin roots are not cosmetic. They alter workspace root state and, by extension, container bind mounts used by AD-018 plugin-development workflows.
- Auth/model refresh behavior depends on focus, visibility, and auth-event listeners in the remote UI. Any dedupe here must preserve “refresh data without clobbering an in-progress draft” semantics.
- Skill visibility writes are globally meaningful: the hidden-skill list affects the always-on `<available_skills>` prompt block and must keep the existing `settings.json` shape.

## Surprising discoveries
- `ui/hooks/useSeroFiles.ts` duplicates a huge slice of the renderer↔host API and is already narrower than the canonical desktop types in multiple places (`apps.discover`, plugin install return type, profile/session/auth/onboarding shapes).
- Core host code depends directly on `plugins/sero-admin-plugin/shared/skill-visibility.ts`, so the admin plugin currently owns part of the desktop runtime’s global skill-loading behavior.
- Two large UI files are dead weight today: `ui/components/ProviderCard.tsx` (162 LOC) and `ui/components/TierModelPicker.tsx` (324 LOC) are not imported anywhere.
- `shared/types.ts` still exports unused `SessionMeta`, `SessionMessage`, and `LogFile` interfaces from an older shape of the admin UI.
- The package has zero direct tests despite touching sensitive file browsing, plugin installation flows, and session/log diagnostics.

## Post-fix snapshot — 2026-04-13

### Metrics after fixes
- Largest source file: `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` (372 LOC)
- `ui/hooks/useSeroFiles.ts`: 473 → 259 LOC
- Files over 500 LOC: none
- Type escape hatches remaining: the local `window.sero` cast is gone from the shared-contract seam; broader session/browser truthfulness work is still pending

### What changed
- Added `@sero/common` host-bridge contracts for the admin-consumed `window.sero` subset.
- Replaced the plugin-local `SeroApi` copy in `ui/hooks/useSeroFiles.ts` with the canonical shared bridge subset and a typed `getSero()` helper.
- Kept the admin surface UI-only; no new tool bridging or runtime capability expansion was introduced.
- Package-local admin typecheck and monorepo `pnpm typecheck` still pass after the shared-contract move.

### Still outstanding
- The host still imports admin-owned `shared/skill-visibility.ts`; that Medium ownership violation remains pending.
- Session-browser truthfulness, auth/model refresh dedupe, dead provider-defaults cleanup, and test coverage are still pending.

## Post-fix snapshot — 2026-04-14 (E3)

### Metrics after fixes
- Total reviewable files: 35 (was 36)
- Largest source file: `plugins/sero-admin-plugin/ui/components/PluginsPanel.tsx` (372 LOC)
- Files over 500 LOC: none
- Package-local quality gate: `package.json` now typechecks `ui/` + `extension/`, and `ui/skill-visibility.test.ts` covers the persisted skill-visibility helpers

### What changed
- Moved skill-visibility ownership into `packages/common/src/skill-visibility.ts` so neither the host nor the admin UI imports admin-plugin internals for global settings behavior.
- Deleted the plugin-local shared skill-visibility helper and kept the persisted `sero.skillVisibility.disabledModelSkills` shape unchanged.
- Added an extension tsconfig plus a package-local Vitest entry so the admin package is no longer UI-typecheck-only.

### Still outstanding
- `useSeroFiles.ts` modularization, session-browser truthfulness, auth/model refresh dedupe, and dead provider-defaults cleanup are still pending.
- Broader package-local coverage for session parsing and plugin-manager state transitions is still pending.
