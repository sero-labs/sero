## 1. Shared root resolution and the test guard

- [x] 1.1 Add `apps/desktop/electron/features/profile/roots.ts` with `isTestRunner()`, `resolveSeroRoot()`, and `resolveHostArtifactsRoot()`. Under a test runner, accept `SERO_FIXED_ROOT_OVERRIDE`, `SERO_HOME_OVERRIDE`, or `SERO_HOST_ARTIFACTS_ROOT_OVERRIDE` and throw an error naming the override when none applies. Verify: a unit test asserts a throw with a message naming the override, an override resolves, and a non-test process still falls through to the home directory.
- [x] 1.2 Replace the local `resolveSeroRoot()` in `manager.ts` and `resolveSeroFixedRoot()`/`resolveHostArtifactsRoot()` in `platform/env/index.ts` with the shared functions, keeping the existing exported constants. Verify: `pnpm typecheck` passes and `env.ts` still exports `SERO_FIXED_ROOT` and `SERO_HOST_ARTIFACTS_ROOT`.
- [x] 1.3 Set `SERO_HOME_OVERRIDE` and `SERO_HOST_ARTIFACTS_ROOT_OVERRIDE` (not `SERO_FIXED_ROOT_OVERRIDE`, which would shadow per-test roots) to a per-process temp directory in `apps/desktop/test/vitest.setup.ts` when they are unset, so every test importer satisfies the guard. Verify: the node project runs no file against the real `~/.sero-ui` and the suite starts without a guard throw.
- [x] 1.4 Remove `/^\[sero:profile\]/` from `QUIET_PATTERNS` in `apps/desktop/test/vitest.setup.ts`, or scope it to the renderer project only. Verify: a test that logs with the `[sero:profile]` prefix shows the line in test output.
- [x] 1.5 Give the profile tests an explicit root instead of swapping `HOME` — `manager.test.ts`, `recovery.test.ts`, and any other profile test that reaches the registry. Verify: each test sets the override and `pnpm vitest run --project node electron/__tests__/features/profile` passes.

## 2. Profile discovery

- [x] 2.1 Add `apps/desktop/electron/features/profile/discovery.ts` with `isProfileDirectory()` and a `DiscoveredProfile` type carrying `id`, `name`, `path`, and `lastModified`. Verify: a unit test returns directories that contain an `agent/` child and skips directories that do not.
- [x] 2.2 Implement `discoverProfiles({ seroRoot, registryPath })` scanning `<seroRoot>/profiles/`, with the directory name as the name and the newest profile-file mtime as `lastModified`. Verify: a test with two profile directories returns both; a non-profile directory is skipped.
- [x] 2.3 Implement `readLatestBrokenRegistry()` and merge its entries into discovery, keeping only paths that exist and preferring the recorded `name` and `id` on a path collision. Verify: a test covers a recorded custom path outside the managed root, a recorded path that no longer exists, and a path found by both sources returning one entry.
- [x] 2.4 Implement `selectSalvageCandidates()` over the current broken registry, returning entries whose paths exist. Verify: a test with three entries and two existing directories returns two; malformed JSON returns none.

## 3. Adoption

- [x] 3.1 Add `profileManager.adopt(profile)` in `manager.ts`: refuse an already-registered or overlapping path using the existing validation, reuse the recorded id when present, set `folderProvenance` from the path, register the entry, and set it active in one write. Verify: a test adopts a discovered profile and asserts the registry entry, the active id, and that no files were created or moved.
- [x] 3.2 Verify adoption of the Sero root itself works when the registry is empty, matching the first-profile convention. Verify: a test adopts a candidate at the default root path and the entry appears active.
- [x] 3.3 Verify an already-registered path is refused and the registry is unchanged. Verify: a test asserts the error and compares the registry before and after.

## 4. Recovery salvage

- [x] 4.1 Add `salvageRegistrySync(candidates)` beside the reset helper, backing up the broken file with the existing timestamp convention and writing a registry with the first candidate active. Verify: a test asserts the backup exists, the registry contains the candidates, and the active id is set.
- [x] 4.2 Update `handleProfileRegistryRecovery()` to compute candidates from the current `profiles.json` before showing choices, and to show "Keep N existing profiles" as the default button only when a candidate exists. Keep Reset and Open Folder. Verify: `recovery-dialog.test.ts` covers the salvage choice, the no-candidate case, and an unparseable file still offering Reset only.

## 5. IPC and preload

- [x] 5.1 Add `profiles.discover` and `profiles.adopt` to `apps/desktop/src/types/ipc-channels.ts` and export `DiscoveredProfile` from `apps/desktop/src/types/profile.ts`. Verify: `pnpm typecheck` passes.
- [x] 5.2 Register both handlers in `apps/desktop/electron/ipc/workspace/profiles.ts`; `adopt` adopts by path and relaunches using the same `clearLoadedProfileEnvForRelaunch()` + `app.relaunch()` path as `profiles.switch`. Verify: an IPC test asserts the discover payload shape and that adopt relaunches.
- [x] 5.3 Add `discover` and `adopt` to `profilesBridge` in `apps/desktop/electron/preload/api/core.ts`. Verify: `pnpm typecheck` passes and the preload surface test covers the new methods.

## 6. Renderer recovery experience

- [x] 6.1 Add `discoveredProfiles` (hydrated by `loadProfiles()` alongside the registry) and `adoptProfile()` to `apps/desktop/src/stores/profiles.ts`. Verify: a store test hydrates candidates from the bridge and adopts one.
- [x] 6.2 Render discovered profiles in `ProfileSetup` above `ProfileForm` with name, path, last-modified, and an Open action, keeping the create form available. Verify: a component test shows a row per candidate above the form and shows only the form when discovery is empty.
- [x] 6.3 Update `ProfileSwitcher` to render when the registry lists no profiles but discovery finds at least one, and to stay hidden when neither finds anything. Verify: a component test covers both cases.
- [x] 6.4 Confirm `App.tsx` still routes to `ProfileSetup` when `hasActiveProfile` is false and that an adopted profile satisfies the gate after relaunch. Verify: the gate is unchanged; no App gate test exists, so the chain is covered by the manager adopt test (`activeProfileId` set), the IPC adopt test (relaunch), and the store test (`loadProfiles` reads `hasActive`).

## 7. Verification and investigation

- [x] 7.1 Run `pnpm typecheck` from the monorepo root. Verify: no errors.
- [x] 7.2 Run the closest existing checks: the node project's profile tests plus the new discovery, guard, salvage, and renderer component tests. Verify: all pass and each new test maps to a spec scenario.
- [x] 7.3 Confirm every touched source file is at or below 500 LOC, splitting further if a change pushed one over. Verify: `wc -l` on each touched source file.
- [x] 7.4 Reproduce the original test escape under the new guard — run the suite under the 14:08 conditions on a checked-out tree and see whether the guard fires. Verify: findings recorded on issue #548, with the mechanism found or the attempts and their results reported. This task is not a code deliverable and does not block the rest.
