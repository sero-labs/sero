# Pluggable Delivery Destinations — Implementation Plan

Builds [specs/13-pluggable-delivery.md](specs/13-pluggable-delivery.md): the
loop's destination becomes a first-class user setting with an enforced
`DeliveryReceipt` proof, replacing the two hardcoded prompt strings in
`planner-prompt.ts`. Six phases, each independently shippable and gated on
`pnpm typecheck` + green tests, one commit per phase on
`feat/orchestrator-living-loops`.

## Progress Dashboard

| Phase | Title | Status | Exit gate |
| --- | --- | --- | --- |
| 1 | Delivery as a loop setting | ✅ Done | `delivery` on the loop, create paths, `set_delivery`, library round-trip |
| 2 | Destination registry + planner rules | ✅ Done | Per-destination planner rules replace the two-string ternary; placement stays orthogonal |
| 3 | Receipt contract: enforcement, persistence, verify-back | ✅ Done | Completion without a valid receipt ⇒ `needs-revision`; receipts persist, feed context, verify back for pr/artifact |
| 4 | External approval gate | ✅ Done | External sends require an open (un-consumed) approved human input — mechanically |
| 5 | Availability warning + UI + docs | ⬜ Not started | `delivery-tool-missing` lifecycle; picker, chips, receipt links; docs-site updated |
| 6 | End-to-end verification | ⬜ Not started | Real-app delivery e2e passes (approval-gated external send + receipt in UI) |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-D1 | User-chosen destination + params; planner never chooses; existing loops default to today's behavior | 1 (model) / 5 (picker UI) | 🟡 model half |
| FR-D2 | Per-destination planner rules replace the hardcoded ternary; placement rules stay orthogonal | 2 | ✅ |
| FR-D3 | Declared destination completes only with a structurally valid `DeliveryReceipt`; otherwise `needs-revision` + bounded repair | 3 | ✅ |
| FR-D4 | External destinations require an approved human-input record in the run before a receipt is accepted | 4 | ✅ (open-approval variant — see finding) |
| FR-D5 | `delivery-tool-missing` warns at activation, re-checks each run start, fails through normal recovery | 5 | ⬜ |
| FR-D6 | Receipts persist on `runtime.deliveries`, feed future run context, render as links, appear in the outcome notification | 3 (data/context/notification) / 5 (UI links) | 🟡 data half |
| FR-D7 | `pr` receipts verified against the PR list; `saved-artifact` receipts against file existence | 3 | ✅ |
| FR-D8 | `delivery` round-trips through the Loop Library (optional field, `schemaVersion` stays 1) | 1 | ✅ |

---

## Design decisions folded in (beyond the spec text)

The spec leaves four mechanics unspecified; these are the choices this plan
implements. Flag now if any should change:

1. **Approval steps get a static plan marker.** Human input today is purely a
   runtime behavior (a step emits `questions` in its outcome) — nothing on a
   plan step says "this one asks for approval", so FR-D4's create-time
   validation ("external plans contain an approval step before the final
   step") has nothing to check. New optional step field `gate: 'approval'`:
   the planner authors it (model-authored, code validates the shape), schema
   validation requires one on a pre-final step for external destinations, and
   the step-task prompt for a gated step instructs the agent to present the
   draft and ask. Runtime parking/resume rides the existing human-input
   machinery unchanged.
2. **Answered inputs learn which run they belong to.** `AnsweredInput` has no
   run linkage (`shared/human-input-types.ts:52-59`), so "the current run
   contains a matching approved input" is currently unanswerable.
   `PendingInput` + `AnsweredInput` gain `runId?` (stamped by `parkForInput`,
   which the run-engine calls with the run in scope at `run-engine.ts:331`).
   **Superseded in Phase 4**: resume opens a NEW run, so same-run matching is
   impossible — the gate uses open-approval consumption instead (`consumedAt`
   on `AnsweredInput`); `runId` still links a question to the asking run.
3. **Approval is structured, not inferred.** `HumanQuestion` gains
   `kind?: 'approval'` and `attachment?` (the draft body, rendered in the
   input cards). An approval is "approved" iff the recorded answer picks the
   question's `approve` choice — format validated in code, never text-guessed.
4. **Receipt required on final-step success.** The engine backstop fires when
   the final step (`finalizationStepId`) reports `succeeded` and the effective
   destination isn't `workspace-files` — mirroring the route contract, which
   only enforces on `succeeded`. A guard-skipped final step produces no
   completion and needs no receipt (a "nothing to ship this pass" run stays
   legal for recurring loops).

Known-good seams this plan reuses (from code exploration):

- 3-layer contract pattern: task-prompt contract → in-session repair
  (`executors/common.ts:26-36`, `maxAttempts: 2`) → engine backstop
  (`enforceRouteContract` call at `run-engine.ts:261`).
- Warning lifecycle to copy: `model-unavailable` is recorded per run
  (`run-engine.ts:264`) and cleared at the next run start
  (`run-engine.ts:125`) — not activation-scoped.
- `runtime.pullRequests` (`shared/types.ts:289`) + `openPullRequestsContext`
  (`executors/prompt.ts:78`) are the persistence/context precedent — but
  deliveries **append** (like warnings) rather than replace each run.
- Prompt-block injection precedent: `buildEventSourceCatalogBlock()` spliced
  into `buildPlanningTask` (`planner-prompt.ts:158`).
- Live tool catalog: `host.listToolCatalog()` (`runtime/host.ts:180`), with
  the agent-catalog check at `executors/common.ts:72-76` as the
  fail-soft-match precedent.

---

## Phase 1 — Delivery as a Loop Setting

**Goal.** `delivery` exists on the loop, is user-settable at create and later,
defaults to today's behavior, and round-trips through the library. No behavior
change yet — the planner still uses the old ternary.

**Tasks**

- [x] Shared types (`shared/delivery-types.ts`, re-exported from `types.ts`):
  `DELIVERY_DESTINATION_IDS` const tuple → `DeliveryDestinationId` (7 ids),
  `LoopDeliverySettings { destination; params? }`, `DeliveryReceipt
  { destination; ref; summary; deliveredAt }`, plus the renderer-safe
  `DELIVERY_DESTINATIONS` display table (id, label, `external` flag,
  param-field hints for the UI) with `isDeliveryDestinationId` /
  `isExternalDestination` / `deliveryDestinationInfo` helpers.
- [x] `Loop.delivery?: LoopDeliverySettings` (`shared/types.ts`, beside
  `workspace`); `effectiveDelivery(loop)` pure helper — derived default
  `useManagedWorktree ? 'pr' : 'workspace-files'` (back-compat, no state
  migration). **Note:** no `DEFAULT_DELIVERY` merge — `delivery` stays
  absent unless the user chose one, so an undecided loop keeps tracking
  later placement changes (closer to the spec's back-compat rule than a
  frozen create-time default).
- [x] Create paths: `CreateLoopOptions.delivery?` (`shared/actions.ts`);
  `buildDraftLoop` carries `options.delivery`; flat `deliveryDestination`
  (StringEnum) / `deliveryParamsJson` params on the `orchestrator` tool
  (`extension/tools.ts` — `buildDelivery` helper shared by create and
  set_delivery); `/orchestrator create --deliver <destination> <prompt>` and
  `/orchestrator set_delivery <loopId> <destination>` (`extension/commands.ts`,
  destination validated at the parse boundary).
- [x] `set_delivery` action: `shared/actions.ts` union + coordinator case →
  `applyOverride` → pure `applyLoopDelivery(loop, delivery, now)` in
  `runtime/plan-mapping.ts`; `create` validates `options.delivery` before
  building the draft.
- [x] Validation (`runtime/schema.ts` `validateDeliverySettings`): destination
  must be a known id; `params` a flat object of string/number/boolean;
  invalid delivery blocks at create/set.
- [x] Library round-trip: `SharedLoopDefinition.delivery?`
  (`shared/library-types.ts`, `schemaVersion` stays 1), cloned in
  `toSharedDefinition` (`shared/library.ts`) and `instantiate`
  (`runtime/library.ts`). Params copy verbatim on load in v1 (workspace
  adaptation is spec 14's clarify flow).
- [x] Tests (20 new; 560 total green): `shared/__tests__/delivery.test.ts`
  (table/external flags, `effectiveDelivery` derivation + explicit-wins +
  placement tracking), schema rejections, coordinator `set_delivery`
  happy/invalid/create-validation, tool `buildAction` + `parseCommand`
  paths, library round-trip both directions.

**Acceptance**

- [x] A loop created with no delivery behaves exactly as today
  (`effectiveDelivery` derives pr / workspace-files from placement).
- [x] `set_delivery` persists and survives restart; invalid destinations are
  rejected at the boundary.
- [x] Save → load through the library preserves `delivery`; old saved
  definitions (no field) still load.
- [x] `pnpm typecheck` passes (18/18); no file over 500 LOC (`shared/types.ts`
  trimmed to 480 by extracting `shared/trigger-types.ts`).
- [x] FR-D1 (model half) and FR-D8 satisfied.

---

## Phase 2 — Destination Registry + Planner Rules

**Goal.** The two-string ternary is gone: the planner receives the declared
destination's rules, its receipt shape, and its params — placement (worktree
commit hygiene) becomes an orthogonal block.

**Tasks**

- [x] `runtime/delivery/registry.ts`: `DeliveryDestinationSpec` per spec
  (`plannerRules`, `requiredTools`, `external`, `receiptHint`) for all 7
  destinations, as a `Record` over the id union (typecheck-enforced
  completeness); `label`/`external` derived from the shared
  `DELIVERY_DESTINATIONS` table so they cannot drift. Required tools
  confirmed against the live plugins: `chat-post` → `mcp`
  (`sero-mcp-plugin/extension/tools/proxy-tool.ts`), `email-draft` /
  `email-send` → `gmail` (`sero-google-plugin/extension/index.ts`); the
  other four need none.
- [x] `runtime/planner-prompt.ts`: `WORKTREE_DELIVERY` /
  `WORKSPACE_ROOT_DELIVERY` deleted; `buildPlacementBlock(useManagedWorktree)`
  (commit hygiene on the worktree branch / leave-in-tree at root) +
  `buildDeliveryBlock(spec, params)` (plannerRules + declared params verbatim
  + receipt-hint sentence, skipped for `workspace-files`). The `pr` rules
  absorb the legacy worktree text including review-open-PRs-first.
  `buildPlanningTask` refactored to a single `PlanningTaskArgs` object (6
  positional params was past the limit).
- [x] Plumbed: `PlanRequest.delivery` (required), fed from
  `effectiveDelivery(draft)` in `runPlanningFlow` (covers create AND
  answer-input re-plans); `PLANNING_SYSTEM_PROMPT` delivery sentence now
  says the rule depends on the declared destination, and the
  planner-never-chooses rule covers destination alongside placement.
- [x] Final-step receipt contract (layer 1 of 3): `formatDeliveryContract`
  lives in `runtime/delivery/delivery-contract.ts` (created now so Phase 3's
  enforcement layers join it there); `buildStepTask` appends it to the
  final-step completion instruction via `effectiveDelivery(loop)` — empty
  for `workspace-files`. Note: the emitted `completion.receipt` is parsed and
  enforced in Phase 3; in this phase the contract text is present but the
  field is still dropped by `parseCompletion`.
- [x] Tests (16 new; 576 total green): registry completeness/external
  lockstep/required tools/approval staging, `formatDeliveryContract` shape +
  workspace-files empty, per-destination planning-task injection + params
  verbatim + placement independence + legacy pr/workspace-files text intact,
  planner plumbing (destination + params reach the task), step-task contract
  on final step only / derived-pr default / workspace-files exempt.

**Acceptance**

- [x] For each destination, the planning task contains its rules and receipt
  hint; worktree/root placement text is unchanged by destination choice.
- [x] `pr` loops plan the same delivery steps as before the refactor (no
  regression in the two legacy behaviors — asserted on the legacy phrases).
- [x] FR-D2 satisfied.

---

## Phase 3 — Receipt Contract: Enforcement, Persistence, Verify-back

**Goal.** The no-hollow-delivery layer: a completion claim without proof
downgrades to `needs-revision`; accepted receipts persist, feed future runs,
and are cross-checked where a read API is free.

**Tasks**

- [x] `StepCompletion.receipt?` + `CompletionSignal.receipt?`
  (`shared/recovery-types.ts`); `parseCompletion`/`parseReceipt` in
  `executors/prompt.ts` pass a well-formed receipt through and reject a
  malformed one with a precise repair reason (format only — whether one is
  REQUIRED is the contract's call).
- [x] `runtime/delivery/delivery-contract.ts` (pure): `receiptRequirement`
  (final step + effective destination ≠ workspace-files; a guard-skipped
  final step never reports, so it is exempt naturally), `deliveryProblems`
  (missing receipt / destination mismatch / empty ref/summary / unparseable
  `deliveredAt`; a `blocked` completion needs no receipt — nothing was
  delivered), `enforceDeliveryContract` + `downgradeDelivery`,
  `formatDeliveryContract` (layer 1), `formatDeliveryRepair` (layer 2 text).
- [x] Layers wired: `outcomeRepair` (`executors/common.ts`) validates the
  receipt after the route check (same `maxAttempts: 2`); engine backstop
  via `applyDeliveryContract` wrapping `enforceRouteContract` in `runBatch`
  — and `enforceDeliveryContract` also guards the **accept-step recovery
  path**, so a recovery decision cannot smuggle in an unproven completion.
  `run-engine.ts` trimmed 503 → 484 (blockRuntime/blockLimit/
  resetStepPending moved to `run-engine-helpers.ts`).
- [x] Persistence: `LoopRuntimeState.deliveries?` APPENDS in
  `recordCompletion` on both completion paths (recurring-iteration and
  terminal), capped at the newest 20 (`MAX_DELIVERIES`).
- [x] Future-run context: `deliveriesContext` (newest 5) in `buildStepTask`,
  mirroring `openPullRequestsContext` ("do not re-deliver — judge overlap
  yourself").
- [x] Verify-back (`runtime/delivery/verify-receipt.ts`): `pr` against a
  fresh `listPullRequests()` (url match), `saved-artifact` via
  `runCommand("test -f …")` with relative refs resolved against the loop's
  resolved cwd (runCommand runs at the workspace ROOT — a worktree file
  would otherwise never be found). Fail-soft when the observation itself
  errors (no gh / no shell): the structural contract already passed;
  verify-back tightens where it can, never adds a failure mode. A
  verify-back failure downgrades exactly like a missing receipt.
- [x] `LoopRunSummary.delivery?` populated in `toRunSummary` from
  `completionSignal.receipt` (rendered in Phase 5).
- [x] `outcomeNotification` appends "Delivered: <summary> (<ref>)." on
  completion.
- [x] Tests (22 new; 598 total green): pure contract paths, repair-in-session
  (layer 2 via the fake host's repair simulation), engine refusal +
  recovery consult, verified completion end-to-end (deliveries + run
  summary + notification), verify-back pass/fail/fail-soft for pr and
  saved-artifact, workspace-files exempt, recurring append + cap-at-20,
  receipt parse accept/reject, deliveries context injection. Note: seeded
  fixture loops now carry `delivery: workspace-files` explicitly so
  completion-machinery tests stay receipt-free; delivery tests override it.

**Acceptance**

- [x] A final step claiming completion without a valid receipt lands in
  `needs-revision` and routes through normal recovery after bounded repair.
- [x] A valid receipt persists on `runtime.deliveries`, appears in the next
  run's step context, and rides the outcome notification.
- [x] A `pr` receipt whose PR isn't in the live list, or a `saved-artifact`
  receipt whose file doesn't exist, is rejected.
- [x] FR-D3, FR-D7, and FR-D6 (data/context/notification) satisfied.

---

## Phase 4 — External Approval Gate

**Goal.** `email-send`, `chat-post`, `webhook-post` cannot ship without a
human approval recorded in the run — the durable mechanism is the only path.

**Tasks**

- [x] Human-input extensions (`shared/human-input-types.ts`):
  `HumanQuestion.kind?: 'approval'` + `attachment?: string`;
  `PendingInput.runId?` + `AnsweredInput.runId?` +
  `AnsweredInput.consumedAt?` (see the finding below).
  `parseHumanQuestions` parses kind/attachment and GUARANTEES an approval
  question carries the `approve`/`reject` choice-id pair: compliant model
  choices are kept, anything else is replaced by the standard pair — ids
  are the contract, labels are never guessed, no positional mapping.
  `parkForInput` stamps `runId` (run in scope at the run-engine call site);
  `recordAnswer` copies it onto the answered record.
- [x] Approval step marker: `gate?: 'approval'` on the plan step;
  `validateStepShape` accepts exactly that value; `buildStepTask` for a
  gated step injects the gate contract — present the FULL exact content as
  an `approval` question (`attachment`), never deliver in this step, and on
  re-run record the decision variable instead of re-asking.
- [x] Plan-shape validation: `approvalGateProblems(plan, delivery)` requires a
  pre-final `gate: 'approval'` step the single sink transitively depends on
  for external destinations — wired into `validatePlanningResponse(…,
  delivery)` (so the planner's ONE repair pass can fix a missing gate) and
  re-checked by `planIsActivatable` via `effectiveDelivery(loop)` (covers a
  post-planning `set_delivery` to an external destination). Note: in a
  valid single-sink plan every step is an ancestor of the sink, so the
  ancestor walk only tightens invalid multi-sink shapes (where it falls
  back to gate-exists; single-sink validation rejects those anyway).
  Split into `runtime/delivery/validate.ts` (with
  `validateDeliverySettings`) — `schema.ts` had crossed 500 LOC (now 469);
  schema re-exports both.
- [x] Planner rules: `EXTERNAL_STAGING` (registry) now names the `gate:
  "approval"` field, the produces/when wiring, the final-step dependency,
  and the rejection behavior ("deliver nothing, complete as blocked");
  the system prompt's step-shape JSON documents `"gate": "approval"?`.
- [x] Mechanical backstop: `deliveryProblems` (now `(loop, delivery,
  outcome)`) refuses an external receipt unless `hasOpenApproval(loop)` —
  an `approval` question answered with choiceId `approve` and not yet
  consumed. `recordCompletion` consumes ALL open approvals when an external
  receipt is accepted (`consumeApprovals`): one approval authorizes exactly
  one send, so a stale approval can never cover a later unapproved send.
  Rides the existing 3 layers (repair prompt + engine backstop +
  accept-step guard) unchanged.
- [x] **Run-identity finding (recorded per the plan)**: `answer_input` →
  `runNext` does NOT resume the parked run — the engine mints a NEW run id
  every `execute()` and the parked run finalizes as `waiting`; the answer
  lands BETWEEN runs, so neither "runId === current run" nor "answered
  after this run started" can ever match. The gate therefore uses the
  open-approval/consumption model above instead of same-run matching;
  `runId` on pending/answered inputs links a question to the run that
  ASKED it (history/e2e assertions), not the run that acts on the answer.
  Verified by test: park in run 1, answer, resume opens run 2 ≠ run 1.
- [x] UI: `InputRequestCard` and the home-inbox `AttentionQueue` card render
  `attachment` as a scrollable `<pre>` draft block under the prompt;
  approve/reject quick-picks render via the existing `choices` path.
  (No component-level unit tests exist in ui/__tests__ — pure-lib only — so
  the card rendering is verified by the Phase 6 e2e.)
- [x] Tests (15 new; 613 total green): approval-question parsing (compliant
  pair kept, non-compliant replaced, ordinary questions untouched), gate
  marker accept/reject, external plan-shape validation + planner-response
  rejection + activation block, gated-step task contract, open/rejected/
  consumed approval predicates, consumption stamping, engine paths (no
  approval refused / approved accepted then consumed / rejected never
  sends / consumed never covers a second send), runId park→answer
  stamping + new-run-on-resume finding.

**Acceptance**

- [x] An external-destination plan without an approval step cannot be created
  (planner validation + repair) or activated (`planIsActivatable`).
- [x] A send claimed without an open approved input downgrades to
  `needs-revision`; with the approval recorded (draft visible on the card),
  the same machinery accepts the receipt and consumes the approval.
- [x] A rejection leaves nothing sent and the loop parked/recovering — never a
  silent send.
- [x] FR-D4 satisfied (open-approval variant).

---

## Phase 5 — Availability Warning, UI, and Docs

**Goal.** Users pick and see destinations everywhere loops surface; missing
tools warn without blocking; docs cover the feature.

**Tasks**

- [ ] `delivery-tool-missing` warning: new `LoopWarning` code
  (`shared/types.ts:140`); recorded when the destination's `requiredTools`
  aren't all in `host.listToolCatalog()` — checked at activation
  (`coordinator.ts` activate path) and at each run start; cleared at run
  start alongside `model-unavailable` (`run-engine.ts:125`) so it
  re-evaluates every run. Fail-soft: the loop still activates/runs; a step
  that actually needs the missing tool fails into normal recovery.
- [ ] Create flow: destination `Select` + per-destination param fields in the
  Safety/settings card of `CreateLoopForm.tsx` (beside the `#loop-worktree`
  switch, driven by the shared `DELIVERY_DESTINATIONS` table — 
  self-explanatory, no sub-labels); submit carries `delivery` through
  `createLoop` (`OrchestratorApp.tsx:130-142`).
- [ ] Loop detail: `LoopDeliveryControl` (the `LoopContextControl` pattern) in
  the controls row of `LoopDetail.tsx:74-78` dispatching `set_delivery`; a
  destination chip in `LoopMetaStrip.tsx` beside the workspace-isolation
  chip (params in the hover title), shown on create-review too.
- [ ] Run history: receipt link in `AttemptHistory.tsx` `RunRow` from
  `LoopRunSummary.delivery` — external `ref`s (URLs) open via a proper
  anchor (first outbound link in this UI — verify the shell's
  `window.open` → external-browser handling), non-URL refs (draft ids,
  artifact paths) render as text with the summary in the hover title.
- [ ] Warning surfacing: `delivery-tool-missing` renders wherever
  `model-unavailable` warnings already render (no new UI).
- [ ] Docs: `apps/docs-site/docs/reference/orchestrator.md` — Delivery
  section (destination table, params, receipts, approval gate for external
  sends, tool-availability behavior);
  `apps/docs-site/docs/guide/orchestrator.md` — destination examples in the
  intro flow.
- [ ] Tests: warning lifecycle (record at activation, re-check + clear per
  run), UI lib tests for destination chip / receipt link formatting
  (pure helpers in `ui/lib/`, the `trigger-summary.ts` pattern),
  create-form submit carries delivery, `set_delivery` dispatch marshalling.

**Acceptance**

- [ ] A user can pick a destination + params at create, change it later, and
  see it on the loop and in create-review.
- [ ] A `chat-post` loop activated without the `mcp` tool shows the warning,
  runs anyway, and the warning clears once the tool appears.
- [ ] Delivered runs show a clickable/readable receipt in run history.
- [ ] Docs-site reflects the feature; matrix rows FR-D1, FR-D5, FR-D6 fully
  green.

---

## Phase 6 — End-to-End Verification

**Goal.** The full journey proven in the real desktop app, following the
`living-loops.agent.spec.ts` mechanics (agent layer, `SERO_E2E_REAL_HOME=1`,
scratch-workspace reuse, screenshots).

**Tasks**

- [ ] `apps/desktop/e2e/delivery.agent.spec.ts`: create a loop with an
  **external** destination (`webhook-post` to a `127.0.0.1` listener the
  spec owns — exercises the approval gate with zero external services):
  plain-English prompt → destination picked in the form → plan contains a
  `gate: 'approval'` step → run parks with the draft on the input card →
  approve in the UI → the POST arrives at the listener → receipt recorded
  in `runs/index.json` + receipt link visible in run history. Also a
  `saved-artifact` happy path (no approval) asserting verify-back
  (file exists) and the receipt chip.
- [ ] Negative path in the same spec: reject the approval → nothing arrives
  at the listener; run does not complete with a receipt.
- [ ] Living Loops loose end folded in: a live **gh-authenticated GitHub
  adapter** pass (the Phase-4 adapter has only ever run against fakes) —
  gated on `gh auth status` succeeding, skipped otherwise; a real repo
  event (e.g. a label on a scratch issue) fires the loop. Kept a separate
  `test.describe` so it can be skipped independently.
- [ ] Screenshots to `apps/desktop/e2e/screenshots/delivery/` (gitignored);
  reuse of the existing scratch workspace pattern (the registered
  "Living Loops e2e" workspace stays as is, per Dan).
- [ ] Record findings + any product fixes in this file (the Living Loops
  post-completion section pattern); real bugs get their own
  `fix(orchestrator):` commit.

**Acceptance**

- [ ] Delivery e2e passes: approval-gated external send lands only after UI
  approval, with the receipt visible end to end.
- [ ] Rejection provably sends nothing.
- [ ] Live GitHub pass green (or explicitly skipped with the gate noted).

---

## Standing rules for every phase

- `pnpm typecheck` from the repo root before every commit; zero errors.
- No source file over 500 LOC — `shared/types.ts` (497) and
  `run-engine.ts` (503) are at the cap already: new delivery code lands in
  `shared/delivery-types.ts` and `runtime/delivery/`, and touching
  `run-engine.ts` includes moving weight out.
- No heuristics for LLM tasks: the model authors receipts, approval
  questions, and delivery steps; code validates format only.
- No `useEffect` where a store action or `subscribe()` works; no
  `localStorage`.
- Conventional Commits, one commit per phase, on
  `feat/orchestrator-living-loops`; never push.
- Progress: tick the checkboxes, dashboard, and FR matrix in **this file** as
  each task lands — not just in commit messages.
