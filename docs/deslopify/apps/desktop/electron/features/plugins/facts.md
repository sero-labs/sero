# Facts — apps/desktop/electron/features/plugins

_Last reviewed: 2026-04-12_

## What this code does
This folder owns plugin lifecycle and discovery in Electron main: install/uninstall/list/is-plugin operations, staged package preparation/build rules, plugin install-path security checks, GitHub/npm marketplace discovery, and manifest-driven CLI bridge policy lookup for plugin tools (AD-020).

## Shape & metrics
- Total files: 7
- Total LOC: 1,141
- Largest file: `apps/desktop/electron/features/plugins/manager.ts` (494 LOC)
- Files over 500 LOC: none
- Near-cap files (≥450 LOC):
  - `apps/desktop/electron/features/plugins/manager.ts` (494)
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
- Installed plugin paths are manually registered on install (`manager.ts:298`) but never unregistered on uninstall (`manager.ts:340-350`), leaving stale in-memory discovery entries until process restart.
