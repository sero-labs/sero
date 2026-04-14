# Refactoring Plan — plugins/sero-admin-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-admin-plugin/` is a useful, mostly well-scoped UI-only control surface, but its internal ownership is drifting away from Sero’s architecture. The biggest problem is boundary truthfulness: one near-cap hook file redefines a large subset of the `window.sero` contract locally, the Electron host reaches back into this plugin for shared skill-visibility logic, and the package still ships dead provider-defaults scaffolding with no direct test coverage. The right outcome is not a redesign of Admin; it is a boundary cleanup that moves neutral contracts out of the plugin, trims dead code, and makes the diagnostics UI more truthful.

## Issues Found (prioritized)
- **High** — Plugin-local `window.sero` typing duplicates and narrows canonical host contracts — `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts:40-267` locally defines `SeroApi`, profile/session/auth/model/onboarding/subagent/skill/prompt types, then accesses the bridge through `useSeroFiles.ts:267-269` with `window as unknown as { sero: SeroApi }`. This duplicates canonical renderer types from `apps/desktop/src/types/electron.d.ts:196-445`, `apps/desktop/src/types/electron-apps.d.ts:14-36`, `apps/desktop/src/types/profile.ts:5-19`, `apps/desktop/src/types/subagent.ts:8-34`, `apps/desktop/src/types/skills.ts:12-39`, `apps/desktop/src/types/prompts.ts:11-38`, `apps/desktop/src/types/model-tiers.ts:15-24`, and `apps/desktop/src/types/onboarding.ts:4-55`. The local copy is already narrower in concrete places (`useSeroFiles.ts:54`, `useSeroFiles.ts:71`, `useSeroFiles.ts:119-135`, `useSeroFiles.ts:219-261`), which is exactly the IPC/bridge drift Sero is trying to eliminate. Effort: **M**.

- **Medium** — Core host behavior depends directly on admin-plugin internals — `apps/desktop/electron/features/apps/extensions/skill-visibility.ts:2` and `apps/desktop/electron/ipc/agent/handlers/skills.ts:25` import `plugins/sero-admin-plugin/shared/skill-visibility.ts`, whose public helpers live at `shared/skill-visibility.ts:35-85`. That makes a built-in plugin package the owner of global skill-loading behavior in the host, which fights AD-001 ownership boundaries and the plugin guide’s rule that neutral cross-package contracts belong in `packages/common/src`. Effort: **M**.

- **Medium** — `useSeroFiles.ts` is a near-cap mixed-responsibility hub — `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts:1-473` combines bridge typing, profile loading, config-file IO, model/auth contracts, plugin install contracts, workspace-root contracts, and session-list hooks in one file. It is the plugin’s largest file, is already close to the 500-LOC cap, and concentrates almost all host-boundary knowledge in a single place. Effort: **M**.

- **Medium** — Session diagnostics are not fully truthful and do extra IPC work — `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts:421-467` strips session metadata down to a custom `SessionFileInfo` shape that drops the session path, forcing `plugins/sero-admin-plugin/ui/components/SessionDetail.tsx:56-63` to re-fetch the full session list just to recover it. Then `SessionDetail.tsx:266-286` silently skips malformed JSONL lines with a bare `catch {}`. For an admin/debugger surface, hiding corruption and re-querying state just to reconstruct lost metadata is the wrong trade-off. Effort: **M**.

- **Medium** — Auth/model refresh wiring is duplicated across two large editors — `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx:88-124` and `plugins/sero-admin-plugin/ui/components/ModelPanel.tsx:81-102` both register the same focus/visibility/auth-event refresh pattern. That duplication is already large enough to drift, and any future changes to auth refresh semantics will have to be landed twice in a sensitive settings surface. Effort: **S**.

- **Medium** — The package still ships dead provider-defaults scaffolding and stale shared types — `plugins/sero-admin-plugin/ui/components/ProviderCard.tsx:1-162` and `plugins/sero-admin-plugin/ui/components/TierModelPicker.tsx:1-324` are not imported anywhere in the plugin, while `plugins/sero-admin-plugin/shared/types.ts:95-140` still exports unused `SessionMeta`, `SessionMessage`, and `LogFile` shapes. This is classic post-refactor scaffolding drift: substantial dead code remains after the UI moved to the slimmer global model panel. Effort: **S**.

- **Medium** — Safety nets are too thin for a sensitive admin surface — `plugins/sero-admin-plugin/package.json:9-11` only runs `tsc --noEmit -p ui/tsconfig.json`, and `plugins/sero-admin-plugin/ui/tsconfig.json:19` includes only `ui/**` + `shared/**`, leaving `extension/index.ts` outside the package-local typecheck path. On top of that, the package has no direct test files at all. This is weak coverage for a plugin that reads sensitive config, installs/uninstalls plugins, edits global agents/skills/prompts, and parses raw session/log files. Effort: **M**.

## Proposed Refactoring
1. **~~Move admin-consumed host bridge contracts to a canonical shared home and delete the local copy.~~ ✅ 2026-04-13 (`d885ff2d`)**
   - Create a renderer-safe shared contract module for the admin-consumed `window.sero` subset under `packages/common/src/` (or another neutral shared package if the desktop team prefers), instead of keeping it in `ui/hooks/useSeroFiles.ts`.
   - Replace local bridge/type definitions with imports from that canonical module.
   - Replace the current `window as unknown as { sero: SeroApi }` access with a typed helper built on the canonical bridge interface.
   - This aligns with the plugin guide’s “neutral cross-package contracts go to `packages/common/src`” rule and reduces the exact IPC drift risk called out in prior desktop reviews.

2. **~~Move skill-visibility ownership out of the admin plugin.~~ ✅ 2026-04-14 (`56ff5e59`)**
   - Relocate `shared/skill-visibility.ts` to `packages/common/src` (or a neutral desktop-shared location if the team wants host-only ownership).
   - Update both the plugin UI hook and host imports to consume that neutral helper.
   - Keep the persisted settings shape unchanged (`sero.skillVisibility.disabledModelSkills`) so runtime behavior and existing user settings remain intact.
   - This resolves the current host→plugin import cycle and better matches AD-001 ownership boundaries.

3. **~~Split `useSeroFiles.ts` into focused modules before it becomes the next 500-LOC file.~~ ✅ 2026-04-14 (`96b489fb`)**
   - Target shape:
     - `ui/hooks/host.ts` — typed `getSero()` helper only
     - `ui/hooks/useProfiles.ts`
     - `ui/hooks/useConfigFile.ts`
     - `ui/hooks/useSessionFiles.ts`
     - `ui/hooks/contracts.ts` only if any plugin-local types still remain after step 1
   - Keep hook APIs stable for the current UI so this is a shape cleanup, not a UX rewrite.
   - This makes future fixes reviewable and lowers the blast radius of host-bridge changes.

4. **~~Make the session browser truthful and avoid the redundant re-fetch.~~ ✅ 2026-04-14 (`96b489fb`)**
   - Keep the canonical session path on the session-list item passed into the UI instead of stripping it from `SessionFileInfo`.
   - Update `SessionDetail` to read the selected session file directly from the already-loaded list.
   - Change the JSONL parser to report malformed lines explicitly (for example, a warning banner with a skipped-line count) instead of silently dropping them.
   - Preserve the current “read raw file, do not call `agent.open()`” behavior, because that no-side-effect diagnostic path is the important runtime invariant.

5. **~~Extract the shared auth/model refresh lifecycle into one hook.~~ ✅ 2026-04-14 (`96b489fb`)**
   - Build a small hook that subscribes to `focus`, `visibilitychange`, and `auth.onEvent(...)`, then reuse it in both `AgentEditor` and `ModelPanel`.
   - Keep the current `preserveDraft` behavior in `ModelPanel` and the current “refresh dependencies without resetting editor state” behavior in `AgentEditor`.
   - This reduces duplication without changing user-visible semantics.

6. **~~Delete the dead provider-defaults layer and stale admin-only leftovers.~~ ✅ 2026-04-14 (`96b489fb`)**
   - Remove `ui/components/ProviderCard.tsx` and `ui/components/TierModelPicker.tsx` if the current design direction is the global tier-based `ModelPanel`.
   - Remove unused `SessionMeta`, `SessionMessage`, and `LogFile` exports from `shared/types.ts`, plus any now-unused format helpers.
   - If per-provider overrides are still planned, keep the intent in docs/specs rather than shipping orphaned implementation files.

7. **~~Add a minimal safety net for the sensitive paths.~~ ✅ 2026-04-14 (`56ff5e59`, `96b489fb`)**
   - Expand package-local typecheck coverage to include `extension/**`.
   - Add focused tests for:
     - skill-visibility normalization/persistence helpers
     - session JSONL parsing, including malformed-line diagnostics
     - plugin install/uninstall hook state transitions or at least the pure sorting/state helpers behind them
   - This does not need a huge UI test suite; it needs enough coverage that the admin surface stops being effectively untested.

## Benefits & Trade-offs
- Benefits: restores one source of truth for host bridge contracts, removes a host→plugin ownership violation, keeps the largest hook file under control, makes the session debugger more trustworthy, and strips dead code that currently muddies the package.
- Trade-offs: shared-contract extraction will touch multiple packages at once, and the session-browser cleanup changes diagnostic behavior by surfacing malformed-line warnings where the current UI silently hides them.

## Dependencies & Risks
- Shared bridge-type cleanup depends on choosing the right neutral owner. Importing directly from `apps/desktop/src/types/**` would fix duplication short-term but would be the wrong long-term boundary for a plugin package; the canonical contract should live in a renderer-safe shared package instead.
- Moving `skill-visibility` out of the plugin touches both host and plugin code. The behavior must stay byte-for-byte compatible with the current `settings.json` shape, or existing hidden-skill preferences will drift.
- Session-browser cleanup is behavior-sensitive for debugging workflows. Showing malformed-line diagnostics is the right fix, but it is still a user-visible change and should be verified with intentionally corrupted JSONL fixtures.
- Deleting the provider-defaults scaffolding is safe only after confirming no active UI path imports it and no near-term plan still expects those components to ship.
- If the team wants extra defense-in-depth for this sensitive plugin, this cleanup pass is also the right time to encode the “UI-only” intent explicitly in manifest policy (for example, `sero.plugin.bridgeTools: false`) rather than relying only on CLI-side exclusions.

## Next Steps
1. Keep the admin plugin on its current UI-only boundary; no further High/Medium deslop items remain from this plan.
2. Continue Wave F / E5 with the next queued plugin (`plugins/sero-web-plugin`) after the current Git closeout is documented and context is cleared.

Verification checklist:
- Open Admin and smoke-test every section: agents, skills, prompts, settings, model, plugins, logs, sessions.
- Confirm admin remains UI-only: no new tool bridging, and `/admin` stays non-agent-invocable.
- Toggle skill visibility and verify the same `settings.json` keys are written and read back.
- Inspect a deliberately malformed session JSONL file and verify the UI reports corruption instead of silently dropping rows.
- Install/uninstall a plugin and link/unlink a plugin folder to confirm plugin-manager and workspace-root flows still work.
- Run monorepo `pnpm typecheck` after the shared-contract move so host + plugin consumers fail together if a bridge contract drifts.

## Execution log
- `d885ff2d` — `refactor(contracts): centralize plugin bridge ownership`
- `56ff5e59` — `refactor(plugins): harden E3 bridge ownership and quality gates` *(admin: moved skill-visibility ownership to `@sero/common`, added extension typecheck, added package-local helper coverage)*
- `96b489fb` — `refactor(admin): finish E5 session and settings cleanup`
