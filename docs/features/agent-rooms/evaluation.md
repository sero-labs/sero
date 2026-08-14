# Agent Rooms — the phase 8 gate

Room mode replaces `CollaborationEngine` and `DebateEngine`. The plan removes
the old engines only after Rooms are proven, and this document is how they are
proven: what is run, what it must show, and what is recorded.

Nothing here is a parity framework. The old engines are not run side by side
(spec §28). The question is not "does a Room match the old output" but "does a
Room do the job well enough to be the only way".

## What runs

`apps/desktop/e2e/agent-rooms.agent.spec.ts` — the real flow, with real model
calls and real spend, driven through the panel a user drives.

```bash
pnpm build                                  # from the repo root

cd apps/desktop
env -u ELECTRON_RUN_AS_NODE \
  SERO_E2E_REAL_HOME=1 \
  SERO_E2E_ROOMS=1 \
  npx playwright test e2e/agent-rooms.agent.spec.ts --project=agent
```

- `SERO_E2E_ROOMS=1` is the opt-in. Without it every scenario skips, because
  each one costs money.
- `SERO_E2E_REAL_HOME=1` uses `~/.sero-ui`, so the run uses your existing model
  login. Without it the run needs `e2e/.env.test` like the other agent specs.
- `SERO_E2E_ROOM_SCENARIO=2` runs one scenario alone.
- Electron rejects the debug port when `ELECTRON_RUN_AS_NODE` is set, and the
  sandbox closes the window seconds after it opens — run it with the sandbox
  off, as the other agent specs are run.

The spec launches with `SERO_ROOMS=1`, creates a scratch git workspace, and
leaves screenshots and `evaluation.json` in `e2e/screenshots/agent-rooms/`.

## The four scenarios

| # | Question | Pass bar |
|---|---|---|
| 1 | Does a generated roster fit the problem, and does the work land? | Completed, delivered, inside the envelope, and `src/greet.ts` actually changed. |
| 2 | Does an adversarial brief staff both sides? | Completed, three or more members, and `DECISION.md` written. |
| 3 | Does parallel work stay apart? | Completed, a distinct checkout per working member, and at least one path claim. |
| 4 | Does a Room asked for in a chat answer that chat? | The Room records the asking session, and delivers `session:<id>` (FR-029). |

## What is recorded

Each scenario appends one entry to `evaluation.json`:

- `status`, `stopReason`, `delivered`, `deliveryRef`;
- `durationMs` against the envelope's wall-clock ceiling;
- `costUsd` against `maxCostUsd`, and cost per member;
- `turns`, `rosterRevisions`, `memberReplacements`;
- the roster as roles, so "was it staffed for the problem" can be read rather
  than argued.

User intervention is measured by hand: count every time you had to answer,
wake, message or unstick a Room to get it finished, and write it beside the
run. A Room that only finishes because a person kept pushing it has not passed.

## The gate

Room mode is proven when:

1. all four scenarios pass on one build, without code changes between them;
2. no scenario needed an intervention to reach completion;
3. spend and duration stayed inside the approved envelope in every run;
4. built-in presets still adapt — the same preset with a different problem
   produces a different roster, not the preset's example roles.

Point 4 is checked from the recorded rosters of scenarios 1 and 2.

## After the gate

In order, and only then:

1. move the collaboration and adversarial entry points to Room creation;
2. write the release and migration notes;
3. remove `CollaborationEngine`, `DebateEngine` and their IPC, stores, UI,
   templates and tests;
4. confirm no Room record or production entry point refers to a legacy engine.

If a scenario fails, fix the Room defect and re-run the whole gate. The old
engines stay until every point above is done.
