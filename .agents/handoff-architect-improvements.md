# Handoff — `architect-execution-efficiency-and-observability`

Branch `feat/architect-improvements`, 40 commits, **32/34 tasks**.

The implementation is finished and green. Two tasks remain, and one of them is a
single command. This document exists mainly to stop the next agent turning the
last two tasks into a fortnight of polish.

---

## 1. Confirm the state before doing anything (about five minutes)

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero

pnpm typecheck                     # expect: Tasks: 29 successful, 29 total
openspec validate architect-execution-efficiency-and-observability   # expect: is valid

cd plugins/sero-architect-plugin   && pnpm exec vitest run   # expect: 423 passed
cd ../sero-orchestrator-plugin     && pnpm exec vitest run   # expect: 1449 passed, 1 skipped
cd ../../apps/desktop              && npx vitest run electron/__tests__/features/subagent  # expect: 99 passed
```

If those five pass, the implementation is intact. That is the whole check. Do not
go looking for more to verify.

---

## 2. The two outstanding tasks

### 8.2 — one missing measurement (~15 minutes, under $2)

The comparison is written in `openspec/changes/.../design.md` under **"Outcome
comparison after the efficiency changes"**. The implementation objective has a
before and an after figure. The planning objective has only a before figure
because two attempts timed out in discovery.

It needs a profile signed in to `openai-codex` at `apps/desktop/.sero-baseline-home`
(already signed in). Then:

```bash
cd apps/desktop
env -u ELECTRON_RUN_AS_NODE SERO_E2E_ARCHITECT_BASELINE=1 SERO_BASELINE_CAP=2 \
  SERO_BASELINE_ONLY=planning SERO_BASELINE_MODEL=openai-codex/gpt-5.6-terra:high \
  npx playwright test e2e/architect-baseline.agent.spec.ts --project=agent
```

It writes `apps/desktop/e2e/screenshots/architect-baseline/baseline.json`. Add
the planning row to that table, delete the "not re-measured" bullet from the
unknowns list, and mark 8.2 in `tasks.md`.

**Do not** re-measure objective 1. It is measured, and a second run would be a
second sample of a different task path.

**Do not** try to make the two objectives comparable, or the before and after
comparable. They are not, and the doc already says why: the after run did more
work. That is the honest finding, not a problem to solve.

If the run times out again, write what happened in the doc and mark 8.2 with the
gap recorded. A recorded unknown is a valid outcome for this task. A fourth
attempt is not.

### 8.4 — two verification items, no code

Everything else in 8.4 is done: suites, root typecheck, docs build, React Doctor,
no browser storage, no file over 500 LOC except the exempt e2e spec.

Left:

1. **Prototype match.** Compare
   `apps/styleguide/public/prototypes/architect-run-observability/` with
   `plugins/sero-architect-plugin/ui/components/Inspector.tsx` and
   `InspectorCharts.tsx`. Write one short paragraph in `design.md`: what the
   delivered inspector follows and what it deliberately does differently. A
   written difference is a finding, not a defect.
2. **Requirements-to-evidence record.** For each requirement in the delta specs,
   name the test or observed evidence. Most of this is already in commit
   messages; this is transcription, not investigation.

**Do not** restyle the inspector to match the prototype more closely. The
prototype settled presentation choices; the component implements them.

---

## 3. Stop list — things that look like work and are not

| Looks like a defect | What it actually is | Why to leave it |
| --- | --- | --- |
| Five React Doctor warnings (control-flow complexity, component size, effect re-subscribing, array lookups) | Quality suggestions on a working component | Score is 78/100 with the accessibility bugs already fixed. Not regressions. |
| `requests`, `toolCalls`, `retries`, `compactions` are all zero | The run journal carries no session-level events yet | Recorded in `design.md` as an unknown. Closing it is a separate change. |
| All delegated cost shows as aggregate coverage | The Orchestrator reports one cumulative total | Deliberate. The spec requires it stay identifiable as aggregate. |
| No per-operation model provenance for delegated work | The Architect never sees the delegate's model | Naming one would be a guess presented as provenance. |
| A read-only Room cannot run the test suite | Product gap, recorded for task 6.4 | Needs a product decision from the user, not a code change here. |
| Objective 1's cost rose from $0.148 to $0.293 | The after run did more work | The doc says this is an unknown, not a regression. |
| `architect-baseline.agent.spec.ts` is 672 lines | It is an e2e test | Tests, docs and CSS are exempt from the 500-LOC rule. |
| The two live runs took different paths | Model-driven work is not deterministic | One sample each. It is a baseline, not a benchmark. |

Do not re-run the live evaluation to "get a cleaner number". Do not harden the
fake hosts or test fixtures. Do not widen phase 6's guidance or add string
assertions for it — task 6.1 explicitly defers that to a real behavioural
assessment.

---

## 4. What "done" looks like

1. 8.2 and 8.4 marked in `tasks.md`, with any gap written down rather than
   chased.
2. `openspec validate` still passing and all suites still green.
3. A **draft** PR with this handoff in the description. The repo convention is
   draft PRs, and one is made ready only when the user asks.
4. Up to three review rounds via the `sero-code-review` skill (Fable 5, high
   effort), and the findings resolved or explicitly declined.

Then report green or red. Red with named outstanding issues is an acceptable
answer here. The change does not claim an efficiency improvement, and the
comparison doc is written so that nobody can read one into it.
