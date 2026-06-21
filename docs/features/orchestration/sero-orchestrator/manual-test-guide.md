# Orchestrator — manual test guide

A step-by-step plan to exercise the orchestrator end-to-end in the real app,
focused on the work that has only been unit-tested so far: LLM-authored
verification (the planner, the judge, measurements, the stop conditions),
goal editing / re-deriving, and the advisory reflection layer.

Everything below is driven from the **Orchestrator panel in the running app** —
you click buttons, type goals, and watch what happens. The planner, the worker,
the judge, and the reflector all make real model calls, so this is the first time
those run for real.

Keep a note next to each step of what you saw. There's a checklist to fill in at
the end.

---

## 1. Before you start

1. Build the workspace once, then launch the app in dev with the orchestrator
   plugin enabled:

   ```bash
   pnpm build
   SERO_DEV_PLUGINS=orchestrator bash scripts/dev.sh
   ```

2. If the window fails to open (it tries to run as Node and crashes on startup),
   clear the `ELECTRON_RUN_AS_NODE` variable for the launch:

   ```bash
   ELECTRON_RUN_AS_NODE= SERO_DEV_PLUGINS=orchestrator bash scripts/dev.sh
   ```

3. Have a real model configured in Sero (the same one you'd use for normal chat).
   The orchestrator uses it for the planner, the worker, the judge, and the
   reflector.

---

## 2. Set up a throwaway test project

The orchestrator works on a real folder that is a git repository. Create a small
one with a deliberate, checkable situation so you can watch it being fixed.

```bash
mkdir /tmp/orch-test && cd /tmp/orch-test
git init -q

cat > sum.js <<'EOF'
function sum(a, b) { return a - b; }   // bug: should be a + b
module.exports = { sum };
EOF

cat > test.js <<'EOF'
const { sum } = require('./sum');
if (sum(2, 3) !== 5) { console.error('FAIL: 2 + 3 should be 5'); process.exit(1); }
console.log('ok');
EOF

cat > unused.js <<'EOF'
// Nothing imports this.
function oldHelper() { return 'legacy'; }
module.exports = { oldHelper };
EOF

printf '# Changelog\n\n## Unreleased\n' > CHANGELOG.md

git add -A && git commit -qm "initial test project"
```

Open this folder as a workspace in Sero, then open its **Orchestrator** panel.
You should see an empty list with a "New goal" box on the left.

> Tip: running `node test.js` in this folder prints `FAIL` and exits non-zero
> until `sum.js` is fixed — that's the thing a loop should be able to verify.

---

## 3. Core scenarios

For each scenario: create the goal, do the steps, and check the "Expected"
points. Most goals use the **Background worker** mode (the default).

### A. The plan is derived from the goal (no checks typed)

1. In "New goal", title `Fix sum`, goal: **"Fix the bug in sum.js so the test in
   test.js passes."** Add the goal.
2. Watch the new goal in the list.

**Expected**
- It appears briefly as **Draft** with "Working out how to check this goal…",
  then flips to **Running**.
- The **Verification** section lists one or more success criteria the model wrote
  itself (e.g. "the test passes"), each tagged with how it's checked
  (`command` / `measure` / `judge`) and whether it's required.
- You never typed a check, command, or threshold — confirm the criteria look
  sensible for the goal.

### B. A background run fixes the bug and completes

1. Open the goal. Click **Run next**.
2. Watch the worker activity, then the **Attempts** timeline.

**Expected**
- The worker edits `sum.js` (changes `-` to `+`).
- The criterion's check runs and passes; the goal becomes **Done**.
- In `/tmp/orch-test`, `node test.js` now prints `ok`, and `sum.js` is changed.

### C. Editing the goal re-derives the plan

1. Create a goal `Tidy`, goal: **"Fix the bug in sum.js."** Wait for it to reach
   Running with a plan.
2. Click **Edit goal**. Change the goal text to **"Fix the bug in sum.js AND make
   sure the test in test.js passes."** Save.

**Expected**
- The goal briefly returns to Draft ("Working out how to check…"), then comes
  back to Running with a **refreshed** Verification section reflecting the new
  wording.
- Now click **Edit goal** again and change **only the title** (not the goal).
  Save. The plan should **not** change (only a title change → no re-derive).

### D. Re-derive on the same goal

1. On any running goal, click **Re-derive plan**.

**Expected**
- It drops to Draft, re-runs the planner on the same goal, and comes back to
  Running with a freshly derived plan (it may be the same or slightly different —
  that's fine; the point is it re-ran).

### E. A judgement criterion (judge)

1. New goal `Dead code`, goal: **"Remove the code in unused.js if it is genuinely
   unused anywhere in the project."**
2. Check the Verification section, then **Run next**.

**Expected**
- At least one criterion is tagged **judge** (deciding "is this genuinely unused?"
  isn't something a command can settle).
- When you run it, a read-only judge reviews the change and the loop only
  completes if the judge agrees the removal was safe.

### F. A measurable target (measure) — optional

1. Add a tiny benchmark to the test project:
   ```bash
   cd /tmp/orch-test
   printf 'console.log(42)\n' > bench.js   # pretend this prints a millisecond figure
   git add -A && git commit -qm "add bench"
   ```
2. New goal `Fast`, goal: **"Make `node bench.js` report a value under 50."**
3. Check the Verification section, then **Run next**.

**Expected**
- A criterion tagged **measure** with the threshold the model chose (e.g. under
  50). The number is compared mechanically; the goal passes when it's under the
  bound.

### G. Nothing sound to verify (blocks instead of running blind)

1. New goal `Vague`, goal: **"Make the code nicer."** (deliberately vague, with no
   objective way to check it).

**Expected (model-dependent)**
- The model may decide there's no sound way to verify this and the goal becomes
  **Blocked** with a plain-English reason ("no sound way to verify…") plus a
  notification — rather than running blind.
- **Run next** on it should be refused.
- If instead the model derived a reasonable judge criterion, that's also a valid
  outcome — note which happened.

### H. Needs your sign-off (approval) — model-dependent

1. New goal `Risky`, goal: **"Delete unused.js entirely from the project."**
2. **Run next**.

**Expected (model-dependent)**
- If the planner decided this needs sign-off, the work runs, the criteria pass,
  and the goal stops at **Blocked — awaiting approval** with a notification (the
  change is kept, not discarded).
- Click **Resume** — this acts as your approval and the goal becomes **Done**.
- Note whether the planner asked for approval at all (it's its call).

### I. Reflection appears when a loop gets stuck or stops

1. New goal `Impossible`, goal: **"Make test.js pass without editing any files."**
   Set it to stop after a small number of attempts if you can; otherwise let it
   run a couple of times and then **Stop** it.

**Expected**
- When it ends up **Blocked** or **Stopped**, a **Reflection** section appears with
  a verdict (e.g. "stuck"), a plain-English summary of *why*, and a suggested next
  step — plus a notification.
- Confirm the reflection did **not** change anything on its own: the plan and the
  status are exactly what they were; it only added advice.

### J. Cross-loop health check

1. With a few goals in various states, click **Health check** in the panel header.

**Expected**
- After a moment, each in-flight goal shows a **Reflection** with a verdict and
  summary, and you get a short notice.
- Again, nothing should change on its own — health check only reads and advises.

### K. The basic controls still behave

- **Pause** a running goal → it stops being eligible to run; **Resume** brings it
  back.
- **Stop** a goal → it's finished and can't be run again.
- Try **Edit goal** on a Done/Stopped goal → it should be refused.
- Try **Run next** on a goal that's still Draft (deriving) → it should say it's
  still working out how to check the goal.

---

## 4. What to write down

For each scenario, capture:

- Did the model derive **sensible** criteria for the goal (and the right *kind* —
  command vs measure vs judge)?
- Did the goal reach the **right end state** (Done / Blocked / Stopped / Awaiting
  approval)?
- Did anything change **on its own** that shouldn't have — especially: did a
  reflection or health check ever alter a plan, a status, or files? (It must not.)
- Were the plain-English messages (status reasons, reflections, notifications)
  clear and accurate?
- Anything confusing, slow, or rough in the UI.

### Checklist

| # | Scenario | Worked? | Notes |
| - | --- | --- | --- |
| A | Plan derived from goal (draft → running) | ☐ | |
| B | Background run fixes bug → Done | ☐ | |
| C | Edit goal re-derives; title-only doesn't | ☐ | |
| D | Re-derive plan on same goal | ☐ | |
| E | Judge criterion gates completion | ☐ | |
| F | Measure criterion (threshold) | ☐ | |
| G | verification-unavailable blocks (no blind run) | ☐ | |
| H | approval-required → Resume completes | ☐ | |
| I | Reflection on blocked/stopped (advisory only) | ☐ | |
| J | Health check reflects on all in-flight goals | ☐ | |
| K | Pause/resume/stop + edit/run-next guards | ☐ | |

---

## 5. If the buttons don't drive anything (fallback)

The panel buttons go through the in-app tool path and should work. If a button
does nothing, check the dev logs (`~/.sero-ui/logs/dev/sero-electron.log`) for an
orchestrator error and capture it.

A scheduled goal (a cron trigger) only runs when the workspace is open and the
due moment passes, or on the next open (catch-up). To test scheduling without
clicking, seed a goal with a cron trigger whose next due moment is in the past,
close and reopen the workspace, and watch it run on open.

---

## 6. Notes / known limits while testing

- Behaviours marked **model-dependent** (which decision kind is chosen, whether a
  goal is flagged unverifiable, whether approval is requested) are *meant* to be
  the model's call — the test is "did it derive something sensible", not "did it
  produce exactly X".
- Worktree isolation + opening a PR needs a real git remote and is opt-in; it's
  not part of this pass unless you want to exercise it.
- Each planner / judge / reflector step is a real model call, so runs take a few
  seconds and cost tokens.
