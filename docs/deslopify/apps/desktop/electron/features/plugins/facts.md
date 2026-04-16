# Facts — apps/desktop/electron/features/plugins

_Last reviewed: 2026-04-16_

## What this code does
This folder owns plugin lifecycle and discovery in Electron main: install/uninstall/list/is-plugin operations, staged package preparation/build rules, plugin install-path security checks, GitHub/npm marketplace discovery, and manifest-driven CLI bridge policy lookup for plugin tools (AD-020).

## Shape & metrics
- Total files: 7
- Total LOC: 1,167
- Largest file: `apps/desktop/electron/features/plugins/manager.ts` (498 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC):
  - `apps/desktop/electron/features/plugins/manager.ts` (498)
- External dependencies of note:
  - Shelling out to system tooling (`npm`, `git`, `tar`) via `child_process.execFile`
  - GitHub Search API + npm registry search API (`fetch` in Electron main)
  - App discovery + ext protocol registration (`features/apps/discovery`, `platform/protocols/ext-protocol`)
  - CLI bridge policy cache integration (`@electron/cli`)
- Upstream callers:
  - Runtime: `electron/ipc/integrations/plugins.ts` (manager + discovery), `electron/cli/index.ts` (bridge policy)
  - Tests: plugin discovery/security/install-policy/package-build/CLI-bridge suites
- Downstream dependencies:
  - `features/apps/discovery` cache/manifest lifecycle
  - `platform/protocols/ext-protocol` remote asset registration
  - `features/plugins/package-build` source-build/install sanitization path

## Architectural notes
- `manager.ts` currently combines package staging, rollback, settings mutation, discovery registration, and install locking in one near-cap file.
- Plugin bridge behavior is intentionally manifest-driven (`bridge-policy.ts`) to align with AD-020 and avoid core allowlist churn.
- Plugin install state mutates the shared `settings.json` package list, so error handling here affects broader app/provider/model configuration surfaces.

## Surprising discoveries
- Discovery still queries `sero-ai-plugin` topic/keyword (`discovery.ts:12-13`), while plugin docs now instruct `sero-agent-plugin`; this can hide otherwise valid community plugins from search.
- Settings parsing failures in plugin manager silently downgrade to `{}` (`manager.ts:156-161`), and subsequent add/remove writes can overwrite the full settings file shape (`manager.ts:467-492`).
- Installed plugin paths are manually registered on install (`manager.ts:298`) and now explicitly unregistered on uninstall/rollback (`manager.ts:286-295`, `manager.ts:347-352`) so discovery state no longer relies on process restart.

## Post-fix snapshot — 2026-04-16

### Metrics after fixes
- Total files: 7 (unchanged)
- Total LOC: 1,167 (was 1,141)
- Largest file: `apps/desktop/electron/features/plugins/manager.ts` (498 LOC; was 494)
- Files over 500 LOC: none (unchanged)
- Type escape hatches remaining: none introduced in this pass

### What changed
- Added `unregisterAppPath()` to app discovery so registered plugin install paths have an explicit teardown path.
- Wired plugin uninstall and install rollback cleanup through that unregister helper to keep discovery state aligned with the on-disk install set.
- Added focused coverage for direct register/unregister symmetry in app discovery plus plugin install/uninstall discovery cleanup without restart.

### Still outstanding
- `manager.ts` is still a near-cap lifecycle hub and should be split in a future backlog pass, but that structural cleanup was intentionally left out of this closeout item.
- Bridge-policy parse/read diagnostics remain backlog-only and were not touched in this pass.
