# Living Loops — Implementation Plan

Builds [specs/12-living-loops.md](specs/12-living-loops.md): the producer half
of event-driven loops plus the engine fixes that block real use. Five phases,
each independently shippable and gated on `pnpm typecheck` + green tests.

## Progress Dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 1 | Event engine core | ⬜ Not started | Broadcast `fireEvent` with payloads, filters, conditions, fresh-pass/coalescing semantics |
| 2 | Source manager + internal loop events | ⬜ Not started | Demand-driven adapters; loop→loop triggering with cycle guard |
| 3 | Local adapters: filesystem + webhook | ⬜ Not started | File changes and local webhooks fire loops |
| 4 | GitHub adapter | ⬜ Not started | CI/PR/issue events fire loops within the anti-abuse envelope |
| 5 | Planner authoring + UI + docs | ⬜ Not started | Plain-language prompts produce event triggers; triggers/fired-by/health visible |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-E1 | Broadcast `fireEvent(event)`: exact source, debounce, code-matched filter, model-evaluated condition, `maxFires` | 1 | ⬜ |
| FR-E2 | Fresh pass on idle; latest-wins `pendingEvent` coalescing mid-run; `fireCount` always increments | 1 | ⬜ |
| FR-E3 | Payload reaches step context as `Observation(source: "event")`; run records `firedBy` | 1 | ⬜ |
| FR-E4 | Demand-driven sources: no matching active trigger ⇒ zero background activity; in-process re-sync | 2 | ⬜ |
| FR-E5 | GitHub poller: shared per repo, 60s floor, conditional requests, rate-limit backoff, demand-scoped endpoints, restart-safe cursor | 4 | ⬜ |
| FR-E6 | Internal `loop:*` events at complete/block/question; self-exclusion + chain-depth cap with warning | 2 | ⬜ |
| FR-E7 | Webhook listener loopback-only, per-hook secret, `POST /hooks/<name>` → `webhook:<name>` | 3 | ⬜ |
| FR-E8 | Planner authors event/hybrid triggers from the prompt vs. a source catalog; mechanical validation blocks at create | 1 (validation) / 5 (authoring) | ⬜ |
| FR-E9 | Filesystem source with debounce + default ignores | 3 | ⬜ |
| FR-E10 | Event triggers, fired-by, source health in UI; `eventCondition` round-trips through the library | 1 (round-trip) / 5 (UI) | ⬜ |

---

## Phase 1 — Event Engine Core

**Goal.** Everything downstream of an event existing: matching, run semantics,
validation. After this phase a synthetic event (test-injected) drives loops
correctly end to end.

**Tasks**

- [ ] Shared types (`shared/types.ts`): `OrchestratorEvent` (id, source,
  payload, occurredAt, dedupeKey, chainDepth); `eventCondition?` on
  `LoopTrigger` + `LoopTriggerSuggestion`; `pendingEvent?` on
  `LoopRuntimeState`; `firedBy?` on `LoopRun`.
- [ ] Library round-trip: `eventCondition` on `SharedTriggerConfig`
  (`shared/library-types.ts`) and through `toSharedTrigger` /
  `materializeTriggers` (`shared/library.ts`, `runtime/loop-factory.ts`).
- [ ] Matching (`runtime/scheduler.ts`, split an `event-match.ts` helper if it
  crowds 500 LOC): extend `fireEventTriggers` to take the event — exact
  source, debounce, then `eventFilter` predicates against payload top-level
  fields (strict equality; array value = "one of").
- [ ] `eventCondition` evaluation: LOW-tier structured model call (reuse
  `structured-call.ts` machinery) run **after** code filters pass; a
  condition-evaluation failure skips the fire and logs, never crashes the
  broadcast.
- [ ] Coordinator (`runtime/coordinator.ts`): replace the loop-targeted
  `fireEvent(loopId, source)` with broadcast `fireEvent(event)`; due + idle →
  `runFreshPass` with the event injected as `Observation(source: "event")`
  and `firedBy` on the run; due + run in flight → `pendingEvent` latest-wins,
  consumed at run end through the existing rerun seam; `fireCount` increments
  on every fire.
- [ ] `dedupeKey` backstop: recently-seen keys (persisted small ring) drop
  duplicate deliveries across adapter restarts.
- [ ] Validation (`runtime/schema.ts`): event/hybrid triggers — known source
  namespace, flat `eventFilter` object, `debounceMs >= 0`, bounded
  `eventCondition` length; invalid triggers block at create like cron.
- [ ] Tests: matching order (filter before condition; condition call count),
  coalescing (two fires mid-run ⇒ one follow-up run with the latest payload),
  fresh-pass vs the old fold-in behavior, dedupe, schema rejections, library
  round-trip.

**Acceptance**

- [ ] A synthetic event fires only matching active loops; the payload is
  visible in the started run's step context.
- [ ] Mid-run fires coalesce latest-wins and produce exactly one follow-up
  run.
- [ ] A trigger with `eventCondition` calls the model only when code filters
  pass, and the fire follows the model's verdict.
- [ ] Invalid event triggers cannot be created; valid ones survive a library
  save/load.
- [ ] `pnpm typecheck` passes; no file exceeds 500 LOC.
- [ ] FR-E1, FR-E2, FR-E3 satisfied; FR-E8 validation half; FR-E10 round-trip
  half.

---

## Phase 2 — Source Manager + Internal Loop Events

**Goal.** The adapter plumbing, proven with the one source that needs no
external I/O.

**Tasks**

- [ ] `runtime/events/manager.ts`: `EventSourceManager` — derives
  `EventSubscription[]` from loop state, calls `adapter.sync()` per namespace;
  re-synced by an in-process hook after every coordinator mutation (no file
  watching, no timers); started/disposed in `runtime/index.ts` beside the
  cron tick.
- [ ] `runtime/events/types.ts`: `EventSourceAdapter` / `EventSubscription`
  interfaces from the spec.
- [ ] Internal emissions: coordinator emits `loop:completed`, `loop:blocked`
  (finalize paths) and `loop:asked-question` (human-input raise) with loop
  id/title, run number, and summary payloads.
- [ ] Cycle guard: a loop's events never match its own triggers; fires caused
  by `loop:*` events carry `chainDepth + 1`; events at depth ≥ 5 are dropped
  with a `LoopWarning`.
- [ ] Tests: demand start/stop (pause last subscriber ⇒ adapter told to stop),
  emission points, self-exclusion, depth cap warning.

**Acceptance**

- [ ] With zero active event triggers, no adapter is running.
- [ ] A follow-up loop fires when its upstream loop completes.
- [ ] Two mutually-triggering loops stop at the depth cap with a visible
  warning — no runaway.
- [ ] FR-E4 and FR-E6 satisfied.

---

## Phase 3 — Local Adapters: Filesystem + Webhook

**Goal.** First real-world sources, still zero external-service risk.

**Tasks**

- [ ] `runtime/events/fs-adapter.ts`: recursive watch on the workspace root
  (or `eventFilter.path` subpaths), debounced batch payload of changed paths,
  default ignores (`.git`, `.sero`, `node_modules`, managed worktrees dir).
- [ ] `runtime/events/webhook-adapter.ts`: one `127.0.0.1`-bound HTTP server
  for all hooks; `POST /hooks/<name>` fires `webhook:<name>` with the JSON
  body; optional per-hook shared-secret header; port persisted in adapter
  state.
- [ ] Adapter state helper: small per-adapter state file via `host.appState`
  (webhook port now; GitHub cursors in Phase 4).
- [ ] Tests: temp-dir watch (debounce window, ignore rules), webhook routing +
  secret rejection on an ephemeral port, listener absent without webhook
  subscriptions.

**Acceptance**

- [ ] Editing a watched file fires the loop once per debounce window; ignored
  paths never fire.
- [ ] `curl` to the hook fires the loop with the body as payload; a wrong
  secret is rejected; no listener runs when no webhook trigger is active.
- [ ] FR-E7 and FR-E9 satisfied.

---

## Phase 4 — GitHub Adapter

**Goal.** GitHub events inside the anti-abuse envelope. The mechanics in
[spec 12 §GitHub adapter](specs/12-living-loops.md#github-adapter-anti-abuse-mechanics)
are requirements, not tuning.

**Tasks**

- [ ] Host seam: surface the existing `workspace.runCommand` on
  `OrchestratorHost` (`runtime/host.ts` + one mapping line in
  `runtime/host-adapter.ts`).
- [ ] `runtime/events/github-adapter.ts`: one poller per workspace repo shared
  by all subscribers; kinds `pr-opened`, `ci-failed`, `ci-passed`,
  `issue-labelled`, `review-requested`, `review-comment` via `gh api`.
- [ ] Anti-abuse mechanics: demand-scoped endpoints (no checks calls without a
  `ci-*` subscription); 120s default / 60s floor enforced in code; ETag
  conditional requests; `X-RateLimit-Remaining` threshold ⇒ interval doubling
  with jitter; exponential backoff on 403/429.
- [ ] Persisted per-kind cursor (last-seen ids/timestamps) via the adapter
  state helper; `dedupeKey` set from stable GitHub ids.
- [ ] Tests against a fake `runCommand` host: endpoint scoping by
  subscription, floor enforcement, backoff transitions, cursor restart
  (no replay, no gap), shared-poller dedup across N loops.

**Acceptance**

- [ ] The poller exists only while a `github:*` trigger is active; N loops on
  one repo cost one poll cycle.
- [ ] Rate-limit pressure demonstrably slows polling; 304s dominate steady
  state.
- [ ] A CI failure fires the loop with PR/check-run payload; an app restart
  neither replays nor misses events.
- [ ] FR-E5 satisfied.

---

## Phase 5 — Planner Authoring, UI, and Docs

**Goal.** Users never hand-edit trigger JSON, and everything is visible.

**Tasks**

- [ ] Generalize `runtime/schedule-extractor.ts` into a trigger extractor: the
  model maps the prompt onto cron/event/hybrid given an injected catalog of
  available sources; code validates shape only (no NL parsing in code).
- [ ] `runtime/planner-prompt.ts`: event-trigger guidance + the source catalog
  block beside the existing recurring-cadence section.
- [ ] UI: event triggers rendered on loop detail + create review (source,
  filter, condition, enable/disable); "fired by" chip on run summaries
  (`ui/lib/run-summary.ts` + components); one compact source-health row
  (GitHub last-checked/backing-off, webhook port) — nothing more.
- [ ] `/orchestrator` command + `orchestrator` tool: create options accept
  event triggers (already flow through `CreateLoopOptions.triggers`); verify
  end to end.
- [ ] Docs: update the orchestrator pages in `apps/docs-site` (triggers,
  sources, anti-abuse behavior) per the pre-PR docs rule.
- [ ] Tests: extractor fixtures ("when CI fails on my PRs…", "every morning
  and when docs/ changes…" ⇒ hybrid), UI lib tests for trigger/fired-by
  formatting.

**Acceptance**

- [ ] "When CI fails on a PR I opened, fix it" creates a valid event trigger
  (source + filter + condition) with no manual JSON.
- [ ] Triggers, fired-by, and source health are visible and uncluttered.
- [ ] Docs-site reflects the feature.
- [ ] FR-E8 and FR-E10 fully satisfied; matrix green.

---

## Standing rules for every phase

- `pnpm typecheck` from the repo root before every commit; zero errors.
- No source file over 500 LOC — split (`runtime/events/` is expected to grow
  as sibling modules, not one file).
- No `useEffect` where a store action or `subscribe()` works; no
  `localStorage`.
- Conventional Commits; work on a feature branch off `main`.
- Progress: tick the checkboxes, dashboard, and FR matrix in **this file** as
  each task lands — not just in commit messages.
