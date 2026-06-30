# 07 — Human input (ask the user)

A loop can pause and ask the user a question, then continue once they answer.
Two entry points share one mechanism:

- **Planner** — when the create prompt is missing essential information, the
  planner can return clarifying questions instead of a plan. The loop is created
  as a draft parked on those questions; answering them re-runs the planner.
- **Step** — while a step runs, it can decide it needs a human decision or value
  (an irreversible choice, an ambiguous requirement, an explicit "confirm first")
  and ask. The loop parks; the asking step re-runs with the answer once given.

The model decides **when** to ask and **what** to ask. Code only validates the
envelope shape and applies the recorded answer — there is no heuristic that
decides a question is "needed" (consistent with the no-heuristics rule).

## Why not `requestChoice`?

`host.requestChoice` (the dirty-workspace preflight) is a **transient** prompt: a
fixed set of choices, a timeout, and an immediate "timed out" when no panel is
open, after which the caller applies a default. That is right for an
in-the-moment decision with a sensible default, but wrong for "a step/planner
needs a human answer before it can continue":

- the answer is often **free text**, not a fixed choice;
- the user may be **away** (a background or scheduled run) — we must wait, not
  silently default;
- a loop is **durable**, so a question that gates it must be durable too.

So human input is built on a durable **`pendingInput`** parked on the loop, not
on `requestChoice`. A non-blocking notification still nudges the user, but the
question card is the source of truth and an away user answers later. There is no
timeout and no default — a human gate clears only when the human answers.

This is **not** a new approval/permission/tool-policy layer (see the Non-Goals).
A step still runs with the normal Sero tool surface; asking is a thing the model
may *choose* to do, surfaced durably, not a gate Orchestrator imposes.

## Data model

```ts
interface HumanChoice { id: string; label: string }

interface HumanQuestion {
  id: string;
  prompt: string;
  choices?: HumanChoice[];   // optional quick-picks; free text is always allowed
}

interface PendingInput {
  id: string;
  source: 'planner' | 'step';
  stepId?: string;           // the asking step (source === 'step')
  questions: HumanQuestion[];
  askedAt: string;
}

interface InputAnswer { questionId: string; choiceId?: string; text?: string }

interface AnsweredInput {
  requestId: string;
  source: 'planner' | 'step';
  stepId?: string;
  questions: HumanQuestion[];
  answers: InputAnswer[];
  answeredAt: string;
}
```

- `LoopRuntimeState.pendingInput?: PendingInput` — set while parked. Persisted in
  `loop.json` (watched by the UI).
- `Loop.answeredInputs?: AnsweredInput[]` — resolved requests, kept for history
  and (for step questions) fed back into the asking step.
- `StepOutcome.questions?: HumanQuestion[]` — a step asks by adding this to its
  outcome envelope (status `needs-revision`).
- `PlanningResponse` ⇄ `ClarifyingResponse` — the planner may reply with
  `{ clarifyingQuestions: HumanQuestion[] }` instead of a plan.
- `LoopSummary.pendingInput?: number` — count of open questions, drives the
  loop-list badge.

Question and choice ids are assigned positionally (`q1`, `c1`, …) when the model
omits them, so answers can reference them deterministically. The `PendingInput.id`
is host-unique (the request id an `answer_input` must match).

## Action

```ts
{ kind: 'answer_input'; loopId: string; requestId: string; answers: InputAnswer[] }
```

Validation (`validateAnswers`): every question must be answered (a picked choice
or non-empty text); a picked `choiceId` must be one the question offered; an
answer may not reference an unknown question.

## Flow

**Step question.** In the run engine, when a step's outcome carries `questions`,
the engine resets that step to `pending` (so it re-runs), records a durable
`pendingInput` (`source: 'step'`), stops the run as `waiting`, and fires a
notification. The outcome is **not** applied and recovery does **not** run. If
several steps in one parallel batch ask, the loop parks on the first; the others
reset to pending and re-ask after the answer.

**Planner question.** `planLoop` classifies the reply: clarifying questions →
`needsInput` (no repair pass); a valid plan → `ok`; otherwise one repair pass.
`create` runs the shared `runPlanningFlow`, which parks the draft on a
`pendingInput` (`source: 'planner'`) when the planner asks. The loop is created
but not activated.

**Answering.** `answer_input` validates and records the answer (clearing
`pendingInput`, appending an `AnsweredInput`):

- *step* → the Q&A is merged into the loop's shared `notes` (so the asking step
  sees it and does not re-ask) and the run resumes; the asking step runs again.
- *planner* → `runPlanningFlow` re-runs the planner with the answers folded into
  the task. It may produce a plan, ask again (re-parks), or fail to a blocked
  draft.

**While parked.** `runNext`, `manualRunNext`, and the scheduler `tick` all skip a
loop with `pendingInput` — nothing starts and scheduled fires hold off until the
question is answered. Step re-runs from the top, so a step is told to record work
in `variables`/`notes` before asking (the inline tool that would avoid the
re-run is a deferred layer — see below).

## UI

- **InputRequestCard** — rendered on the loop when `pendingInput` is set; shows
  each question with optional quick-pick buttons plus a free-text box, and one
  submit ("Send answer & continue" for a step, "Submit answers & build the plan"
  for the planner). Disabled until every question is answered.
- **Loop list** — a blue badge with the open-question count.
- **Loop detail** — a "Waiting for you" badge; Activate / Run next / Retry are
  suppressed while parked (the card is the action).
- **Slash command** — `/orchestrator answer <loopId> <text>` answers the loop's
  pending question(s) from a single free-text reply (the panel offers the richer
  per-question / choice flow).

## Functional requirements

- **FR-H1** A step may ask the user by emitting `questions` in its StepOutcome;
  the loop parks instead of applying the outcome or running recovery.
- **FR-H2** The planner may reply with clarifying questions; the loop is created
  as a draft parked on them and is not activated.
- **FR-H3** A parked loop never starts steps and never fires on a schedule until
  answered. There is no timeout and no default answer.
- **FR-H4** Answers are free text and/or a picked quick-pick; every question must
  be answered before submit.
- **FR-H5** Answering a step question resumes the run with the answer in the
  loop's notes; answering a planner question re-runs the planner.
- **FR-H6** `pendingInput` is durable (persisted in `loop.json`), surfaced as a
  loop-list badge and an on-loop card, and survives Sero being closed.

## Out of scope (v1) — later layers

- **Inline `ask_user` tool** — a synchronous tool a step's agent calls mid-run,
  returning the answer in the same session (no re-run). More powerful but it adds
  a tool to the step surface and would hang a background run on an absent human;
  the durable park-and-resume model is the safe v1.
- **Timeout + default** — a per-question timeout that proceeds with a default.
  Deliberately excluded: a human gate should not advance without the human.
- **Cross-question dependencies / forms** — richer multi-step questionnaires.
