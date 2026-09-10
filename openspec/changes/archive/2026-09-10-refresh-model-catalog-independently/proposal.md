## Why

Sero pins the Pi package family at `0.84.2` in `pnpm-workspace.yaml`. The built-in provider model definitions ship inside `@earendil-works/pi-ai` as generated data, so a model that ships upstream cannot reach a Sero user until Sero bumps Pi and cuts a release.

Pi decoupled that in v0.80.8. The coding agent overlays a remote catalog from `pi.dev` on the built-in provider list and persists it in `models-store.json`. `remote-catalog-provider.ts` does not exist at tag `v0.80.7` and does exist at `v0.80.8`. Sero's pinned `0.84.2` already contains the mechanism, so no Pi upgrade is needed.

Sero never triggers it. `ensureAiInfra()` calls `ModelRuntime.create({ allowModelNetwork: false })`, and the only networked refresh sits on the credential-change path. `~/.sero-ui/agent/models-store.json` holds `{}` on a machine in daily use. A Sero window that stays open for days serves a frozen model list.

This work does not replace the Pi dependency upgrade. That upgrade stays a separate follow-up, as issue #517 requires.

## What Changes

- Refresh the built-in provider catalog once after startup, in the background. Startup must not wait for it.
- Repeat the refresh on a six-hour timer for the lifetime of the app window, and stop the timer on quit.
- Treat an offline intent as authoritative. When `PI_OFFLINE` is set, restore the persisted catalog and make no network request.
- Reconcile live sessions after a refresh, as today, and clamp each session's thinking level to the refreshed model's capabilities.
- Serialise the timer against the existing credential-change refresh so the two cannot overlap.

Non-goals:

- No change to `pnpm-workspace.yaml` or any `@earendil-works/pi-*` version.
- No fork, patch, or vendored copy of Pi.
- No new provider. Provider identity, display name, logo, and auth requirements stay compiled into the Pi package. The remote catalog carries model entries only.
- No removal of retired models. Pi merges the overlay by model ID and appends, so a model that upstream dropped stays listed.
- No user-visible control. No settings toggle and no menu item.
- No change to the `sero:models:list` IPC contract. The handler reads the live runtime, so it returns refreshed data with no contract change.

## Capabilities

### New Capabilities

- `model-catalog-refresh`: how the host keeps built-in provider model definitions current without a Sero release or a Pi upgrade.

### Modified Capabilities

None.

## Impact

- **New code**: `apps/desktop/electron/features/models/model-catalog-refresh.ts` owns the timer, the offline guard, and shutdown.
- **`apps/desktop/electron/app-main.ts`**: start the scheduler once, after `initUpdater()`. This file is 475 LOC, so the diff stays at one import and one call.
- **`apps/desktop/electron/ipc/platform/auth/auth-model-refresh.ts`**: share the offline guard and the existing `refreshQueue` with the timer.
- **`apps/desktop/electron/ipc/agent/core/agent-session-model-sync.ts`**: clamp the thinking level after a model-object swap.
- **Persisted state**: `~/.sero-ui/agent/models-store.json` gains one entry per provider that resolves credentials.
- **Network**: HTTPS `GET https://pi.dev/api/models/providers/<providerId>`, with `If-None-Match` revalidation. Pi suppresses a real fetch for four hours per provider, so the practical ceiling is six requests per provider per day, most answered `304`.
- **Failure**: a failed or unavailable catalog is non-fatal. The previous catalog stays in use and the failure lands in `refreshWarnings`.
- **Not covered**: Desktop, Agent Node, plugin, and CLI compatibility effects beyond Desktop are not confirmed by this change. The Agent Node runtime passes `modelsStorePath` where it appears to mean the models config path; that is a separate issue.
