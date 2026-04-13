# Refactoring Plan — packages/app-runtime/src

_Plan drafted: 2026-04-13_

## Executive Summary
`packages/app-runtime/src` is small, important, and mostly well-scoped, but it
currently leaks exactly the kinds of boundary debt that become expensive once
plugins depend on them: explicit type escape hatches at the module-federation
singleton / preload bridge seams, duplicated shared contracts in `sero-bridge`,
and an optimistic `useAppState()` implementation that assumes persistence never
fails. The package does not need a redesign; it needs a focused hardening pass
that keeps the host↔remote API stable while making the shared runtime contracts
more canonical and reliable.

## Issues Found (prioritized)
- **High** — Type escape hatches sit directly on the host↔remote boundary —
  `packages/app-runtime/src/context.ts:34-41`,
  `packages/app-runtime/src/widget-registry.ts:42-55`, and
  `packages/app-runtime/src/sero-bridge.ts:93-101` use `globalThis as any` or
  `window as unknown as ...` at the exact seams that every federated app uses.
  These violate the monorepo’s no-escape-hatches rule and hide drift in the
  singleton/bridge contracts. Effort: **M**.

- **Medium** — `sero-bridge.ts` duplicates neutral shared contracts instead of
  importing the canonical ones — `packages/app-runtime/src/sero-bridge.ts:31-82`
  redefines model-group and bridge-result shapes that already exist either in
  `packages/common/src/model-selection.ts:25-39` or desktop preload typings.
  That means host and remote contracts can drift independently while both still
  typecheck locally. Effort: **M**.

- **Medium** — `useAppState()` can leave remote UI state ahead of disk —
  `packages/app-runtime/src/use-app-state.ts:33-73` optimistically updates React
  state, starts async watches without cancellation, and fire-and-forgets
  `appState.write()` without awaiting or catching failures. If the IPC write
  fails or the component unmounts during an in-flight read/watch, plugin state
  can become stale or silently diverge. Effort: **M**.

- **Low** — Runtime widget registration republishes on ordinary rerenders —
  `packages/app-runtime/src/use-widget-registration.ts:7-18,52-80` documents an
  inline-literal usage pattern, but the hook depends on `defaultSize` /
  `minSize` / `maxSize` by object identity and calls `registerWidget()` on every
  identity change. `packages/app-runtime/src/widget-registry.ts:62-77` then
  republishes a fresh snapshot to all listeners even if the widget key is
  unchanged. Effort: **S**.

- **Low** — The package has no direct focused tests for its pure runtime seams —
  there are no package-local tests for singleton identity, app-state write
  failure handling, or runtime widget registration semantics. Effort: **S**.

## Proposed Refactoring
1. **Replace the boundary `any`/cast patterns with typed globals and ambient window typing.**
   - Add typed `globalThis` declarations for `__sero_app_context__` and
     `__sero_widget_registry__`.
   - Add a local ambient `Window` augmentation for optional `sero` access so
     `getSeroApi()` can read `window.sero` without `unknown as`.
   - Keep the singleton strategy exactly the same; change only the typing model.

2. **Delete duplicate neutral contracts from `sero-bridge.ts`.**
   - Import model-group contracts from `@sero/common` once the shared-package
     fix pass lands.
   - Keep app-runtime-specific bridge interfaces (`SeroAppStateBridge`,
     `SeroAppAgentBridge`, `SeroModelsBridge`) here, but stop redefining neutral
     model info/group shapes and any result types that already have a canonical
     owner.
   - If a bridge result type truly belongs to the host↔remote contract rather
     than `@sero/common`, extract it into a small dedicated shared contract file
     instead of burying it inside `sero-bridge.ts`.

3. **Harden `useAppState()` around failure and lifecycle edges.**
   - Preserve the simple `[state, updateState]` API.
   - Add cancellation / liveness guards for the async `watch()` bootstrap.
   - Handle `appState.write()` failures explicitly instead of silently assuming
     the watcher will confirm persistence.
   - Decide one explicit failure policy for the hook: rollback optimistic state,
     force a re-read, or surface an error callback/state channel.
   - Keep the hook renderer-friendly and avoid introducing new effect-driven
     derived state.

4. **Make widget registration idempotent for stable definitions.**
   - Normalize the registration input so unchanged widget definitions do not
     republish snapshots on every render.
   - Preserve the intentional sticky-registration behavior after app unmount.
   - A small memoized definition helper or registry-level equality short-circuit
     is preferable to adding more hook-level effects.

5. **Add focused runtime coverage before refactoring the shared seams.**
   - Cover:
     - singleton identity across duplicate module evaluation
     - `getSeroApi()` missing-bridge failure
     - `useAppState()` successful watch bootstrap + write failure path
     - sticky but idempotent widget registration semantics
   - Reuse the existing desktop test environment if adding a standalone package
     runner is unnecessary churn.

## Benefits & Trade-offs
- Benefits: removes hard-rule type escapes from a foundational shared runtime,
  reduces cross-package contract drift, makes plugin state persistence more
  trustworthy, and keeps dashboard widget registration from producing accidental
  listener churn.
- Trade-offs: fixing shared bridge types will touch both `@sero-ai/app-runtime`
  and `@sero/common`, and hardening `useAppState()` may force a more explicit
  error policy than current consumers rely on today.

## Dependencies & Risks
- The contract-dedupe work depends on the adjacent `packages/common/src` pass,
  because that package should own the neutral model contracts before app-runtime
  starts importing them.
- `useAppState()` changes are behavior-sensitive: plugin UIs likely rely on the
  current optimistic feel, so any rollback/reload policy must keep successful
  writes feeling immediate while making failures explicit.
- Widget-registration changes must preserve the current dashboard invariant that
  a widget keeps rendering even after the main app view unmounts.
- The singleton typing cleanup must not break the module-federation dev-mode
  guarantee documented in `context.ts` and `widget-registry.ts`.

## Next Steps
1. Pair this plan with `docs/deslopify/packages/common/src/plan.md` and treat
   shared model-contract dedupe as one cross-package batch.
2. In the first `fix-slop` batch for this package, remove the three boundary
   type escape hatches before touching behavior.
3. Then harden `useAppState()` failure/lifecycle behavior with focused tests.
4. Finish by making widget registration idempotent for unchanged definitions.

Verification checklist for the future fix pass:
- Federated app mounts still share one `AppContext` and one widget registry in
  Vite/module-federation dev mode.
- Plugin UIs still read initial app state, receive watch updates, and persist
  writes through the desktop host.
- Dashboard widgets remain available after the full app view unmounts.
- Monorepo `pnpm typecheck` stays green across desktop and every plugin UI that
  imports `@sero-ai/app-runtime`.
