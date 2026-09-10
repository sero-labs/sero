## 1. Shared refresh entry point

- [ ] 1.1 Add an offline check that mirrors Pi's own rule. `ModelRuntime.create` treats `PI_OFFLINE` as set-or-unset (`process.env.PI_OFFLINE === undefined`), while Pi's CLI arg docs describe it as a truthy flag. Follow `ModelRuntime` so Sero's two callers agree with the create-time behaviour, and record the upstream divergence in a code comment. Verify with a unit test over unset, `1`, `true`, and `0`, asserting the result matches what `ModelRuntime.create` would compute.
- [ ] 1.2 Add one shared helper that resolves the refresh options for both callers, so the timer and the credential-change path cannot drift. Verify that the credential-change path still passes `allowNetwork: true` when not offline, and `allowNetwork: false` when offline, with an existing or new test in `apps/desktop/electron/__tests__/ipc/platform/auth/`.

## 2. Scheduler module

- [ ] 2.1 Create `apps/desktop/electron/features/models/model-catalog-refresh.ts` with start, interval, and stop. Verify with a `vitest` test using fake timers: one tick invokes the shared refresh exactly once, and stop clears the interval so no further call happens.
- [ ] 2.2 Make the startup refresh non-blocking and bounded, matching `features/updater/updater.ts`. Verify the start call returns before the refresh resolves, by asserting the returned promise settles without awaiting the refresh.
- [ ] 2.3 Route the timer through the existing `refreshQueue` in `refreshModelAvailabilityAfterCredentialChange` rather than calling the runtime directly. Verify with a test that a tick overlapping a credential change produces exactly one refresh call per provider.

## 3. App lifecycle wiring

- [ ] 3.1 Start the scheduler once from `app-main.ts` after `initUpdater()` inside `app.whenReady()`. Verify the app still opens a window with no added startup delay, and that `app-main.ts` stays under the 500 LOC limit.
- [ ] 3.2 Stop the scheduler on `before-quit`, following the updater's `pollTimer` pattern. Verify no refresh is attempted after quit.
- [ ] 3.3 Confirm the change touches no contract: `sero:models:list`, `src/types/ipc.ts`, the preload bridge, and the renderer are unchanged. Verify with `git diff --name-only` against the branch point.

## 4. Session reconciliation

- [ ] 4.1 Clamp the thinking level in `ensureSessionHasAvailableModel` after the model-object swap, using `session.setThinkingLevel(session.thinkingLevel)`. Verify with a test where a session holds `xhigh` and the refreshed model no longer supports it: the session ends on a supported level and no error is thrown.
- [ ] 4.2 Confirm the clamp is silent when nothing changes. Verify that a refresh which replaces a model object without changing supported levels appends no transcript entry and emits no thinking-level event.

## 5. Offline behaviour

- [ ] 5.1 Verify offline startup makes no catalog request and still applies a previously stored catalog. Seed a `models-store.json` fixture with an overlay newer than the bundled catalog, run with `PI_OFFLINE` set, and assert the overlay is present and the fetch stub was never called.
- [ ] 5.2 Verify a scheduled tick is skipped while offline. Verify the skip is logged once and does not surface a warning to the renderer.

## 6. Failure and integration verification

- [ ] 6.1 Verify an unreachable catalog host is non-fatal: point `catalogBaseUrl` at an unroutable address, assert the built-in list stays complete and available, and assert one warning per credentialed provider.
- [ ] 6.2 Verify a malformed catalog body is non-fatal: serve a non-list payload, assert the previous catalog stays in use and a warning is recorded.
- [ ] 6.3 Verify a successful refresh adds a model without a restart: run the app with a real provider key, confirm a model present in the `pi.dev` catalog for that provider but absent from the bundled `0.84.2` catalog becomes selectable.
- [ ] 6.4 Confirm no dependency change: `pnpm-workspace.yaml` and every `@earendil-works/pi-*` version are unchanged. Verify with `git diff --name-only` against the branch point.
- [ ] 6.5 Run `pnpm typecheck` from the monorepo root and confirm no errors.
