## Context

See `proposal.md` for motivation. Current state that shapes the approach:

- `apps/desktop/electron/features/profile/manager.ts` owns the registry. Its
  module-level `resolveSeroRoot()` falls through to `path.join(os.homedir(),
  '.sero-ui')` when neither override is set. `env.ts` has a near-identical
  `resolveSeroFixedRoot()` and a third `resolveHostArtifactsRoot()`. The logic is
  duplicated three times.
- `manager.ts` is 448 lines. The project rule keeps source files at or below
  500 LOC, so new code must be split out rather than appended.
- `ProfileSetup` (`apps/desktop/src/components/profiles/ProfileSetup.tsx`) is the
  screen `App.tsx` renders when `hasActiveProfile` is false, which is the state an
  empty registry produces. `OnboardingWizard` only renders inside the shell, after
  a profile is active. The recovery list therefore belongs in `ProfileSetup`.
- `ProfileSwitcher` returns `null` when `profiles.length === 0`.
- `apps/desktop/electron/features/doctor/profile-state/snapshot.ts` already has a
  read-only `detectOrphanProfileDirs()` and a tolerant `readRegistryLenient()`,
  but both hard-code `os.homedir()` and ignore overrides, and neither reads a
  broken-registry backup.
- `apps/desktop/electron/features/profile/recovery.ts` reads
  `profiles.json` through `readRegistryLoadSync()` at startup, so a salvage read
  must happen before the reset, while the broken file is still in place.
- No profile file carries a display name. A profile is identified by its
  registry entry; on disk it is only a directory with an `agent/` child.
- 41 test files import `@electron/platform/env` directly, and none set a root
  override. `env.ts` resolves its root at module load, so a guard that throws
  without an override fails those files at import time.

## Goals / Non-Goals

**Goals:**

- One root resolver shared by `manager.ts` and `env.ts`, with a single
  test-runner guard.
- Read-only discovery of profiles that exist on disk but are not registered, and
  adoption of one at its existing path.
- A salvage path in the startup recovery dialog that keeps profiles whose
  directories still exist.
- Keep every touched source file at or below 500 LOC.

**Non-Goals:**

- No change to the `profiles.json` schema and no new profile-creation path.
- No copying, moving, or rewriting of profile data during discovery or adoption.
- Consolidating the doctor's parallel orphan scan is out of scope. It is recorded
  as a known gap.
- The root cause of the original test escape is investigated, not fixed by
  construction. The guard is the durable protection.

## Decisions

### One shared root resolver, with the guard on all three paths

Add `apps/desktop/electron/features/profile/roots.ts` exporting
`resolveSeroRoot()`, `resolveHostArtifactsRoot()`, and `isTestRunner()`. Both
`manager.ts` and `env.ts` import it, replacing their local copies.

`isTestRunner()` is true when `process.env.VITEST` is set or `NODE_ENV === 'test'`.
Under a test runner, an override is accepted from any of
`SERO_FIXED_ROOT_OVERRIDE`, `SERO_HOME_OVERRIDE` (for the Sero root) or
`SERO_HOST_ARTIFACTS_ROOT_OVERRIDE` (for the artifacts root). When none applies,
resolution throws an error that names the override to set. Today's
`SERO_FIXED_ROOT_OVERRIDE` check is gated on `NODE_ENV === 'test'` only, which
would silently miss a `VITEST`-only process; the shared helper removes that
coupling.

Alternative considered: guard only the two functions the issue names and leave
`resolveHostArtifactsRoot()`. Rejected by the user's decision — it has the
identical fallthrough.

### The tests get a global isolated root

`apps/desktop/test/vitest.setup.ts` sets `SERO_HOME_OVERRIDE` and
`SERO_HOST_ARTIFACTS_ROOT_OVERRIDE` to a per-process temp directory when they
are unset. The guard is then satisfied for every importer, in CI and locally,
with one change. Profile tests still set their own explicit root so each states
where it writes.

`SERO_FIXED_ROOT_OVERRIDE` is deliberately left unset: it outranks
`SERO_HOME_OVERRIDE`, so setting it globally would shadow every per-test root.
It stays a per-test escape hatch.

Alternative considered: an explicit root in every importing test file. Rejected
as noisy — 41 direct importers plus transitive ones.

### Discovery is synchronous and read-only

Add `apps/desktop/electron/features/profile/discovery.ts` with
`isProfileDirectory()`, `discoverProfiles()`, `readLatestBrokenRegistry()`, and
`selectSalvageCandidates()`. It takes the Sero root and registry path as
arguments instead of importing `manager.ts`, which avoids an import cycle and
keeps it testable against a temp directory.

Synchronous matches `manager.ts`'s synchronous-first design and the startup
recovery path, which runs before the window exists. The doctor's existing orphan
scan is already synchronous.

A directory counts as a profile when it contains an `agent/` child — the same
rule the doctor's `detectOrphanProfileDirs()` uses.

Alternative considered: an async scan. Rejected — the only caller that matters
runs during startup, where async buys nothing.

### Two discovery sources, with recorded identity preferred

`discoverProfiles()` merges:

1. Directories under `<seroRoot>/profiles/` that contain an `agent/` child.
2. Entries from the newest `profiles.broken-<timestamp>.json` beside
   `profiles.json` whose `path` still exists.

Entries are deduplicated by resolved path. When both sources match a path, the
recorded entry wins: its `name` and `id` are kept and the synthesized
`orphan:<dir>` identity is dropped. A discovered entry carries `id`, `name`,
`path`, and `lastModified`.

The broken-registry read is tolerant: `JSON.parse` in a `try`, then per-entry
shape checks, mirroring `readRegistryLenient()`. A file that is not valid JSON
yields no candidates, which is exactly the case where Reset stays the only
option.

`lastModified` is the newest modification time of the profile directory and its
`agent/` files, presented in the UI as a last-modified time. It is a proxy, not
a true last-used time; no last-used timestamp is stored.

The broken-backup source is essential for the case the incident produced: the
first profile's path is the Sero root itself, which is not under `profiles/` and
so cannot be found by a directory scan.

### Adoption re-registers at the existing path

Add `profileManager.adopt(profile)` in `manager.ts`. It:

- refuses a path that a registered profile already owns, and reuses the existing
  overlap validation so a nested or overlapping path is refused;
- reuses the recorded `id` when the candidate came from the broken registry, and
  otherwise mints one;
- sets `folderProvenance` from the path (`sero-managed` when nested under the
  managed root, otherwise `custom`);
- registers the entry and makes it active in one write.

No files are created, copied, or moved. `mkdir` calls that `create()` needs are
not part of adoption.

### Salvage writes a valid registry from the broken one

`recovery.ts` gains `salvageRegistrySync(candidates)`: back up the broken
`profiles.json` with the existing timestamp convention, then write a registry
containing the given entries with the first as active. `handleProfileRegistryRecovery()`
computes candidates from the *current* file before offering choices.

The dialog shows "Keep N existing profiles" as the default button only when at
least one candidate exists. Otherwise it keeps today's buttons. Reset and Open
Folder remain in both cases.

### IPC and renderer

Two channels: `profiles.discover` (returns `DiscoveredProfile[]`) and
`profiles.adopt` (adopts by path, then relaunches like `profiles.switch`). Both
follow the existing registration in `electron/ipc/workspace/profiles.ts`,
`electron/preload/api/core.ts`, `src/types/ipc-channels.ts`, and
`src/types/profile.ts`.

The renderer store gains `discoveredProfiles` (hydrated by `loadProfiles()`)
and
`adoptProfile()`. `ProfileSetup` renders a row per candidate above
`ProfileForm`. `ProfileSwitcher` renders when either the registry or discovery
has entries. `App.tsx`'s `!hasActiveProfile` gate is unchanged: adoption sets
the active profile and relaunches, and the next start satisfies the gate.

## Risks / Trade-offs

- **The doctor's `snapshot.ts` keeps its own `os.homedir()` root and its own
  orphan scan.** → Accepted for now. It is read-only and predates this change.
  Recorded as an open question; consolidating it is a follow-up, not part of it.
- **A directory with an `agent/` child but unusable contents is still
  discovered.** → Mitigation: adoption only registers the path; opening a broken
  profile fails in the same place an already-registered broken profile would. The
  `agent/` check is the same heuristic the app already trusts.
- **The 500 LOC limit forces new modules.** → Mitigation: `roots.ts` and
  `discovery.ts` are cohesive units, not extra layers; `manager.ts` shrinks when
  its root resolver moves out.
- **`SERO_HOME_OVERRIDE` in test setup could mask a test that needs a specific
  root.** → Mitigation: profile tests set their own root explicitly, and the
  guard fails loudly when a test process reaches the real root.
- **Reproducing the original escape may not succeed.** → Mitigation: the
  investigation is a bounded task. The guard protects the real root whether or
  not the mechanism is found, and findings go on issue #548.

## Migration Plan

No data migration. The registry schema is unchanged. Rollback is a revert; a
registry written by salvage is valid under the current schema either way.

## Open Questions

- Should `apps/desktop/electron/features/doctor/profile-state/snapshot.ts` adopt
  the shared discovery and root resolver? It has the same real-home exposure but
  is outside both issues' scope.
