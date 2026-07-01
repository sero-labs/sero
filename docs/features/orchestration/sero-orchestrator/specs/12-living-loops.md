# 12 — Living Loops (event-driven triggers)

Status: **draft — direction approved, decisions confirmed 2026-07-01**.

Cron loops check on a schedule; event loops react when something happens. The
trigger data model (`type: "event" | "hybrid"`, `eventSource`, `eventFilter`,
`debounceMs`, `maxFires`) and the coordinator entrypoint (`fireEvent`) already
exist and are tested — but nothing in the product ever produces an event. This
spec adds the producer half and fixes the engine gaps that block real use.

Example loops this enables:

```text
When CI fails on a PR this loop opened, diagnose, fix, and push.
When an issue is labelled agent-ready, classify it and start or block a fix.
When loop X completes, run this follow-up loop.
When files under docs/ change, check the docs site still builds.
```

## Current state and gaps

The consume side is complete: `Coordinator.fireEvent` (`runtime/coordinator.ts`)
matches event/hybrid triggers by exact `eventSource` string with debounce and
`maxFires` (`fireEventTriggers`, `runtime/scheduler.ts`). Five gaps:

1. **No payload.** `fireEvent(loopId, eventSource)` carries a bare string. An
   event cannot say *which* PR failed or *what* changed, and `eventFilter` has
   nothing to match against — it is stored but never read.
2. **Loop-targeted, not broadcast.** A source knows "CI failed", not which loops
   care. The caller must already hold a `loopId`.
3. **Wrong run semantics.** An event fire calls `runNext`, which advances the
   in-flight pass. Cron fires go through `runFreshPass` (drop worktree, re-arm
   plan). Events need the cron semantics: each fire is a fresh iteration.
4. **No producers.** No watcher, poller, webhook listener, or internal emitter
   exists anywhere in the repo.
5. **The planner can't author event triggers.** `schedule-extractor.ts` is
   cron-only, the planner prompt has no event guidance, and `schema.ts`
   validates only cron schedules.

## Decisions (confirmed)

1. **Sources live in the orchestrator runtime** behind one adapter interface,
   started/disposed with the runtime exactly like the cron tick. No desktop-core
   event bus in v1. Knowledge-worker sources (email, calendar, Slack) arrive
   later via a cross-plugin bus that plugs in as just another adapter.
2. **GitHub events arrive by polling `gh`** in v1. The adapter interface is
   push-shaped, so a webhook source (Tailscale Funnel, hosted relay) can replace
   the poller later without engine changes.
3. **Abuse of external services must be structurally impossible** (hard
   requirement): demand-driven sources, one shared poller per repo, conditional
   requests, rate-limit backoff, and a cadence floor in code — see
   [GitHub adapter](#github-adapter-anti-abuse-mechanics).
4. **Fresh pass per fire; latest-wins coalescing mid-run.** A due event on an
   idle active loop re-arms a fresh pass (cron semantics). If a run is in
   flight, the fire is recorded and the *latest* pending event is consumed when
   the run ends — one pending fire maximum, older ones coalesce away.
5. **Filtering is split by kind, never heuristic.** Structured field predicates
   (`eventFilter`) are matched in code. Natural-language conditions
   (`eventCondition`, new) are evaluated by a model call at fire time. Code
   never parses natural language; the model never re-implements exact matching.
6. **Payloads land in run context** as an `Observation` with `source: "event"`
   (the enum value already exists), so the plan's steps see what fired them.
7. **The planner authors event triggers** from the user's prompt against a
   catalog of available sources; validation stays mechanical.
8. **v1 sources:** internal loop events, filesystem, GitHub (polling), and a
   generic local webhook.

## Data model

New shared type:

```ts
/** One occurrence emitted by a source adapter. */
interface OrchestratorEvent {
  id: string;
  /** Namespaced source id, e.g. "github:ci-failed", "loop:completed". */
  source: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  /** Adapter-provided identity for restart-safe dedupe (e.g. check-run id). */
  dedupeKey?: string;
  /** Loop-event chain depth; incremented when a fire was itself caused by a
   *  loop event. Guards against loop→loop trigger cycles. */
  chainDepth?: number;
}
```

Source ids are namespaced strings: `loop:*`, `fs:*`, `github:*`, `webhook:*`.
Matching stays exact (no wildcards in v1).

`LoopTrigger`, `LoopTriggerSuggestion`, and `SharedTriggerConfig` gain one
field; `eventFilter` finally gets defined semantics:

```ts
interface LoopTrigger {
  // …existing fields…
  /** Flat field predicates matched in code against payload top-level fields
   *  (strict equality; arrays mean "payload value is one of"). */
  eventFilter?: Record<string, unknown>;
  /** Natural-language condition evaluated by a model call at fire time,
   *  e.g. "the failing PR was opened by this loop". Never parsed by code. */
  eventCondition?: string;
}
```

Coalesced pending fire on the loop:

```ts
interface LoopRuntimeState {
  // …existing fields…
  /** Latest event that fired while a run was in flight; consumed (and cleared)
   *  when the run ends. Latest-wins — at most one pending fire. */
  pendingEvent?: OrchestratorEvent;
}
```

`LoopRun` records what started it: alongside the existing `triggerId`, a run
started by an event stores a compact `firedBy?: { source: string; occurredAt:
string; summary: string }`.

Adapter cursors (GitHub last-seen state, webhook config) persist in a small
state file per adapter under the app state dir via the existing `host.appState`
primitives — durable across restarts, no new storage mechanism.

## Coordinator changes

`fireEvent` is replaced (it has no production callers) by a broadcast form:

```ts
fireEvent(event: OrchestratorEvent): Promise<void>
```

For each **active** loop, for each enabled event/hybrid trigger:

1. `eventSource` exact match (cheap, code);
2. debounce window check (existing code);
3. `eventFilter` predicate match against `event.payload` (code);
4. `eventCondition`, if set — one structured LOW-tier model call answering
   "does this payload satisfy the condition?" (reuses the existing
   structured-call machinery). Runs last so debounce and code filters bound the
   model-call volume;
5. `maxFires` / self-disable via the existing `fire()` path.

Then per due loop: idle → `runFreshPass` with the event injected as an
`Observation(source: "event")`; run in flight → `runtime.pendingEvent = event`
(latest wins), consumed at run end through the existing rerun-request seam.
Every fire increments `fireCount` whether it runs immediately or coalesces.

**Cycle guard for internal events:** a loop's own events never match its own
triggers, and a fire caused by a `loop:*` event carries `chainDepth + 1`;
events at `chainDepth >= 5` are dropped with a loop warning. Debounce and
`maxFires` remain the user-level brakes.

## Event source manager and adapters

The runtime owns an `EventSourceManager`, started/disposed in
`runtime/index.ts` beside the cron tick:

```ts
interface EventSubscription {
  loopId: string;
  eventSource: string;
  /** Structured filter fields an adapter may use to narrow its watching
   *  (e.g. only poll the checks API when a ci-* subscription exists). */
  eventFilter?: Record<string, unknown>;
}

interface EventSourceAdapter {
  /** The source namespace this adapter owns, e.g. "github". */
  namespace: string;
  /** Called with the current active subscriptions in this namespace whenever
   *  demand changes. An empty list means stop all activity. */
  sync(subscriptions: EventSubscription[]): void;
  emit: (event: OrchestratorEvent) => void; // injected; routes to fireEvent
  dispose(): void;
}
```

**Demand-driven, push-recomputed.** The manager derives subscriptions from
loop state and re-syncs adapters after every coordinator mutation (in-process
call, not a file watch — consistent with the no-polling rule). A source with no
active matching trigger does **zero** background work: pause the loop and the
poller stops.

### `loop:*` — internal events (no adapter)

The coordinator emits directly at its own lifecycle points: `loop:completed`
and `loop:blocked` from run finalization, `loop:asked-question` when a
human-input request is raised. Payload: loop id/title, run number, completion
or block summary. Pure push, ships first, and is the seed of Loop Composition
later.

### `fs:changed`

Recursive watcher on the workspace root (or subpaths named in
`eventFilter.path`), debounced batch payload of changed paths. Default ignores:
`.git`, `.sero`, `node_modules`, the managed worktrees dir. Runs in Electron
main inside the runtime; no host seam needed.

### GitHub adapter (anti-abuse mechanics)

Event kinds v1: `github:pr-opened`, `github:ci-failed`, `github:ci-passed`,
`github:issue-labelled`, `github:review-requested`, `github:review-comment`.

Poller mechanics — these are requirements, not tuning suggestions:

- **One poller per workspace repo**, shared by every subscribing loop. Ten
  loops watching the same repo cost one poll cycle.
- **Demand-scoped endpoints:** only the endpoints implied by live
  subscriptions are queried (no checks API traffic unless a `ci-*`
  subscription exists).
- **Cadence floor in code:** default interval 120s, minimum 60s enforced in
  the adapter — configuration can slow it, never speed it past the floor.
- **Conditional requests:** `ETag`/`If-None-Match` on every poll; 304
  responses don't count against the GitHub rate limit.
- **Rate-limit awareness:** read the `X-RateLimit-Remaining` headers `gh`
  returns; below a threshold, double the interval (with jitter) until the
  window resets. On 403/429, exponential backoff.
- **Persisted cursor:** last-seen ids/timestamps per event kind survive
  restart, so a relaunch neither replays old fires nor misses the gap
  (`dedupeKey` backstops at the coordinator).

Auth is the user's ambient `gh` login — same as the existing
`listPullRequests` seam. No tokens stored.

### `webhook:<name>`

One localhost HTTP listener for all webhook sources, bound to `127.0.0.1`
only; `POST /hooks/<name>` fires `webhook:<name>` with the JSON body as
payload. Optional shared-secret header per hook. Port persisted in adapter
state and shown in the UI. Exposing it beyond loopback (e.g. Tailscale) is the
user's choice and out of scope.

## Planner integration

- `schedule-extractor.ts` generalizes into a trigger extractor: the model maps
  the user's prompt onto cron, event, or hybrid triggers given a catalog of
  available event sources injected into the prompt. The LLM authors
  `eventSource`/`eventFilter`/`eventCondition`; code only validates shape —
  no natural-language parsing in code (house rule).
- `planner-prompt.ts` gains event-trigger guidance beside the existing
  recurring-cadence section.
- `schema.ts` validates event/hybrid triggers: known source namespace,
  `eventFilter` is a flat object, `debounceMs >= 0`, `eventCondition` is a
  bounded string. Invalid triggers block at create exactly like invalid cron.

## Host seams

One addition: surface the existing `AppRuntimeHost.workspace.runCommand` on
`OrchestratorHost` (one mapping line in `host-adapter.ts`) so the GitHub
adapter can call `gh api`. This is management-plane observation — the same
carve-out as the dirty-workspace preflight and `listPullRequests` in
[02-integration-seams.md](02-integration-seams.md): it watches, it never
performs workflow work. Filesystem watching, the webhook listener, and cursor
persistence all use capabilities the runtime already has.

## UI

- **Trigger display** on loop detail and the create review step: event triggers
  render as "Fires when `github:ci-failed`" plus their filter/condition; the
  existing enable/disable control applies.
- **Run history:** a "fired by" chip on runs started by events (`firedBy`).
- **Source health:** one compact row when sources are active — GitHub "last
  checked / backing off", webhook "listening on port N". Nothing more (no
  clutter).

## Functional requirements

- **FR-E1** `fireEvent(event)` broadcasts to all active loops; matching =
  exact source, debounce, code-matched `eventFilter`, model-evaluated
  `eventCondition` (in that order); `maxFires` self-disable honored.
- **FR-E2** A due fire on an idle loop starts a fresh pass (cron semantics);
  during an in-flight run it coalesces latest-wins into `pendingEvent` and is
  consumed when the run ends. Every fire increments `fireCount`.
- **FR-E3** The firing event's payload reaches step context as an
  `Observation` with `source: "event"`, and the run records `firedBy`.
- **FR-E4** Sources are demand-driven: no active matching trigger ⇒ zero
  background activity; adapters re-sync on loop state changes without a
  restart, via in-process push.
- **FR-E5** The GitHub poller is shared per repo, respects a 60s floor, uses
  conditional requests, backs off on rate-limit pressure, scopes endpoints to
  live subscriptions, and never duplicates or replays fires across restarts.
- **FR-E6** Internal `loop:*` events fire at completion, block, and
  human-input points; a loop never triggers itself, and chain depth is capped
  with a visible warning on drop.
- **FR-E7** The webhook listener binds loopback-only, supports per-hook shared
  secrets, and routes `POST /hooks/<name>` to `webhook:<name>`.
- **FR-E8** The planner can author event/hybrid triggers from a plain-language
  prompt against the source catalog; validation is mechanical and blocks at
  create like cron validation.
- **FR-E9** The filesystem source debounces and applies default ignores.
- **FR-E10** Event triggers, fired-by, and source health are visible in the
  UI; event triggers round-trip through the Loop Library
  (`SharedTriggerConfig` carries `eventCondition`).

## Out of scope (v1)

- Email, calendar, Slack, and other connector-backed sources — they need the
  cross-plugin event bus; the adapter interface here is the socket they plug
  into.
- Push transport for GitHub (Funnel/relay webhooks) — replaces the poller
  behind the same adapter later.
- Wildcard/prefix source matching, cross-workspace events, event replay UI.
- Any code-side natural-language interpretation — conditions are the model's
  job, always.
