# Living Loops — Implementation Plan

Builds [specs/12-living-loops.md](specs/12-living-loops.md): the producer half
of event-driven loops plus the engine fixes that block real use. Five phases,
each independently shippable and gated on `pnpm typecheck` + green tests.

## Progress Dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 1 | Event engine core | ✅ Done | Broadcast `fireEvent` with payloads, filters, conditions, fresh-pass/coalescing semantics |
| 2 | Source manager + internal loop events | ✅ Done | Demand-driven adapters; loop→loop triggering with cycle guard |
| 3 | Local adapters: filesystem + webhook | ✅ Done | File changes and local webhooks fire loops |
| 4 | GitHub adapter | ✅ Done | CI/PR/issue events fire loops within the anti-abuse envelope |
| 5 | Planner authoring + UI + docs | ✅ Done | Plain-language prompts produce event triggers; triggers/fired-by/health visible |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-E1 | Broadcast `fireEvent(event)`: exact source, debounce, code-matched filter, model-evaluated condition, `maxFires` | 1 | ✅ |
| FR-E2 | Fresh pass on idle; latest-wins `pendingEvent` coalescing mid-run; `fireCount` always increments | 1 | ✅ |
| FR-E3 | Payload reaches step context as `Observation(source: "event")`; run records `firedBy` | 1 | ✅ |
| FR-E4 | Demand-driven sources: no matching active trigger ⇒ zero background activity; in-process re-sync | 2 | ✅ |
| FR-E5 | GitHub poller: shared per repo, 60s floor, conditional requests, rate-limit backoff, demand-scoped endpoints, restart-safe cursor | 4 | ✅ |
| FR-E6 | Internal `loop:*` events at complete/block/question; self-exclusion + chain-depth cap with warning | 2 | ✅ |
| FR-E7 | Webhook listener loopback-only, per-hook secret, `POST /hooks/<name>` → `webhook:<name>` | 3 | ✅ |
| FR-E8 | Planner authors event/hybrid triggers from the prompt vs. a source catalog; mechanical validation blocks at create | 1 (validation) / 5 (authoring) | ✅ |
| FR-E9 | Filesystem source with debounce + default ignores | 3 | ✅ |
| FR-E10 | Event triggers, fired-by, source health in UI; `eventCondition` round-trips through the library | 1 (round-trip) / 5 (UI) | ✅ |

---

## Phase 1 — Event Engine Core

**Goal.** Everything downstream of an event existing: matching, run semantics,
validation. After this phase a synthetic event (test-injected) drives loops
correctly end to end.

**Tasks**

- [x] Shared types (`shared/event-types.ts`, re-exported from `types.ts`):
  `OrchestratorEvent` (id, source, payload, occurredAt, summary, dedupeKey,
  chainDepth, sourceLoopId) + `EventFiredBy`; `eventCondition?` on
  `LoopTrigger` + `LoopTriggerSuggestion`; `pendingEvent?` on
  `LoopRuntimeState`; `firedBy?` on `LoopRun`; `recentEventKeys` ring on
  `OrchestratorState`.
- [x] Library round-trip: `eventCondition` on `SharedTriggerConfig`
  (`shared/library-types.ts`) and through `toSharedTrigger` /
  `materializeTriggers` (`shared/library.ts`, `runtime/loop-factory.ts`).
- [x] Matching: code half in `runtime/event-match.ts`
  (`codeMatchEventTrigger` — exact source, `eventFilter` predicates with
  strict equality / array = "one of", debounce); fire bookkeeping stays in
  `scheduler.ts` (`applyEventFires`, replacing `fireEventTriggers`).
- [x] `eventCondition` evaluation (`runtime/event-condition.ts`): LOW-tier
  structured model call run **after** code filters pass; an evaluation
  failure skips the fire and logs, never crashes the broadcast.
- [x] Coordinator: broadcast `fireEvent(event)` + stash/drain live in
  `runtime/event-delivery.ts` behind a narrow `CoordinatorRunSeam`; due +
  idle → fresh event pass (engine consumes the event into `firedBy` + an
  `event` observation); due + busy → `pendingEvent` latest-wins, drained
  after the in-flight run ends (and by `tick` after a restart). Engine
  commits preserve coordinator-authored concurrent state (trigger fire
  counters via per-trigger merge, `dueAgain`, un-consumed `pendingEvent`) —
  `run-engine.ts` + `run-engine-helpers.ts`.
- [x] `dedupeKey` backstop: persisted `recentEventKeys` ring drops duplicate
  deliveries across adapter restarts.
- [x] Validation (`runtime/schema.ts`): event/hybrid triggers — known source
  namespace (`shared/constants.ts` `EVENT_SOURCE_NAMESPACES`), flat
  `eventFilter`, `debounceMs >= 0`, bounded `eventCondition`; hybrid needs
  both halves; invalid triggers block at create like cron.
- [x] Tests: `event-match.test.ts`, `coordinator-events.test.ts` (broadcast,
  filter, condition order + verdicts, dedupe, chain-depth cap,
  self-exclusion, parked stash, tick drain, step-task payload),
  coalescing + maxFires in `coordinator-scheduling.test.ts`, schema
  rejections, library round-trip.

**Acceptance**

- [x] A synthetic event fires only matching active loops; the payload is
  visible in the started run's step context.
- [x] Mid-run fires coalesce latest-wins and produce exactly one follow-up
  run.
- [x] A trigger with `eventCondition` calls the model only when code filters
  pass, and the fire follows the model's verdict.
- [x] Invalid event triggers cannot be created; valid ones survive a library
  save/load.
- [x] `pnpm typecheck` passes (18/18, forced full run); no file exceeds 500
  LOC (coordinator/run-engine/types split into event-delivery,
  restart-actions, run-engine-helpers, event-types, index-types).
- [x] FR-E1, FR-E2, FR-E3 satisfied; FR-E8 validation half; FR-E10 round-trip
  half.

---

## Phase 2 — Source Manager + Internal Loop Events

**Goal.** The adapter plumbing, proven with the one source that needs no
external I/O.

**Tasks**

- [x] `runtime/events/manager.ts`: `EventSourceManager` — derives
  `EventSubscription[]` from loop state (active loops, enabled event/hybrid
  triggers with an explicit source), syncs each adapter with its namespace
  slice only when the demand signature changes. Demand is pushed in-process:
  `attachDemandSync` taps `host.updateState` so every persisted mutation
  notifies the manager (no file watching, no timers); started/disposed in
  `runtime/index.ts` beside the cron tick.
- [x] `runtime/events/types.ts`: `EventSourceAdapter` / `EventSubscription` /
  `EmitEvent` interfaces (adapter list empty until Phases 3/4).
- [x] Internal emissions (`runtime/lifecycle-events.ts`, fire-and-forget from
  the coordinator): `loop:completed` / `loop:blocked` when a run finalizes
  with that status, `loop:asked-question` when a step question parks the loop
  or a planner clarification parks a new draft — payloads carry loop
  id/title, run number, reason/prompts.
- [x] Cycle guard: `sourceLoopId` self-exclusion; a run fired by a `loop:*`
  event records `firedBy.chainDepth` and its emissions carry depth + 1;
  depth ≥ 5 drops the fire with the `event-chain-depth` warning.
- [x] Tests: `events-manager.test.ts` (derivation, change-only sync, namespace
  slices, stop on last unsubscribe, dispose, updateState tap),
  `lifecycle-events.test.ts` (emission points reach followers,
  self-exclusion, depth cap).

**Acceptance**

- [x] With zero active event triggers, no adapter is running.
- [x] A follow-up loop fires when its upstream loop completes.
- [x] Two mutually-triggering loops stop at the depth cap with a visible
  warning — no runaway (6 runs total, then the drop warning).
- [x] FR-E4 and FR-E6 satisfied.

---

## Phase 3 — Local Adapters: Filesystem + Webhook

**Goal.** First real-world sources, still zero external-service risk.

**Tasks**

- [x] `runtime/events/fs-adapter.ts`: recursive watch on the workspace root,
  debounced batch payload (`{ paths, count }`), default ignores (`.git`,
  `.sero` — which covers managed worktrees — and `node_modules`), plus a
  filter for the macOS FSEvents root-self artifact. **Deviation from the
  original task text:** path scoping is NOT done via `eventFilter.path` —
  the structured filter matches by equality and cannot express "under
  docs/", so scope conditions belong in `eventCondition` (model-judged),
  keeping the mechanical filter semantics untouched.
- [x] `runtime/events/webhook-adapter.ts`: one `127.0.0.1`-bound HTTP server
  for all hooks; `POST /hooks/<name>` fires `webhook:<name>` with the JSON
  body (size-capped, non-object bodies wrapped); optional per-hook
  shared-secret via the `x-sero-secret` header; the actual port persists in
  adapter state so hook URLs stay stable, with ephemeral fallback when the
  persisted port is taken.
- [x] Adapter state helper (`runtime/events/adapter-state.ts`): one JSON file
  per namespace under the state dir via the host artifact store (webhook
  port/secrets now; GitHub cursors in Phase 4). Corrupt state reads as null.
- [x] Both adapters wired in `runtime/index.ts` with
  `emit = coordinator.fireEvent`; they run only while a matching active
  trigger exists (manager demand) and stop when the last subscriber pauses.
- [x] Tests (`local-adapters.test.ts`): temp-dir watch (debounced batch,
  ignore rules, stop-on-unsubscribe), webhook routing + secret rejection +
  404 + port persistence on an ephemeral port, listener closed without
  subscriptions, adapter-state round-trip.

**Acceptance**

- [x] Editing a watched file fires the loop once per debounce window; ignored
  paths never fire.
- [x] `curl` to the hook fires the loop with the body as payload; a wrong
  secret is rejected; no listener runs when no webhook trigger is active.
- [x] FR-E7 and FR-E9 satisfied.

---

## Phase 4 — GitHub Adapter

**Goal.** GitHub events inside the anti-abuse envelope. The mechanics in
[spec 12 §GitHub adapter](specs/12-living-loops.md#github-adapter-anti-abuse-mechanics)
are requirements, not tuning.

**Tasks**

- [x] Host seam: surface the existing `workspace.runCommand` on
  `OrchestratorHost` (`runtime/host.ts` + one mapping line in
  `runtime/host-adapter.ts`).
- [x] `runtime/events/github-adapter.ts`: one poller per workspace repo shared
  by all subscribers; kinds `pr-opened`, `ci-failed`, `ci-passed`,
  `issue-labelled`, `review-requested`, `review-comment` via `gh api`
  (`{owner}/{repo}` placeholders resolved from the workspace remote; endpoint
  catalog + extraction in `github-kinds.ts`, transport in `github-http.ts`).
- [x] Anti-abuse mechanics: demand-scoped endpoints (no actions/checks calls
  without a `ci-*` subscription); 120s default / 60s floor enforced in code;
  ETag conditional requests; `X-RateLimit-Remaining` threshold ⇒ interval
  doubling with jitter; exponential backoff (capped at 30 min) on any failed
  cycle including 403/429.
- [x] Persisted per-kind cursor (newest-seen item timestamps) + per-endpoint
  ETags via the adapter state helper (`events/github.json`); `dedupeKey` set
  from stable GitHub ids; first poll per kind baselines without emitting
  (subscribing never replays repo history).
- [x] Tests against a fake `runCommand` host (`github-adapter.test.ts`):
  endpoint scoping by subscription, floor enforcement, backoff transitions,
  cursor restart (no replay, no gap), shared-poller dedup across N loops,
  `gh api --include` output parsing, per-kind extraction.

**Acceptance**

- [x] The poller exists only while a `github:*` trigger is active; N loops on
  one repo cost one poll cycle.
- [x] Rate-limit pressure demonstrably slows polling; 304s dominate steady
  state (stored ETag rides every request).
- [x] A CI failure fires the loop with workflow/PR payload; an app restart
  neither replays nor misses events.
- [x] FR-E5 satisfied.

> Note — CI events poll the *workflow runs* list (one endpoint covers both
> `ci-failed` and `ci-passed`), not the per-ref checks API: repo-wide lists
> keep demand scoping coarse and cheap, and the payload carries workflow,
> conclusion, branch, sha, and PR numbers.

---

## Phase 5 — Planner Authoring, UI, and Docs

**Goal.** Users never hand-edit trigger JSON, and everything is visible.

**Tasks**

- [x] Generalized `runtime/schedule-extractor.ts` into
  `runtime/trigger-extractor.ts`: the model maps the prompt onto
  cron/event/hybrid given the source catalog
  (`runtime/events/source-catalog.ts` — one shared block for extractor and
  planner prompts); code validates shape only via the exported
  `validateEventTriggerFields` (no NL parsing in code). Refine re-derives
  events too (`reapplyExtractedTriggers`, nothing removed).
- [x] `runtime/planner-prompt.ts`: EVENT-DRIVEN LOOPS guidance (never author
  watch/poll/wait steps; one pass per occurrence) + the source catalog block
  beside the recurring-cadence section; suggestedTriggers shape extended with
  eventFilter/eventCondition/debounceMs.
- [x] UI: event-trigger chips on loop detail AND create review (the review
  stage now renders the same `LoopMetaStrip`); each chip shows the source with
  filter/condition/debounce/enabled-state in its hover title, disabled state
  dimmed (`· off`) — display-only, matching the "changed with Refine, never a
  form" product rule; "fired by" chip (source + chain depth, summary on hover)
  on run history rows via `firedBy` added to `LoopRunSummary` +
  `toRunSummary`; one compact source-health row (GitHub last-checked /
  backing-off from persisted `lastPolledAt`/`throttledUntil`, webhook port) in
  the meta strip, shown only for sources the loop uses. Pure formatting in
  `ui/lib/trigger-summary.ts`.
- [x] `/orchestrator` command + `orchestrator` tool: both paths verified end
  to end by integration tests — prompt-derived event triggers (extractor →
  applyPlanningResponse → materializeTriggers) and explicit
  `CreateLoopOptions.triggers` (which win over extraction). The tool schema
  deliberately exposes no trigger params: triggers are authored from the
  prompt (LLM-first, no forms).
- [x] Docs: `reference/orchestrator.md` Triggers section rewritten (plain-
  language authoring, event source table, filters/conditions, demand-driven
  sources, chain cap, GitHub anti-abuse behavior, health line);
  `guide/orchestrator.md` intro now covers event-driven loops and links the
  source table.
- [x] Tests: extractor fixtures ("when CI fails on my PRs…" ⇒ event+condition,
  "every morning and when docs/ changes…" ⇒ hybrid, invented-source repair,
  filter/debounce carry, suggestion-key tolerance), merge semantics, UI lib
  tests for trigger chips / fired-by / source health
  (`trigger-extractor.test.ts`, `trigger-summary.test.ts`, two new
  planning-integration cases).

**Acceptance**

- [x] "When CI fails on a PR I opened, fix it" creates a valid event trigger
  (source + condition) with no manual JSON.
- [x] Triggers, fired-by, and source health are visible and uncluttered.
- [x] Docs-site reflects the feature.
- [x] FR-E8 and FR-E10 fully satisfied; matrix green.

---

## Post-completion — end-to-end verification (2026-07-02)

A real-app Playwright spec (`apps/desktop/e2e/living-loops.agent.spec.ts`,
agent layer; `SERO_E2E_REAL_HOME=1` to run against the developer profile)
drives the full journey in Sero desktop: plain-English prompt → planner +
trigger extractor author a `webhook:deploy` event trigger → activate →
demand-started listener → real `curl` fires the loop → the run records
`firedBy`, a background agent writes the payload line → disable stops the
listener, enable restores it → delete. **5/5 passing**; screenshots in
`apps/desktop/e2e/screenshots/living-loops/` (gitignored).

The e2e found one real bug, fixed in `fix(orchestrator): event loops must
outlive their runs`: `isRecurring` ignored event triggers, so an event-only
loop's first ordinary completion was terminal (the loop died after one pass).
Also closed in that commit: terminal completion now disables event triggers
alongside cron, and a mid-run `pendingEvent` stranded by the loop leaving
`active` is dropped with a visible `event-dropped` warning instead of
lingering as a stale fire. Regression tests in `coordinator-events.test.ts`
("event loops and completion") and `scheduler.test.ts`.

## Standing rules for every phase

- `pnpm typecheck` from the repo root before every commit; zero errors.
- No source file over 500 LOC — split (`runtime/events/` is expected to grow
  as sibling modules, not one file).
- No `useEffect` where a store action or `subscribe()` works; no
  `localStorage`.
- Conventional Commits; work on a feature branch off `main`.
- Progress: tick the checkboxes, dashboard, and FR matrix in **this file** as
  each task lands — not just in commit messages.
