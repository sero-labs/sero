## Why

A broken `profiles.json` is reset to an empty registry, and once it is empty Sero
shows first-run setup with no path back to the profile directories still sitting
on disk. On a live machine a test process caused exactly this: the reset dropped
the index of eight real profiles and every one of them became unreachable from
the app. Two failures combine into data loss of access — a test process that can
reach the real `~/.sero-ui`, and a recovery flow that offers only Reset.

## What Changes

- Discover profiles on disk when the registry is empty. Read
  `~/.sero-ui/profiles/` for directories that look like a profile, and read the
  newest `profiles.broken-*.json` for entries whose recorded path still exists.
- Adopt a discovered profile at its existing path — re-register it and make it
  active. Nothing is copied or moved.
- Offer discovered profiles in the first-run screen above the create-profile
  form, and keep `ProfileSwitcher` rendering while discovery finds something.
- Add a main-process guard: under a test runner with no explicit root override,
  resolving the Sero root throws instead of falling through to the real
  `~/.sero-ui`.
- Give the profile tests an explicit root (`SERO_HOME_OVERRIDE`) instead of
  swapping `$HOME`.
- Stop suppressing `[sero:profile]` logs during tests.
- Offer salvage first in the registry recovery dialog: keep the profiles from
  the broken registry whose directories still exist, and leave Reset for the
  case where nothing can be salvaged.
- Reproduce the test escape under the new guard and record findings on the
  issue. This is a bounded investigation, not a code deliverable.

## Capabilities

### New Capabilities

- `profile-recovery`: discovering profiles that exist on disk while the registry
  does not reference them, adopting one at its existing path, keeping profile
  switching reachable, and salvaging profiles from a broken registry instead of
  discarding them.
- `profile-registry-test-isolation`: a test process must never resolve the real
  Sero root; profile tests must state their root explicitly and profile log
  output must not be hidden.

### Modified Capabilities

None. No existing capability covers profile registry recovery or discovery.

## Impact

- `apps/desktop/electron/features/profile/manager.ts` — discovery, adoption,
  tolerant read of a broken registry, test-runner guard.
- `apps/desktop/electron/features/profile/recovery.ts` — salvage-first dialog.
- `apps/desktop/electron/platform/env/index.ts` — test-runner guard in
  `resolveSeroFixedRoot()`.
- `apps/desktop/electron/ipc/workspace/profiles.ts`,
  `apps/desktop/electron/preload/api/core.ts`,
  `apps/desktop/src/types/ipc-channels.ts`, `apps/desktop/src/types/profile.ts`
  — two new IPC channels (discover, adopt).
- `apps/desktop/src/stores/profiles.ts`,
  `apps/desktop/src/components/profiles/ProfileSetup.tsx`,
  `apps/desktop/src/components/profiles/ProfileSwitcher.tsx`,
  `apps/desktop/src/App.tsx` — recovery rows and empty-registry rendering.
- `apps/desktop/test/vitest.setup.ts` — remove the profile quiet pattern.
- `apps/desktop/electron/__tests__/features/profile/*.test.ts` — explicit roots.
- No new dependencies. No changes to the `profiles.json` schema.
