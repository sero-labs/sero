## Context

See `proposal.md` - Why for motivation. Three constraints shape the approach.

**The mechanism is internal to Pi.** `withRemoteCatalog`, `FileModelsStore`, and `REMOTE_CATALOG_REFRESH_INTERVAL_MS` are not exported from `@earendil-works/pi-coding-agent`. Sero cannot call, replace, or subclass them. The public surface is `ModelRuntime.create` options (`allowModelNetwork`, `modelRefreshTimeoutMs`, `catalogBaseUrl`, `modelsStore`, `modelsStorePath`, `refreshOnCreate`) and `refresh({ allowNetwork, force, providers, signal })`. Everything must be expressed through those.

Verified against the installed dependency at `0.84.2`:

```text
$ curl -sS https://pi.dev/api/models/providers/deepseek
  etag: "6fe6c05f..."     last-modified: 2026-09-10T12:33:10Z
  x-pi-model-catalog-minimum-version: 0.80.7
  x-pi-model-catalog-revision: sha256-6199a0b9...
  models: deepseek-flash, deepseek-v4-pro

$ ModelRuntime.create({ modelsPath: null, allowModelNetwork: false })
$ refresh({ allowNetwork: true })                      # bundled 0.84.2 + DEEPSEEK_API_KEY
  before:  deepseek-v4-flash, deepseek-v4-pro
  after:   deepseek-v4-flash, deepseek-v4-pro, deepseek-flash
```

Three behaviours from that probe drive the design:

- The overlay is additive and replaces by model ID. `deepseek-v4-flash` was retired upstream and stays listed.
- Network refresh of a provider requires a credential to resolve. Without `DEEPSEEK_API_KEY` the same call returned the static list in 133 ms and reported no error.
- With an unreachable catalog host, the static list stayed available and the failure surfaced as one error per credentialed provider.

**Current Sero state.** `ensureAiInfra()` calls `ModelRuntime.create({ allowModelNetwork: false })`, so startup never reaches the network. The only networked refresh is `refreshModelAvailabilityAfterCredentialChange`, which calls `refresh({ allowNetwork: true, force: true })`. `~/.sero-ui/agent/models-store.json` holds `{}` on a machine in daily use. The reconcile path that applies refreshed definitions to live sessions already exists in `agent-session-model-sync.ts`.

**Offline is reachable but not enforced.** `platform/env/index.ts` loads `~/.sero-ui/agent/.env` into `process.env` before SDK imports, so `PI_OFFLINE` is a real knob for a desktop user. Pi honours it in `ModelRuntime.create` (`modelNetworkEnabled`), but `refresh()` resolves `allowNetwork: options.allowNetwork ?? modelNetworkEnabled`, so an explicit `true` overrides it. The credential-change path passes an explicit `true`. `PI_OFFLINE` therefore does not stop the one networked refresh Sero already performs.

**One live misstatement.** Sero writes the session model directly (`setRuntimeSessionModel` sets `agent.state.model`). It does not call `session.setModel`, so it also skips the `clampThinkingLevel` that `setModel` performs at `agent-session.ts:1685` and that session creation performs at `sdk.ts:253`. A refreshed definition that drops a thinking level leaves the session holding a level the model no longer supports.

## Goals / Non-Goals

**Goals:**

- One place decides when the catalog is refreshed, and both the timer and the credential-change path go through it.
- The offline intent has a single implementation shared by both paths.
- A refresh is invisible to the user unless it succeeds, and never blocks startup, a turn, or a session.
- A refreshed model definition reaches live sessions with capability limits respected.

**Non-Goals:**

- Changing what the catalog can express. Provider identity, display name, logo, and auth requirements stay compiled into the Pi package.
- Making retired models disappear. Pi's merge semantics are not reachable through the public surface.
- Fixing Agent Node. Its runtime passes `modelsStorePath: ${root}/models.json`, which reads as a mistaken path for the models config file. That is a separate change.
- Adding any user-visible control, setting, or menu item.

## Decisions

### 1. Trigger: deferred startup refresh plus a six-hour timer

Refresh once after startup, in the background, bounded by a timeout; then repeat every six hours until quit.

Sero already has this shape: `features/updater/updater.ts` runs `void runCheck(false)` then `setInterval(runCheck, 6h)` and clears the timer on `before-quit`. The catalog timer mirrors it, which keeps one pattern for deferred network work in the app.

Alternatives considered:

- **Startup only.** Smallest change, but a Sero window that stays open for days keeps a frozen catalog. Desktop sessions are long-lived here, which removes most of the value.
- **Manual refresh only.** No background network, but it needs a new IPC channel, a new control, and the user has to know the option exists. Deferred, not rejected.
- **On model picker open.** Freshest at the moment of use, but Sero's picker is driven by session state (`buildModelState`) rather than an async fetch, so it is a larger change for a smaller win.

`force` stays `false` on the timer. Pi suppresses a real fetch for four hours per provider, and the interval already exceeds that, so a forced fetch buys nothing and removes the safety net if the timer ever fires twice.

### 2. Offline: one shared guard, keyed on `PI_OFFLINE`

One helper resolves the refresh options. Both callers use it.

```ts
// sketch, not final shape
const offline = isOffline();                 // PI_OFFLINE set to a truthy value
refreshModelAvailability({ allowNetwork: !offline, force: !offline && explicit });
```

`allowNetwork: false` is still a useful call. Pi restores the persisted overlay during the local phase before it checks the network flag, so offline mode keeps serving the cached catalog with zero requests.

Alternatives considered:

- **No guard, fail soft.** The probe shows failures are harmless, so this works. Rejected because the credential-change path would keep ignoring `PI_OFFLINE`, and an air-gapped host would log one failed request per credentialed provider every six hours.
- **A Sero settings toggle.** More discoverable for a desktop user than a `.env` variable, but it is new product surface, needs a renderer change, and needs product consent. Deferred; `PI_OFFLINE` can remain the hard override underneath it.

### 3. Live sessions: reconcile all, then clamp

Keep today's reconciliation and add the missing clamp after the swap:

```text
ensureSessionHasAvailableModel(session)
  refreshed = runtime.getModel(provider, id)
  if (refreshed && refreshed !== current)
    setRuntimeSessionModel(session, refreshed)          // direct write, no session entry
    session.setThinkingLevel(session.thinkingLevel)     // clamps; writes only on change
```

`setThinkingLevel` clamps through `clampThinkingLevel` and only appends a transcript entry and emits events when the level actually changes (`agent-session.ts:1812`). So the clamp is free when nothing changed, and Sero keeps its reason for writing the model directly: calling `session.setModel` would append a `model_change` entry to the session file and check auth on every refresh.

Alternatives considered:

- **Reconcile idle sessions only.** Adds an `isStreaming` guard, and Sero already uses that guard elsewhere (`agent.ts:323`). Slightly safer, but it defers a metadata correction for up to six hours for no proven failure mode. The in-flight request already captured its model object, so the swap cannot affect a stream that is already running.
- **Catalog only, leave sessions alone.** Smallest blast radius, but a corrected context window or cost never reaches a running conversation.

### 4. Home and ownership

A new module owns start, interval, guard, and shutdown. `app-main.ts` starts it once after `initUpdater()` in `app.whenReady()`.

It must not hang off `ensureInfra()`. That function is lazy and heavy (container proxy, plugin dev session manager, app runtime manager) and is called from many places, so attaching a timer there would multiply the schedule.

`app-main.ts` is 475 LOC against a 500 LOC limit, so the diff stays at one import and one call.

### 5. Serialise through the existing queue

`auth-model-refresh.ts` already serialises credential-driven refreshes through a module-level `refreshQueue`. The timer feeds the same queue rather than calling `modelRuntime.refresh` directly.

Pi has a generation guard (`beginProviderRefresh` supersedes an older generation), so overlapping refreshes would not corrupt state. They would still duplicate the post-refresh work: settings cleanup, session reconciliation, and the app-session sync. One queue keeps that work single-shot.

## Risks / Trade-offs

- **[The catalog is unsigned and a model entry carries `baseUrl`.]** A compromised `pi.dev` response could point a credentialed provider at another host. The response advertises an `x-pi-model-catalog-revision` digest that no client verifies. → Accepted for this change; transport is HTTPS and the exposure equals what the Pi CLI already accepts. Mitigation available later without a redesign: `catalogBaseUrl` is a public `create` option, so Sero can point at a Sero-operated mirror. This stays a separate decision and a separate change.

- **[A retired model stays listed.]** `mergeModels` replaces by ID and appends, so upstream removals do not propagate. → Documented as a limitation. No fix exists through the public surface.

- **[New models stay invisible until a credential resolves.]** A provider with no key never fetches, because the network refresh resolves a credential first. → Accepted. The user sees new models for a provider after they configure it, which is when the list matters.

- **[Six-hourly requests against `pi.dev`.]** → Bounded by Pi's four-hour window and `If-None-Match`, so the ceiling is six requests per credentialed provider per day, most answered `304`. No Sero-side caching needed.

- **[OAuth providers may refresh a token to check a catalog.]** → `resolveRefreshCredential` returns a stored token while it is unexpired and only refreshes when it has expired. Pi already refreshes tokens within five minutes of expiry elsewhere, so a catalog tick adds no new class of token traffic.

- **[A refresh can change cost and context metadata mid-conversation.]** → Intended: that is how a correction reaches a running session. The clamp keeps the thinking level valid. Cost applies to the next turn.

- **[`PI_OFFLINE` lives in a `.env` file a desktop user may not know about.]** → Accepted for now; it matches the Pi contract and adds no new concept. The settings toggle is the deferred follow-up if discoverability becomes a problem.

- **[An error every six hours on a network that blocks `pi.dev`.]** → The offline guard is the intended remedy, and the warning path already exists (`refreshWarnings`), so the noise is a console warning rather than a user-visible failure.

## Migration Plan

No data migration. The only new persisted state is one entry per credentialed provider in `~/.sero-ui/agent/models-store.json`, written by Pi. A stale or corrupt store degrades to the built-in catalog.

Rollback is a revert: remove the start call and the timer module. The stored catalog is inert when nothing calls refresh, and the credential-change path returns to its current behaviour.

Ship order matters for the offline guard. The guard must land with the timer, not after it, or the first release would make network requests that `PI_OFFLINE` cannot suppress.

## Open Questions

None that change this design. The catalog-trust decision is recorded above as an accepted risk with a named future mitigation, not as a blocker.
