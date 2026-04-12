# Facts — apps/desktop/electron/features/profile

_Last reviewed: 2026-04-12_

## What this code does
This feature owns the profile registry and bootstrap lifecycle behind AD-022: fixed-location `profiles.json` management, legacy-install migration into the new profile system, copying transferable auth/model data into new profiles, and startup template seeding for agents, skills, themes, and global-workspace profile files.

## Shape & metrics
- Total files: 6
- Largest file: `apps/desktop/electron/features/profile/setup.ts` (271 LOC)
- Files over 500 LOC: none
- External dependencies of note: fixed `~/.sero-ui/profiles.json` registry, `SERO_HOME` / `SERO_AGENT_DIR`, startup env bootstrap, `fs/promises`, shared model-config helpers
- Upstream callers: `apps/desktop/electron/platform/env/index.ts`, `apps/desktop/electron/shared/infra/shared-infra.ts`, `apps/desktop/electron/ipc/workspace/profiles.ts`, `apps/desktop/electron/main.ts`, `apps/desktop/electron/features/auth/google/auth-manager.ts`, profile tests
- Downstream dependencies: all profile-scoped state folders, first-run setup gating, restart-based profile switching, new-profile credential/model-copy flow

## Architectural notes
- `manager.ts` and `migration.ts` are imported before `SERO_HOME`/`SERO_AGENT_DIR` are established; their module-level comments correctly note that they must stay independent from profile-scoped env helpers.
- AD-022 is the governing constraint: profile identity is just `SERO_HOME`, registry location is fixed, and switching profiles is restart-based because shared singletons are not reset in-process.
- `manager.ts` currently treats malformed registry content as an empty registry, which makes registry integrity part of the first-run control path.
- `types.ts` still duplicates renderer-safe `ProfileInfo` instead of importing a canonical contract.

## Runtime-sensitive surfaces
- Registry parsing directly determines whether the app behaves like a fresh install or a real profile-scoped environment.
- `copy-profile-data.ts` runs during profile creation and copies auth/model data into the new profile before the first launch into it.
- Template seeding in `setup.ts` is startup-only and intentionally “copy missing only”; any refactor must preserve the non-overwrite guarantee.

## Surprising discoveries
- A corrupted `profiles.json` currently looks identical to “no profiles exist yet.”
- The feature still uses a `KEEP IN SYNC` duplicate `ProfileInfo` contract even after the IPC/type cleanup wave.
- `writeRegistrySync()` remains defined in `manager.ts` but is unused; async writes handle all live mutations while sync writes are only needed conceptually on bootstrap.
