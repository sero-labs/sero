# Refactoring Plan — apps/desktop/electron/features/plugins

_Plan drafted: 2026-04-12_

## Executive Summary
This module is functionally solid and mostly typed, but it now carries high-impact drift in plugin discovery metadata, fragile settings-file mutation behavior, and a near-cap manager orchestrator that mixes too many responsibilities. The plan prioritizes correctness of marketplace discovery and settings safety first, then splits/clarifies lifecycle orchestration to keep plugin operations maintainable.

## Issues Found (prioritized)
- **High** — ~~Plugin discovery topic/keyword drift breaks discoverability contract — `apps/desktop/electron/features/plugins/discovery.ts:12-13` hardcodes `sero-ai-plugin`, but current plugin author docs and discovery guidance use `sero-agent-plugin` (`docs/plugins/guide.md`). This can cause valid community plugins to never appear in search results.~~ ✅ 2026-04-16 validation pass — `discovery.ts` now searches both `sero-agent-plugin` and legacy `sero-ai-plugin` metadata, dedupes the results, and documents the migration explicitly at the file header. Treat this High item as closed; only optional focused discovery-query coverage remains if we want belt-and-suspenders tests. Effort: **S**.

- **High** — ~~Settings parse fallback can cause destructive rewrites — `apps/desktop/electron/features/plugins/manager.ts:156-165` returns `{}` on any read/parse failure, then `addToSettings`/`removeFromSettings` writes that object back (`manager.ts:467-492`). A malformed/partially-written settings file can be collapsed into a minimal object during plugin operations, losing unrelated settings.~~ ✅ 2026-04-16 validation pass — `readSettings()` now only returns `{}` for `ENOENT` and otherwise throws an actionable malformed-settings error before plugin install/uninstall mutations run. The destructive rewrite path is closed. Effort: **M**.

- **Medium** — Plugin manager is one change away from violating file-size policy and mixes concerns — `apps/desktop/electron/features/plugins/manager.ts:1-494` includes install serialization, staging/backups, package source strategies, settings mutation, discovery registration, and metadata shaping in one file. This is high review load and fragile for future changes. Effort: **M**.

- **Medium** — Local source builds are non-deterministic when `node_modules` is present — `apps/desktop/electron/features/plugins/package-build.ts:160-163` skips install if `node_modules` exists, so copied local plugins can build against stale/symlinked workspace dependencies instead of clean install state. Effort: **S**.

- **Medium** — Installed-path registration has no uninstall teardown path — install calls `registerAppPath` (`apps/desktop/electron/features/plugins/manager.ts:298`), but uninstall never unregisters (`manager.ts:340-350`), and discovery keeps an in-memory path list (`apps/desktop/electron/features/apps/discovery/index.ts:267-276`). This leaves stale entries until restart. Effort: **S**.

- **Low** — Bridge policy parse/read failures are fully silent — `apps/desktop/electron/features/plugins/bridge-policy.ts:72-73` collapses errors to `null` with no diagnostics, making plugin tool-bridging failures hard to debug under AD-020. Effort: **S**.

## Proposed Refactoring
1. **Fix discovery taxonomy drift immediately.**
   - Update topic/keyword constants in `discovery.ts` to the canonical value used in docs (`sero-agent-plugin`).
   - Add a small test asserting generated GitHub/npm search queries include the canonical tag.
   - Aligns behavior with plugin docs and avoids silent marketplace regressions.

2. **Make settings mutation fail-safe.**
   - Replace raw `readSettings`/`writeSettings` logic in plugin manager with shared settings helpers plus explicit malformed-file handling.
   - On parse failure, abort install/uninstall with actionable error (and optional backup suggestion) instead of writing `{}`.
   - Keep writes narrow: mutate only `packages` while preserving all other settings keys.

3. **Split `manager.ts` into focused lifecycle modules.**
   - Extract to modules like `sources.ts` (npm/git/local staging), `settings-packages.ts` (settings list mutation), and `install-transaction.ts` (reserve/rollback/finalize).
   - Keep `manager.ts` as thin orchestration API (`installPlugin`, `uninstallPlugin`, `listInstalledPlugins`, `isInstalledPlugin`).
   - This keeps the area under the 500-LOC policy and reduces coupling.

4. **Enforce deterministic build preparation for source installs.**
   - In `package-build.ts`, do not treat pre-existing `node_modules` as authoritative for git/local staged packages.
   - Either always reinstall (preferred for correctness) or gate skip-behavior behind explicit validated metadata.
   - Preserve current `preBuilt` semantics from plugin docs.

5. **Add uninstall symmetry for discovery path registration.**
   - Introduce `unregisterAppPath()` in app discovery and call it on plugin uninstall/error rollback paths.
   - Ensure install/uninstall idempotency and remove stale path accumulation.

6. **Improve plugin bridge-policy diagnostics.**
   - Log one scoped warning when package.json parsing fails for an extension path (include extension/package path, avoid noisy repeats via cache).
   - Keep fail-closed behavior (`null`) but make diagnosis straightforward.

## Benefits & Trade-offs
- Benefits: correct plugin marketplace results, safer settings persistence, smaller/focused lifecycle modules, and easier debugging of bridge-policy failures.
- Trade-offs: moderate churn across plugin + app-discovery boundaries, plus additional tests and migration of utility helpers.

## Dependencies & Risks
- Introducing `unregisterAppPath` touches `features/apps/discovery` consumers and should be regression-tested against built-in dev path registration flows.
- Settings hardening changes behavior for malformed `settings.json`; callers may now receive explicit errors where previous behavior silently continued.
- Build-prep changes can increase install time for local source plugins if always reinstalling dependencies.

## Next Steps
1. Add coverage for plugin manager transactional flows (install rollback + uninstall settings/path symmetry).
2. Split `manager.ts` into transaction/source/settings helpers before adding new plugin lifecycle features.
3. Tighten source-build determinism in `package-build.ts` and document expected behavior in plugin technical docs.
4. Continue Wave A: `deslopify apps/desktop/electron/shared`.

## Execution log
- 2026-04-16 — validation pass (working tree, no commit recorded in this plan)
  - Confirmed plugin discovery now dual-searches `sero-agent-plugin` + `sero-ai-plugin`, closing the original taxonomy-drift High item.
  - Confirmed `readSettings()` now fails closed on malformed `settings.json` instead of returning `{}` for arbitrary parse/read failures, closing the original destructive-rewrite High item.
