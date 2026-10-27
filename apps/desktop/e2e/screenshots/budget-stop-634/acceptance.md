# Issue 634: owned cancellation technical slice

Base: `71eba954be54f36762367db4956a80f5011a7ebb` on
`fix/v1-634-owned-cancellation`.

This is a bounded technical slice, not whole-issue acceptance. The product
question about paid directive and decision wakes on an already exhausted cap
is unanswered. Their existing exception and its test remain unchanged. Issue
634 must stay open until that decision is implemented or explicitly retained.

## Behavior and evidence

- Project Stop requests cancellation of retained milestone and research Rooms
  and Workflows, including legacy charter projects. Workflow disable verifies
  retained project attribution. Unrelated user work is not selected. Pause
  remains graceful. `linked-work.test.ts` checks legacy Stop, unrelated Rooms
  and the durable cancellation result; `dispatch-handle.test.ts` checks a
  different project's Workflow cannot be disabled.
- Record writes notify active owner, direct research and evidence operations
  when known spend reaches the cap. Direct research retains usage reported
  after cancellation. `project-usage.test.ts` covers a concurrent charge
  exhausting the cap and a cancelled child reporting additional usage.
  Existing owner-session tests cover owner charges, delegated charges, cap
  reductions and the deliberately retained manual-wake exception.
- Room planning receives an abort signal. Its usage is charged before member
  start; exhausted budget cancels the prepared Room while retaining its id.
  `dispatch-handle.test.ts` verifies no grant/member start follows that charge.
- Subagent single, parallel and chain tool calls receive the existing tool
  abort signal. `integration.test.ts` checks cancellation leaves another
  parent's child running and does not start the next chain step.
- A real Pi session with a local fake provider carries Stop through native
  Code Mode into a waiting subagent tool. The existing real-process test proves
  the local POSIX shell's descendant exits after cancellation. These ran once,
  together, with disposable state and no paid provider.
- Evidence commands forward cancellation through the existing runtime
  streaming path. Docker and Apple Container remain supported; killing their
  local CLI does not prove every remote process has stopped. The durable
  cancellation detail and UI state this uncertainty, including late usage.
- Owner cancellation waits for supported abort completion before flushing
  usage and disposing its handle. An unresponsive owner abort is bounded to
  15 seconds and reported as unconfirmed. Interrupted provider responses are
  marked incomplete. User Stop remains the blocked reason when a late child
  failure arrives; cancellation cause and detail survive restart.

## Accounting boundary

Persistent owner/member sessions intentionally omit stock subagent tools in
`persistent-sessions/wiring.ts` through `enableAgentManagementTools: false`.
Their approved platform/Code Mode tools do not independently create model
requests. Architect's reachable direct research/capture requests use
`runProjectModel` and its cumulative `onUsage` deltas. Workflow model requests
forward `onUsage` through `host-adapter.ts`; Room/Workflow aggregate usage is
charged by the existing dispatch/research watchers. Those paths retain their
original run attribution and monotonic checkpoints for late reports.

No second accounting engine or speculative charges were added. Missing usage
remains incomplete rather than zero-complete. The cap is not an exact final
spend ceiling: in-flight requests can finish or report additional usage.

## Validation

Raw logs: `/private/tmp/sero-v1-tools/634-logs/`.

- Architect focused checks: 45 tests passed; two suites initially blocked by
  an async callback transform error passed after correction, 17 tests.
- Orchestrator focused checks: 37 tests passed.
- Single bounded desktop fake-provider/process campaign: 5 files, 26 tests
  passed. No retry, paid model, full tools matrix or other runtime campaign.
- Architect package suite: 82 files, 891 tests passed.
- Orchestrator package suite: 193 passed files, one skipped; 1865 tests passed,
  one skipped.
- Root typecheck: 29 tasks passed after fixing nullable-workspace errors.
- React Doctor changed scope: 100/100, no issues.
- Repository layout and changed-source 500-LOC checks passed.

Final bounded checks after the last edits: owner-session/linked-work, 45 tests
passed (`final-owner-stop.log`); root typecheck, 29 tasks passed
(`typecheck-commit.log`); React Doctor, 100/100 (`react-doctor-final.log`).
Repository layout, whitespace and changed-source LOC checks passed. The
largest changed source is `coordinator.ts`, exactly 500 lines. No full suite
or runtime campaign was repeated while the product answer was pending.

## Delivery boundaries

`@sero-ai/common` is bumped from 0.24.1 to 0.24.2 for the owned Workflow disable,
Room planning callback/signal, and workspace-command signal contracts. The
published `@sero-ai/app-runtime` implementation is unchanged. No Docker image,
managed toolchain, release or platform support change is included. The external
validation gaps tracked by issues 630 and 632 remain open.

## PR 674 first-review correction

The named P2 was a cancellation window between Room preparation and completion
of async Start. The shared creation handle now keeps the prepared Room id
attached to the project signal throughout Start. A signal abort requests Room
cancellation immediately; the handle still returns the prepared id for final
accounting and cleanup observation. Startup rechecks the signal before grant
installation and readiness. Scheduling checks it in the serialized turn-start
write, and the first member carries it to a final check before the paid prompt.
Both milestone and research Rooms use this handle. Workflow startup and the
unanswered manual over-cap wake choice are unchanged.

Deterministic coverage delays workspace preparation for user Stop and grant
approval for cap exhaustion. Both cases retain a cancelled Room and begin no
member prompt; a grant returned after cancellation is revoked. A separate
member-session test proves a pre-aborted first turn sends no prompt.

Focused results: dispatch/lifecycle, 39 tests passed (`r1-room-start.log`);
member-session, 22 tests passed (`r1-member-session.log`). No runtime campaign,
paid call or full package rerun was used. The first typecheck caught an
accidental unrelated local-variable insertion; it was removed. Final root
typecheck passed all 29 tasks (`r1-typecheck-final.log`). Layout, whitespace and changed-source
LOC checks pass; `room-coordinator.ts` remains exactly 500 lines. No additional
published package API or version change is needed for this internal fix.
