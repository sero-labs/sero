# 05 — LLM-authored verification (derived criteria & evaluation)

**Status:** Design + plan, not started. Supersedes the deferred "eval/promptfoo
check type" line in [04 Phase 6](04-implementation-plan.md#phase-6--isolation-and-pr-workflow).

This document is self-contained so a fresh session can execute it. Read it
top-to-bottom, then re-read [00-architecture.md](00-architecture.md),
[01-data-model.md](01-data-model.md), and
[03-execution-and-scheduling.md](03-execution-and-scheduling.md) before coding.
The orchestrator memory (`sero-orchestrator-spec`) is the running build log.

---

## 1. The principle (read this first)

A loop is created from a **plain-English goal**. From that goal alone, the
**LLM must derive**:

1. **what "done" means** — the success criteria, decomposed;
2. **how best to verify each criterion** — the evaluation method per criterion;
3. **when to stop** — the stop conditions.

None of this may be hand-typed by the user, supplied by a test harness, or
hard-coded as a heuristic. The user describes intent in natural language; the
LLM authors the verification. This follows Sero's standing rules: do the work on
the LLM layer, not with heuristics; never put user-authorable assets on rails.

> A useful litmus test: if a human (or a test) has to type a structured check, a
> command, a threshold, a regex, or a results-file path for the loop to know
> whether it succeeded — it's wrong. The loop derives all of that from the goal.

## 2. Why this exists — the mistake it replaces

An earlier attempt added an `eval` check type that took a **user/test-supplied**
command + results-file path + numeric threshold and decided pass/fail by
**mechanically parsing a JSON score**. Two things were wrong with it:

- **No author.** Checks are only settable via `CreateLoopInput.checks`, which no
  tool/CLI/UI surface exposes — so in real use the only thing that could ever
  create that check was the test harness. It was the back half of a feature whose
  front half (authoring) does not exist.
- **Wrong layer.** Parsing a score file is a heuristic. "Did this change achieve
  the goal?" is a judgement that belongs to the LLM.

That work was rolled back (commit `01466462d` reset; the eval type, `runtime/evals.ts`,
and `evals.test.ts` removed). The **worker-session CLI filter** from the same
commit was unrelated and correct, and was kept. This document is the proper
replacement.

## 3. What already exists and is reused (do not rebuild)

The execution machinery is sound; only **authoring** is missing. Reuse:

- **`runtime/checks.ts`** — the single `CheckResult` normalizer (D-12). Every
  evaluation mechanism still collapses to one `CheckResult`. Keep this invariant.
- **`runtime/reviewers.ts`** — a read-only judge subagent that grades the diff and
  returns a verdict. This is the **seed of the judgment mechanism** (§6.3); it
  generalizes from two fixed reviewer personas to arbitrary LLM-authored criteria.
- **`runtime/workers.ts`** — `WorkerRole` already includes `'planner'`
  (`platformTools: 'readOnly'`). The verification planner is a planner worker.
  `lastFencedJsonBlock` / the fenced-JSON output contract are reused for parsing.
- **`runtime/stop-rules.ts`** + `engine.ts` `finalize` — the single-writer stop
  engine. New stop conditions extend it; they do not replace it.
- **`shared/types.ts`** — `LoopGoal`, `CheckResult`, `BlockedReason`, `StopRule`.
- The whole attempt lifecycle (`attempt-runner.ts`, the adapter seam, canonical
  `workdir.cwd`, `baseRef`) is untouched.

**Invariants that still hold (do not break):** single executor (all writes via the
coordinator); one canonical `AttemptWorkdir.cwd` for worker + verification + VCS +
artifacts; pre-attempt `baseRef` is the rollback target; push-model / no-polling;
worktree isolation is background-worker-only (D-06); PR flow stays opt-in /
never auto-merge.

## 4. The model

A loop gains an LLM-authored **verification plan**: a set of **success criteria**,
each with an LLM-chosen **evaluation strategy**, plus LLM-derived **stop
conditions**. Conceptually (final field names are the executing session's call):

```
VerificationPlan {
  criteria: SuccessCriterion[]
  stopConditions: StopCondition[]
  derivedFrom: { goalHash, at }     // provenance, so we know when to re-derive
}

SuccessCriterion {
  id
  description          // plain-English, authored by the LLM from the goal
  evidence: EvidenceStep[]   // what to gather before deciding (read-only / measurement)
  decision: Decision         // how evidence becomes pass/fail
  required: boolean          // must-pass vs informational
}
```

The heart of "how best to evaluate" is the **`decision`**: the planner classifies
each criterion by what kind of evidence actually settles it.

### 4.1 EvidenceStep — what to gather

Read-only or measurement gathering, run during the verification phase at the
canonical cwd, before the decision:

- `{ kind: 'run', command }` — run a command and capture stdout/stderr/exit/
  duration (build, tests, lint, a measurement script). Executes code; bounded by
  `maxCommandRuntimeMs`.
- `{ kind: 'read', path }` — read a file's contents.
- `{ kind: 'diff' }` — the attempt's diff (already captured at the cwd).
- `{ kind: 'gitLog', since }` — commits in a window (e.g. "yesterday").

The planner authors which evidence each criterion needs. (A judgement criterion
usually needs more than the diff — see the changelog example.)

### 4.2 Decision — how evidence becomes pass/fail

- `{ kind: 'exit-zero' }` — **mechanical.** Pass iff a `run` step exited 0. For
  criteria with a definitive command (build passes, tests pass, lint clean).
- `{ kind: 'threshold', metric, op, value, aggregate? }` — **mechanical.** Extract
  a number (or one per item) from a `run` step and compare (`< 50`, etc.);
  `aggregate` = `all` | `fraction≥X` across items (per-page). For quantitative
  criteria. The planner should shape the measurement command's output so the
  number is trivially extractable (emit just the metric / small JSON); if
  extraction is ambiguous, fall back to `judge`.
- `{ kind: 'judge', rubric }` — **LLM.** A read-only judge subagent reads the
  gathered evidence and the criterion and returns pass/fail (or per-sub-point
  pass/fail) with a rationale. For inherently judgemental criteria ("is this
  genuinely dead code?", "does the changelog capture what users should know?",
  "is this the smallest coherent change?").

**Mechanical when the evidence is conclusive; LLM when it's a judgement — and the
planner decides which.** All three produce a `CheckResult` (D-12).

## 5. The verification planner (the new LLM step)

A **planner worker** (read-only, `WorkerRole: 'planner'`) that turns a goal into a
`VerificationPlan`.

- **Inputs:** the goal text; read-only repo context (it may explore — read files,
  run read-only commands — to learn what's verifiable, e.g. "is there a build? a
  test runner? how would I measure page load?"); and, on re-derivation, the prior
  plan + recent attempt outcomes.
- **Output:** the `VerificationPlan` (fenced JSON, parsed coordinator-side like the
  worker contract — D-08). No schema is sent to the subagent.
- **When it runs:**
  - **At create.** A loop is created in the existing `draft` status; the planner
    derives the plan; the loop becomes `active`. (Reuses `LoopStatus.draft`.)
  - **On goal change.** If the goal text changes, re-derive (provenance via
    `derivedFrom.goalHash`).
  - **Adaptive re-plan (later phase).** When the loop stalls or discovers the
    initial plan was unverifiable, the planner refines. Gate behind a phase.
- **Single-writer preserved.** The planner returns *data*; the coordinator writes
  the plan inside its own `host.appState` mutation. The planner never mutates loop
  state or runs the implementer.
- **Transparency, not config.** The derived plan is shown to the user (so they can
  see what the loop will check) and refined **in natural language** — never
  hand-edited as structured config.

## 6. How each mechanism runs (execution)

All three slot into `runChecks` / `checks.ts` and normalize to `CheckResult`.

1. **exit-zero / command** — already exists (`host.verification.runCommands`).
2. **threshold / measurement** — new: run the measurement `run` step, extract the
   metric(s), compare, aggregate. Keep extraction trivial by having the planner
   shape the command output; judge-fallback when not.
3. **judge** — generalize `reviewers.ts`: instead of a fixed persona prompt, the
   judge is given the **criterion description + gathered evidence** and returns a
   verdict. Read-only tool policy (no `sero-cli` → cannot recurse, like reviewers).
   The failing criterion + rationale feed the next attempt's context (sharper
   retries than a binary review).

## 7. Stop conditions (LLM-derived, mapped onto the engine)

The planner derives stop conditions; map them onto the existing stop engine,
adding `BlockedReason`s where needed:

| Derived condition | Mechanism |
| --- | --- |
| All required criteria pass | `complete` (existing) |
| Progress stalls / equivalent diffs | `blocked: no-progress` (existing, D-13) |
| Max attempts | `stopped` (existing) |
| Verification unavailable (no build/test/measurement possible) | new `blocked: verification-unavailable` |
| Approval required before proceeding | new `blocked: approval-required` (pause + notify; resumes on user OK) |
| No candidates remain (e.g. cleanup loop) | the planner reports "criteria met / nothing left" → `complete` |

Example 1's stop set ("none remain, progress stalls, verification unavailable,
approval required") maps entirely onto this table.

## 8. Data-model & surface changes

- **`LoopGoal.verificationPlan?: VerificationPlan`** — the authored plan. The
  legacy `LoopGoal.checks: LoopCheck[]` becomes the **compile target** the plan
  lowers into at run time (or is replaced outright — the executing session decides
  whether the plan compiles to `LoopCheck[]` or `checks.ts` consumes criteria
  directly). Either way, **no user/agent ever supplies `checks`.**
- **New `BlockedReason`s:** `verification-unavailable`, `approval-required`.
- **Attempt records** gain per-criterion results (extend `CheckResult` or add
  `criterionResults`) so the UI and the next attempt see which criterion failed
  and why.
- **`create` surface unchanged in spirit:** still `title` + `goal` (+ execution
  options). It gains *nothing* for checks. The planner fills the plan. Remove any
  notion that checks are an input.
- **New decisions (fold into [00](00-architecture.md)):** D-18 LLM-authored
  verification (criteria + per-criterion strategy + stop conditions, never
  user/heuristic); D-19 planner is a read-only worker run at create / on goal
  change / adaptively; D-20 mechanical-when-conclusive-else-judge decision rule.

## 9. Worked examples (generality check — NOT tailored config)

These validate that one general model covers very different loops. The criteria
below are what the **planner would derive**, not what anyone types.

**(1) Dead-code cleanup.** Mixed mechanical + judgement:
- "Build still passes" → evidence `run: <derived build>` → decision `exit-zero`.
- "Tests still pass" → evidence `run: <derived tests>` → `exit-zero`.
- "Removed code is genuinely unused" → evidence `diff` + `run: <derived usage grep>`
  → decision `judge`.
- "No unrelated/uncommitted work touched" → evidence `diff` + git state → `judge`.
- Stop: criteria pass *and* judge reports no further low-risk candidates →
  `complete`; stalls → `no-progress`; can't build → `verification-unavailable`.

**(2) Nightly changelog.** Pure judgement:
- "Changelog reflects yesterday's user-relevant changes" → evidence
  `gitLog since=yesterday` + `read CHANGELOG` + `diff` → decision `judge`.
- No command exists to "prove" this; the only sound evaluator is the LLM judge.

**(3) Page-load < 50 ms.** Quantitative measurement:
- "Every page loads < 50 ms under repeatable conditions" → evidence
  `run: <derived measurement that emits ms per page>` → decision
  `threshold: metric=ms, op<, value=50, aggregate=all`.
- If no measurement exists, the planner derives one (or flags
  `verification-unavailable`); the implementer may need to establish a repeatable
  measurement as part of the work. Loop continues until the threshold holds for
  all pages.

## 10. Phasing

Each phase: `pnpm typecheck` green, orchestrator suite green, every source file
< 500 LOC, no desktop-core change unless a host seam is genuinely required (call
it out like the `maxCostUsd` follow-up).

- **P-A — Plan data model + planner + create flow.** Add `VerificationPlan` types;
  the planner worker; create → `draft` → derive → `active`; store the plan
  (single-writer). Tests: deterministic planner output → plan persisted; goal
  change re-derives.
- **P-B — Judgement mechanism.** Generalize `reviewers.ts` into a criterion-judge
  with arbitrary `evidence` + criterion; route through `checks.ts`. Tests: judge
  pass/fail → `CheckResult`; evidence gathered from diff/gitLog/read.
- **P-C — Measurement/threshold mechanism.** Run measurement, extract/aggregate,
  compare; judge-fallback. Tests: per-item aggregation, threshold both directions.
- **P-D — Stop-condition extensions.** `verification-unavailable`,
  `approval-required` (+ resume path). Tests: each transition.
- **P-E — Adaptive re-plan (optional).** Re-derive on stall/unverifiable. Gate
  carefully; log when it fires (no silent re-planning).

## 11. Testing strategy

The LLM steps (planner, judge) are **seams**, exactly like the existing
adapter/reviewer seams — inject fake planner output, fake judge verdicts, and fake
measurement numbers into the harness and assert the
plan → criteria → `CheckResult` → stop-transition path deterministically. No live
model calls in unit tests. Mirror `harness.ts` patterns (scriptable `runWorker` /
`verify`).

## 12. Open questions for the executing session

- **Plan compiles to `LoopCheck[]` vs `checks.ts` consumes criteria directly?**
  (Prefer the smaller diff; `checks.ts` staying the normalizer is the constraint.)
- **Measurement extraction:** trust a planner-shaped command output + mechanical
  compare, or always judge the measurement? (Lean mechanical for hard numbers,
  judge-fallback.)
- **Re-plan aggressiveness:** how eagerly to re-derive; cost vs adaptivity.
- **Judge honesty:** single judge vs a second opinion for high-stakes criteria
  (cleanup deleting code). Possible adversarial/▢-vote pass later.
- **Planner model/budget:** which model, and how its tokens fold into the run
  budget (D-17).
- **`approval-required` UX:** how the pause surfaces and resumes (notify + a
  resume action).

## 13. Out of scope / non-goals

- No user-typed checks, commands, thresholds, or results paths. No promptfoo or any
  named tool. No user-supplied test harness (the dropped "B2"). No heuristic
  scoring of any kind.
- Not a replacement for the implementer/adapter/scheduling work — those are done.
- The `check` event trigger source stays not-yet-wired (no event source; the
  orchestrator is verification's only caller — unchanged by this work).
