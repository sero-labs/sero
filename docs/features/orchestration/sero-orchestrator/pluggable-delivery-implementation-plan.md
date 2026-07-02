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
| 3 | Receipt contract: enforcement, persistence, verify-back | ⬜ Not started | Completion without a valid receipt ⇒ `needs-revision`; receipts persist, feed context, verify back for pr/artifact |
| 4 | External approval gate | ⬜ Not started | External sends require an approved human-input record in the run — mechanically |
| 5 | Availability warning + UI + docs | ⬜ Not started | `delivery-tool-missing` lifecycle; picker, chips, receipt links; docs-site updated |
| 6 | End-to-end verification | ⬜ Not started | Real-app delivery e2e passes (approval-gated external send + receipt in UI) |

Status legend: ✅ Done · 🟡 In progress · ⬜ Not started · ⛔ Blocked · 🟦 Deferred.

## FR Traceability Matrix

| FR | Requirement | Phase | Status |
| --- | --- | --- | --- |
| FR-D1 | User-chosen destination + params; planner never chooses; existing loops default to today's behavior | 1 (model) / 5 (picker UI) | 🟡 model half |
| FR-D2 | Per-destination planner rules replace the hardcoded ternary; placement rules stay orthogonal | 2 | ✅ |
| FR-D3 | Declared destination completes only with a structurally valid `DeliveryReceipt`; otherwise `needs-revision` + bounded repair | 3 | ⬜ |
| FR-D4 | External destinations require an approved human-input record in the run before a receipt is accepted | 4 | ⬜ |
| FR-D5 | `delivery-tool-missing` warns at activation, re-checks each run start, fails through normal recovery | 5 | ⬜ |
| FR-D6 | Receipts persist on `runtime.deliveries`, feed future run context, render as links, appear in the outcome notification | 3 (data/context/notification) / 5 (UI links) | ⬜ |
| FR-D7 | `pr` receipts verified against the PR list; `saved-artifact` receipts against file existence | 3 | ⬜ |
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

- [ ] `StepCompletion.receipt?: DeliveryReceipt`
  (`shared/recovery-types.ts:49-58`), carried onto `CompletionSignal`
  (`recovery-types.ts:38-47`); `parseStepOutcome` /
  `parseStepOutcomeStrict` (`executors/prompt.ts`) pass it through.
- [ ] `runtime/delivery/delivery-contract.ts` (pure, mirrors
  `route-contract.ts`): `receiptRequirement(loop, step)` (final step +
  effective destination ≠ `workspace-files`), structural validation
  (destination matches the loop's declared destination, non-empty `ref` /
  `summary`, valid `deliveredAt` — format checks only),
  `enforceDeliveryContract(loop, step, outcome)` downgrading to
  `needs-revision`, `formatDeliveryContract` (task-prompt text, used by
  Phase 2's layer 1) and `formatDeliveryRepair` (repair prompt).
- [ ] Wire the layers: repair validate in `outcomeRepair`
  (`executors/common.ts:26-36`) checks the receipt like it checks route
  variables (same `maxAttempts: 2`); engine backstop call beside
  `enforceRouteContract` at `run-engine.ts:261`. `run-engine.ts` is at 503
  LOC — move enough into `run-engine-helpers.ts` (or a new sibling) to land
  under 500.
- [ ] Persistence: `LoopRuntimeState.deliveries?: DeliveryReceipt[]`
  (`shared/types.ts`, beside `pullRequests`), appended in
  `recordCompletion` (`runtime/outcomes.ts:114`) when the completion is
  accepted, capped (keep the newest ~20, like digest retention).
- [ ] Future-run context: `deliveriesContext(loop, step)` in
  `executors/prompt.ts` mirroring `openPullRequestsContext` ("already
  shipped — do not re-deliver").
- [ ] Verify-back (async, engine-side after the structural pass — the pure
  contract stays pure): `pr` receipt cross-checked against
  `host.listPullRequests()` (the `run-engine.ts:197` reconcile pattern);
  `saved-artifact` receipt path checked for existence via
  `host.runCommand` (`test -f`, management-plane observation — same
  carve-out as `listPullRequests`). A verify-back failure downgrades the
  outcome exactly like a missing receipt.
- [ ] Run summary data: `delivery?` on `LoopRunSummary`
  (`shared/index-types.ts:80-93`) populated in `toRunSummary`
  (`runtime/store.ts:64-83`) from the run's completion receipt (rendered in
  Phase 5).
- [ ] Outcome notification: `outcomeNotification`
  (`runtime/notify-outcome.ts:25`) includes the receipt ref/summary on
  completion.
- [ ] Tests: contract downgrade paths (missing / malformed / wrong-destination
  receipt), repair-then-accept, `workspace-files` exempt, guard-skipped
  final step exempt, deliveries append + cap, context injection, verify-back
  pass/fail for pr and saved-artifact, notification content,
  `toRunSummary` mapping.

**Acceptance**

- [ ] A final step claiming completion without a valid receipt lands in
  `needs-revision` and routes through normal recovery after bounded repair.
- [ ] A valid receipt persists on `runtime.deliveries`, appears in the next
  run's step context, and rides the outcome notification.
- [ ] A `pr` receipt whose PR isn't in the live list, or a `saved-artifact`
  receipt whose file doesn't exist, is rejected.
- [ ] FR-D3, FR-D7, and FR-D6 (data/context/notification) satisfied.

---

## Phase 4 — External Approval Gate

**Goal.** `email-send`, `chat-post`, `webhook-post` cannot ship without a
human approval recorded in the run — the durable mechanism is the only path.

**Tasks**

- [ ] Human-input extensions (`shared/human-input-types.ts`):
  `HumanQuestion.kind?: 'approval'` + `attachment?: string` (the draft);
  `PendingInput.runId?` + `AnsweredInput.runId?`. `parseHumanQuestions`
  (`runtime/human-input.ts:46-58`) parses the new fields; `parkForInput`
  stamps `runId` (run in scope at its `run-engine.ts:331` call site);
  `recordAnswer` carries it onto the answered record.
- [ ] Approval step marker: `gate?: 'approval'` on the plan step
  (`shared/types.ts` step type); `validateStepShape`
  (`runtime/schema.ts:115-143`) accepts it; `buildStepTask` for a gated step
  instructs: present the draft as an `approval` question with the draft as
  `attachment`, do not send in this attempt.
- [ ] Plan-shape validation: for external destinations, `validateLoopPlan`
  requires at least one `gate: 'approval'` step that the final step
  (transitively) depends on — enforced at create/refine and re-checked by
  `planIsActivatable` (`runtime/plan-mapping.ts:214-222`).
- [ ] Planner rules: external destinations' `plannerRules` (registry) require
  the draft → approval-gated step → send shape and explain the `gate` field.
- [ ] Mechanical backstop in `enforceDeliveryContract`: a receipt for an
  `external` destination is accepted only if `loop.answeredInputs` contains
  a record for the current run (`runId === run.id`) whose `approval`
  question was answered with its approve choice — otherwise
  `needs-revision`, with a repair/summary message saying approval is
  missing (the agent cannot talk its way past it).
- [ ] **Verify run identity across park/resume**: confirm `answer_input` →
  `runNext` (`coordinator.ts:234-242`) resumes the same `waiting` run (same
  `run.id`) rather than opening a new one. If a new run is created, match on
  "answered after this run started AND the gated step is in this run's
  `startedStepIds`" instead — decide from what the code actually does, and
  record the finding here.
- [ ] UI: `InputRequestCard` (and the home-inbox `AttentionInputCard`) render
  `attachment` as a scrollable draft block under the prompt; approve/reject
  quick-picks already render via `choices`.
- [ ] Tests: schema acceptance/rejection of `gate`, external-plan validation
  (missing approval step blocks), gate backstop (no approval / rejected /
  approved-in-a-different-run ⇒ downgrade; approved-in-this-run ⇒ accept),
  `runId` stamping through park → answer → resume, question parse with
  kind/attachment, card rendering of the attachment.

**Acceptance**

- [ ] An external-destination plan without an approval step cannot be created
  or activated.
- [ ] A send claimed without an approved input in the run downgrades to
  `needs-revision`; after the user approves (draft visible on the card), the
  same machinery accepts the receipt.
- [ ] A rejection leaves nothing sent and the loop parked/recovering — never a
  silent send.
- [ ] FR-D4 satisfied.

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
