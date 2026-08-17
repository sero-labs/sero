# Orchestrator documentation implementation plan

Status: Phases 0, 1 and 4 done — Meridian Room (phase 2) next
Branch: feat/agent-rooms
Parent product: Sero Orchestrator plugin
Scope: the six pages split out in `e5e336c23` — `guide/orchestrator`,
`guide/workflows`, `guide/rooms`, and their three reference pages — plus the
screenshots they need.
Last updated: 2026-08-16

## 1. Delivery rule

Capture before writing. Every guide page is written against images that already
exist, so no page describes a screen that turned out to look different.

Phase 2 is the only phase that spends real money. It does not start until Phase
1 proves the capture pipeline on cheap shots. If a live Room state refuses to
reproduce, the guide describes it in prose and the plan records the missing
shot. No screen is staged or faked.

### Capture mechanism (amended 2026-08-16)

The plan first named `sero app screenshot`. That command is unreachable: the
`sero` shim needs `SERO_CLI_ENDPOINT` and `SERO_CLI_TOKEN`, which the host mints
per workspace for a Sero-managed runtime. A normal shell has neither.

Capture therefore uses the repo's own Playwright harness
(`apps/desktop/e2e/`, `--project=agent`), which is how `agent-rooms.agent.spec.ts`
already runs live Rooms with real spend and writes `page.screenshot()` output.
The intent is unchanged — a real app, real runs, captured end to end.

## 2. Target outcome

A reader who has never used Sero can:

- choose between a Workflow and a Room from `guide/orchestrator`;
- run their first Workflow and read its plan map, including gates, fan-out, and
  feedback routes;
- run their first Room and supervise it to a pull request;
- find the exact setting, limit, or status in a reference page.

Every term a newcomer meets is defined where it first appears, and every screen
the guides describe has a picture of it.

## 3. What is wrong today

### Rooms guide has no pictures and no depth

`guide/rooms.md` is 114 lines of flat instruction with zero screenshots. It
tells the reader a Room exists and lists its buttons. It never shows one
working, and it never gets past the happy path.

Missing entirely:

- what the proposal looks like when Sero designs a team;
- worktree-per-member in practice — two members editing the same repo without
  colliding;
- claims, and what a reader should do when two members want the same file;
- adding, retiring, or suspending members mid-flight;
- an access escalation approval, shown rather than described;
- the completion screen: result, artifacts, cost, unresolved items.

### Workflows guide is missing the PlanMap completely

`PlanMap.tsx` and `PlanPresentation.tsx` ship a whole second way to read a plan,
and no page mentions it. Absent from the docs:

- the **Map / Details** toggle, and that Map is the default on a draft;
- **Auto / Horizontal / Vertical** orientation;
- zoom, fit, and the percentage readout;
- clicking a node to open its detail strip;
- every node badge the map draws:

| Badge | Field | Meaning | Documented? |
| --- | --- | --- | --- |
| branch icon | `produces` | the step records a decision | no |
| circle | `when` | the step only runs on one route | partly (guide prose) |
| shield | `gate` | the step waits for your approval | **nowhere** |
| `×N` | `fanOut` | one run per item found | reference only |
| `↩` violet | `feedback` | the plan can loop back | reference only |
| dimmed node | route not taken | this path was skipped this run | no |

Approval gates are the worst of these: a first-class control that appears in no
guide and no reference table.

### Voice is inconsistent across the split

`guide/workflows.md` has warmth ("We'll start small"). `guide/rooms.md` reads
like a spec that lost its numbers. The two pages now sit side by side in the
nav, so the seam is visible.

### The demo project undersells both

The Tip Calculator seed produces a three-box plan. It cannot show a branch, a
fan-out, a gate, or a feedback route, so the richest parts of the map have
nothing to be photographed against.

## 4. Decisions taken

| Decision | Choice |
| --- | --- |
| Screenshot capture | Claude runs the app, seeds the worlds, runs the Workflow and the Room, and captures end to end |
| Demo worlds | Two — one per guide |
| Advanced material | One advanced page per mode |
| Voice | Narrative: each guide opens on a real situation and follows it through |
| Room spend | Retries allowed; tens of dollars, not hundreds |
| GitHub | A throwaway public repo under Dan's account, so the PR and claim comments are genuine |
| Workflows world | Lattice — a puzzle game |
| Rooms world | Meridian — an orders API |

## 5. The two worlds

### World A — Lattice (Workflows)

A small puzzle game: a `levels/` folder of level definitions, a solver module,
and a script that checks each level can be finished. It exists to make the plan
map interesting.

One goal exercises every badge in a single plan:

> Check every level in levels/ is solvable and lands inside our difficulty band.
> Fix the ones that fail. Ask me before you change the solver. Re-run the check
> after any fix, and open a pull request when they all pass.

- **fan-out** — one check per level file;
- **decision** — the classifier records pass or fail per level;
- **conditional route** — fix steps only run for failing levels;
- **approval gate** — the solver edit;
- **feedback route** — a failed check sends the plan back to the fix step, with
  a visible traversal counter.

This is the only plan needed for the whole Workflows shot list.

### World B — Meridian (Rooms)

A small orders API on a throwaway public repo, with a defect that no single
agent can own: currency totals drift by a cent under concurrent writes. The
cause is spread over a rounding helper, a database migration, and a retry in the
HTTP client.

The Room forms a team — Conductor, an investigator reading the failing suite, a
fixer with a worktree, a reviewer — and the guide follows it from proposal to
pull request. Along the way it produces, naturally rather than staged:

- a question to the reader ("which rounding rule is correct for your books?");
- an access escalation approval, so the fixer can push;
- two members claiming the same helper file;
- a real PR at the end.

## 6. Page plan

Diátaxis type is fixed per page. No page mixes two.

| Page | Type | Action |
| --- | --- | --- |
| `guide/orchestrator.md` | explanation | Keep as the chooser. Open on the two situations instead of a bare table; one image per mode |
| `guide/workflows.md` | tutorial | Rewrite around Lattice. New section: read the plan map |
| `guide/workflows-advanced.md` | how-to (new) | Branches, fan-out, gates, feedback routes, per-step tuning, refine, Library and Catalog (moved out of the tutorial) |
| `guide/rooms.md` | tutorial (rewrite) | Follow one Meridian Room from proposal to PR, with screenshots at every state |
| `guide/rooms-advanced.md` | how-to (new) | Worktrees and claims, access escalation, changing the team mid-flight, interventions now vs next turn, recovery after a restart, delivery destinations |
| `reference/workflows.md` | reference | Add the map legend table, the `gate` entry, and `produces`; the map controls |
| `reference/rooms.md` | reference | Fill claim and artifact detail; check against the shipped tool actions |

Moving Library and Catalog out of the Workflows tutorial keeps the first run
short. A first-time reader should reach a finished workflow before meeting
version badges.

## 7. Milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| Worlds ready | 0 | Both demo repos seeded, capture pipeline proven |
| Images captured | 1 to 2 | All 25 screenshots on disk and reviewed |
| Guides written | 3 | Four guide pages rewritten or created |
| Reference complete | 4 | No shipped control undocumented |
| Shipped | 5 | Nav wired, site builds, links and images resolve |

## 8. Phase 0: Worlds and capture harness

Objective: Both demo repos exist and the capture pipeline is proven before any
model spend.

### Work checklist

- [x] Seed the Lattice workspace: `levels/` with a mix of solvable, unsolvable,
      and out-of-band levels, plus a solver module and a check script.
- [x] Commit Lattice to a local git repo.
- [x] Seed the Meridian workspace: orders API, rounding helper, migration, HTTP
      client retry, and a test suite that fails under concurrency.
- [x] Create the throwaway public GitHub repo and push Meridian to it.
- [x] Confirm the repo contains no private paths, tokens, or real customer data.
- [x] Write the capture spec that launches the app and opens Orchestrator.
      Two specs: `docs-workflows.agent.spec.ts` and `docs-rooms.agent.spec.ts`,
      sharing `e2e/helpers/docs-capture.ts`.
- [x] Capture one throwaway screenshot through the harness.
- [x] Confirm the capture crops cleanly and shows no private path in frame. The
      status bar carries the workspace path, so every crop helper clamps above
      it; two shots leaked it before that clamp existed and were retaken.

### Acceptance criteria

- [x] Both workspaces open in Sero and their check or test scripts run.
- [x] Lattice has at least one level of each outcome, so the plan can branch.
- [x] Meridian's test suite fails for the intended reason, not a seeding error.
- [x] The public repo is reachable and contains only demo content.
- [x] A saved screenshot exists and is legible at docs-site width.

### Notes

Worlds live outside this repo at `~/Documents/Dev/projects/sero/demos/`.

Lattice: 6 levels, 3 pass, 3 fail for three different reasons — unsolvable,
below the band at 3 moves, above it at 50. The failure mix is what gives the
plan its branch.

Meridian: `github.com/monobyte/meridian-orders-demo` (public, throwaway).
7 tests, 4 fail across three causes — a cent lost when a total is split, a lost
update when payments arrive together, and a retry that charges three times.

## 9. Phase 1: Lattice capture

Objective: All 13 Workflows screenshots exist, from one plan.

### Work checklist

- [x] Create the Lattice workflow from the goal in section 5.
- [x] Confirm the generated plan carries a fan-out, a decision, a conditional
      route, an approval gate, and a feedback route.
- [x] Refine the plan if any badge is missing, and record what was needed.
- [x] Capture shot 1 — plan map, draft, Map/Details toggle visible.
- [x] Capture shot 2 — badges in frame: gate, ×N fan-out, conditional, decision.
- [x] Capture shot 3 — orientation control, vertical layout.
- [x] Capture shot 4 — zoom and fit on a plan wider than the panel.
- [x] Capture shot 5 — node selected, detail strip open.
- [x] Capture shot 6 — mid-run: running node lit. The not-taken branch never
      dimmed, because no step was skipped; see the missing-shot table.
- [x] Capture shot 7 — the violet dashed feedback edge is in the map shots. Its
      traversal counter never moved; see the missing-shot table.
- [x] Capture shot 8 — the approval gate waiting on the reader.
- [ ] Capture shot 9 — fan-out step expanded, per-item runs visible. NOT DONE:
      the harness never expands the fan-out row. The Details view records
      "6 of 6 activation(s) succeeded" but its per-item rows stay closed.
- [x] Capture shot 10 — Details view of the same plan, for contrast.
- [x] Capture shot 11 — Needs-you card with quick-pick answers.
- [x] Capture shot 12 — finished run, pull request open.
- [x] Capture shot 13 — Home with several workflows grouped by status.
- [x] Crop, convert to `.jpg`, and name to match the existing files.

### Acceptance criteria

- [x] 12 of 13 images exist in `apps/docs-site/docs/assets/images/`; the
      fan-out expansion is named above as not done.
- [x] Every node badge in the section 3 table appears in at least one image.
- [x] No image shows a private path, token, or real repository name.
- [x] Each image is legible at the docs-site content width without zooming.
- [x] Shots 3, 4, 10, and 13 were taken without a step running.

### Notes

Capture runs from `apps/desktop/e2e/docs-workflows.agent.spec.ts`.

Two lessons paid for in real runs. The planner does not reliably emit the
structured `when` and `gate` fields — it writes "only if it failed" into a
step's instructions instead — so the harness asks for each missing mechanic
through Refine, twice if needed, and records anything it still refuses. And a
panel-width picture of a map is useless once the docs site scales it into a
750px column, so map shots crop to the plan itself; a seven-node horizontal map
cannot be made legible at that width, which is why the vertical view carries the
detail.

`SERO_E2E_DOCS_REUSE=1` re-frames against the last plan in 7 seconds and spends
nothing. Use it for every layout change; drop it only for the run that produces
the published images. `SERO_E2E_DOCS_REUSE_PLAN=1` keeps the workflow already in
the demo world and drives it, so a run-time capture does not buy a fresh plan.

Two costly lessons about time rather than money. The plan repair asked for its
five features in a fixed order, and the conditional route — the one the planner
is least willing to honour — came before the approval gate, so every run spent
minutes waiting on a request it did not need. The gate is now asked for first,
and a run-time capture asks for nothing else. The patience per request came down
from 240 to 90 seconds.

### Shots that did not reproduce

The live run succeeded on its first attempt, so two states never occurred:

| Shot | Why it is missing |
| --- | --- |
| Feedback traversal counter | The repairs passed the re-check first time, so the loop-back route was never taken. The route is real and visible on the plan (`recheck-repairs → repair-failed-levels when repairOutcome = retry`, `0/3 traversals`) but its counter never moved. |
| Route not taken, dimmed | No step was skipped, so no node dimmed. |

Total Workflows spend: $2.06.

Both are described in prose in the guide instead. Forcing them would mean
seeding a level that cannot be repaired on the first pass, which is another paid
run to photograph a counter.

## 10. Phase 2: Meridian capture

Objective: All 12 Rooms screenshots exist from a live multi-member Room.

Gate: do not start until Phase 1 acceptance criteria pass.

### Work checklist

- [x] Rehearse the Room cheaply: small model, read-only members, no delivery.
- [x] Adjust the brief until the rehearsal produces the intended team shape.
- [x] Capture shot 1 — Rooms overview, empty state.
- [x] Capture shot 2 — brief form: problem, spend, time, access, delivery.
- [x] Capture shot 3 — Sero designing the room.
- [x] Capture shot 4 — the proposal: roster, per-member access, limits, delivery.
- [x] Capture shot 5 — Adjust, changing the proposal in plain English.
- [x] Start the live Room with edit-and-push withheld from the fixer.
- [x] Capture shot 6 — Room running: roster, activity, spend and time.
- [x] Capture shot 7 — a member open: transcript and current task.
- [x] Capture shot 8 — a member question in Needs you.
- [ ] Capture shot 9 — the access escalation approval. NOT TAKEN: no escalation
      happened. See "Access is not a sandbox" below.
- [ ] Capture shot 10 — two claims on the same path. NOT TAKEN: the team never
      contended. Three specialists took three separate files, which is what the
      brief asked for, so no path was claimed twice in any of the four runs.
- [x] Capture shot 11 — paused, with the stop banner.
- [x] Capture shot 12 — completion: result, artifacts, PR link, cost.
- [x] Record the run's total cost in this plan.
- [x] Record any shot that could not be reproduced, and why.

### Notes

The first live run used Anthropic models and stopped at $3.22 when the account
ran out of credit, with the three fixes committed but no pull request. Its state
was still worth photographing: the twelve section views below were captured from
it for nothing.

The finishing run is pinned to another provider and uses a clean clone, so the
empty-list shot is genuine and the first run's worktrees and branches stay out of
frame:

```
SERO_E2E_MERIDIAN_DIR=~/Documents/Dev/projects/sero/demos/meridian-run2 \
SERO_ROOM_MODELS=openai-codex/gpt-5.6-terra SERO_ROOM_THINKING=medium
```

`SERO_E2E_DOCS_ROOMS_REUSE=1` re-photographs the last Room for nothing. Use it
for every framing change; a paid run only has to produce the states that need a
Room to be moving.

### The sections a Room keeps off its activity feed

The Room detail is five tabs, five activity filters and a member panel with two
of its own. A guide showing only the Highlights feed leaves most of the module
undocumented, so the capture sweeps all of them:

| View | File |
| --- | --- |
| Brief, work, claims, artifacts, roster changes | `orchestrator-rooms-{brief-tab,work,claims-tab,artifacts,changes}` |
| Activity: all events, decisions only | `orchestrator-rooms-{activity-all,decisions}` |
| Watch | `orchestrator-rooms-watch` |
| A member's session and its mandate | `orchestrator-rooms-member`, `orchestrator-rooms-member-info` |

Each is cropped to its own panel. A stopped Room carries its stop banner across
the top of every screen, and that banner belongs in the picture of a stopped Room
and nowhere else. The member Info tab prints the worktree's absolute path beside
the mandate, so that one shot stops above the card holding it.

### The finishing run

Run 4, in a clean clone at `demos/meridian-run4`, on
`openai-codex/gpt-5.6-terra` at medium effort:

| | |
| --- | --- |
| Result | `completed`, 5 members, 29 turns |
| Time | 21 minutes of the 1 hour allowed |
| Spend | $1.63 of the $5.00 allowed |
| Delivered | workspace-files; PR #1 opened on the demo repo |
| Question | genuine — Ada blocked the team on the rounding rule at 10 minutes |
| Review | genuine — Margaret returned a rounding compatibility regression, Grace corrected it |

Spend across the whole phase: **$1.63** for run 4, plus about **$5.50** on the
three abandoned Anthropic runs, plus **$2.06** for the Lattice workflow captures
in Phase 1. Every re-framing pass after run 4 was free.

### Access is not a sandbox (finding)

Every member was granted `edit-workspace`, and the proposal said so. Ada still
pushed a branch and opened a pull request, using `bash` and the machine's
authenticated `gh`. No escalation was requested, and the timeline holds exactly
one `approval` event — the rounding question.

This is the same fault class as §13c and §13d: the access label describes the
Sero tools a member holds, not what the member can reach. A member with the
shell can do anything the user's account can do. Two consequences:

- The guide must not promise that a withheld push permission forces an
  escalation. `guide/rooms.md` now says plainly that access selects tools and is
  not a sandbox.
- Worth a decision separately from this docs plan: either the shell is scoped
  for members below `edit-and-push`, or the proposal stops implying that access
  bounds behaviour. Do not fix it inside this plan.

A related mismatch in the same run: Ada's configured tools include `question`,
but the grant read back from the host is
`bash, read, grep, find, ls, edit, write, sero-cli` — `question` was stripped.
She still reached the user, so the room protocol path does not depend on that
grant, but the divergence is the §13c symptom again.

### Acceptance criteria

- [x] 12 images exist, or every missing image is named with its reason. 10 of 12
      exist; shots 9 and 10 are named above with their reasons.
- [x] The Room reached `completed` and opened a real pull request.
- [x] The question was genuine, not simulated. No approval occurred to be
      genuine or otherwise.
- [x] No image shows a private path, token, or real repository name.
- [x] Total spend is recorded and stayed inside the agreed ceiling.

## 11. Phase 3: Guide pages

Objective: Four guide pages, each a single Diátaxis type, written against the
captured images.

### Work checklist

- [x] Rewrite `guide/workflows.md` as a tutorial around Lattice.
- [x] Add the plan map section: toggle, orientation, zoom, node selection, and
      the badge legend in plain words.
- [x] Move Library and Catalog out of the tutorial.
- [x] Create `guide/workflows-advanced.md` as a how-to guide.
- [x] Rewrite `guide/rooms.md` as a tutorial following one Meridian Room.
- [x] Create `guide/rooms-advanced.md` as a how-to guide.
- [x] Rewrite `guide/orchestrator.md` to open on the two situations.
- [x] Define every newcomer term where it first appears: Conductor, member,
      worktree, claim, gate, fan-out, feedback route.
- [x] Write alt text that says what each picture shows.
- [x] Cross-link each guide to its reference page and its advanced page.
- [x] Run the anti-AI pass over all four pages, and a plain-language pass for a
      reader who has never used Sero.

### The plain-language pass

Words a new reader would not know were replaced everywhere they were not a UI
label: checkout → its own copy of the repository, roster → the team list,
mandate → its instructions, escalation → asking for more access, glob → a
pattern such as `src/*.js`, reconcile → check against. Where the demo's own
output uses trade terms (idempotency, serialised), the prose says what happened
instead: "a retried payment charges once", "payments that arrive together no
longer overwrite each other".

Sero names Room members after the fault they own, so the names on the
screenshots read oddly on their own. The tutorial says so once, at the roster,
rather than letting the reader wonder.

### Acceptance criteria

- [x] A reader with no Sero experience can finish either tutorial unaided.
- [x] Neither tutorial contains a reference table or a conceptual digression.
- [x] Neither advanced page repeats tutorial steps.
- [x] Every screenshot is referenced by the prose next to it.
- [x] No term is used before it is defined.
- [x] No page exceeds 500 lines. Longest is `guide/rooms.md` at 263.

## 12. Phase 4: Reference pages

Objective: No shipped Orchestrator control is undocumented.

### Work checklist

- [x] Add the plan map legend to `reference/workflows.md`: every badge, its
      field, and its meaning.
- [x] Document the map controls: mode, orientation, zoom, fit.
- [x] Add the `gate` entry with its approval behaviour.
- [x] Add the `produces` entry and how a decision drives a route.
- [x] Check `reference/rooms.md` claim and artifact coverage against the code.
- [x] Check the `rooms` tool action table against the shipped actions.

### Acceptance criteria

- [x] Every field in the section 3 badge table has a reference entry.
- [x] The action table matches the shipped tool, with no missing or stale rows.
- [x] A reader can find any single fact in under 30 seconds.
- [x] Reference pages state facts and do not instruct.

## 13. Phase 5: Wiring and verification

Objective: The site builds and every new page is reachable.

### Work checklist

- [x] Add both advanced pages to `rspress.config.ts`.
- [x] Add both advanced pages to `guide/index.md`.
- [x] Run `pnpm build` in `apps/docs-site`.
- [x] Check every internal link resolves.
- [x] Check every image resolves and appears in the built output.
- [x] Review the built pages at desktop and narrow widths.
- [x] Commit with a Conventional Commit message.

### How the built site was checked

`pnpm --filter @sero/docs-site typecheck` runs the full rspress build, and it
fails on a missing image — which is what caught two wrong filenames while the
guides were being written.

The built site was then served and driven at 1440px and 420px. Every internal
link answered 200, no image failed to load, and neither width scrolled sideways.

One honest limit: a panel-wide shot is 2194px, and at 420px the reader has to
zoom to read the text inside it. That is true of every screenshot already on the
site. The shots that matter most for reading — the plan map crops and the Room
detail tabs — are 598px wide and were cropped for exactly this reason.

### Acceptance criteria

- [x] The docs site builds with no errors.
- [x] Both new pages appear in the nav and the guide index.
- [x] No broken link and no missing image in the built output.
- [x] Images stay legible at narrow width, with the limit above recorded.

## 13a. Product fixes found while capturing

Driving the real app for the screenshots turned up product problems. They are
not documentation work, but they were found here and should not be lost.

### Refine gives no sign that it is working

**What happens.** Press **Update plan** and nothing visibly changes. The box and
the button grey out, the text you typed is cleared, and the plan map carries on
showing the old plan until the revision lands — which can take a minute or more.
There is no spinner, no message, and no indication the model was even asked.

Both the author of this plan and its reviewer read the screen as frozen, on
separate occasions, and killed a run that was working correctly.

**Why it is wrong.** `RefinePlan.tsx` passes `busy` to `disabled` and nothing
else. Initial plan generation already solves this: `PlanMapSkeleton` says "The AI
is shaping the plan…" while it waits. Refine has no equivalent.

### Work checklist

- [x] Show a working state on the plan while a revision is in flight — reuse the
      generation skeleton's language rather than inventing new wording.
- [x] Keep the request visible while it runs, instead of clearing the box the
      moment it is sent. A revision that fails currently loses what was asked.
- [x] Say what changed when the revision lands, so a plan that comes back
      subtly different does not look like nothing happened.

### Acceptance criteria

- [x] Pressing **Update plan** produces a visible change within one frame.
- [x] A revision taking 60 seconds is obviously still working throughout.
- [x] A failed revision leaves the typed request recoverable.

## 13b. Discovery: work that reports success without doing anything

Building the capture harness produced three bugs of one shape — a green result
with no work behind it:

| Where | What it reported | What actually happened |
| --- | --- | --- |
| Capture watch loop | "2 passed" in 9 seconds | Saw a finished status on its first check, exited, captured nothing |
| Approval gate crop | A valid 13 KB JPEG | A 20-pixel strip of a card header, useless as documentation |
| Gate approval click | Question marked answered | The click missed, the error was swallowed, and a live run stalled |

None raised an error. Each cost minutes because an exit code was read instead of
the output being looked at.

That is the same family as the hollow-success problem already fixed once in the
Orchestrator, where a step could claim completion without delivering. This task
is to find out whether it is still live anywhere, in the product or its tests,
and decide what needs doing. It is discovery first: the outcome may be that
nothing needs changing.

### Work checklist

- [x] Search the Orchestrator runtime and the Rooms runtime for a claim of
      success that is not checked against an observable effect.
- [x] Search for swallowed errors — `.catch(() => undefined)`, empty catch
      blocks, and optional clicks — where the caller then treats the step as
      done.
- [x] Check the e2e specs for tests that can pass while asserting nothing,
      especially watch loops that can exit before their first real check.
- [x] Check that delivery receipts still cannot be satisfied by a claim alone.
- [x] Write up what was found, and what does or does not need fixing.

### What was searched

Every `.catch(() => …)` and empty catch in `runtime/` and `extension/` of the
Orchestrator plugin (11 in total), both docs capture specs, the loop delivery
seam (`runtime/delivery/`), and the Room finish path
(`runtime/rooms/room-command-delivery.ts`, `room-delivery.ts`).

### Findings

| # | Where | Claims | Does not verify | Judgement |
| --- | --- | --- | --- | --- |
| 1 | `runtime/rooms/room-delivery.ts` `receiptProblems` | a Room delivered its result | that the thing the ref names exists. A Room delivering to `pr` is accepted on a URL-shaped string | **Needs fixing** — see below |
| 2 | `runtime/delivery/verify-receipt.ts` | a workflow's receipt is real | nothing, when the observation itself throws: `listPullRequests()` failing is read as "cannot observe" and the receipt stands | Acceptable as written. Documented fail-soft, and the structural contract has already passed |
| 3 | `docs-rooms.agent.spec.ts` watch loop | a picture was captured | that the screenshot was written — `taken.add()` ran after a caught failure | Fixed here; two lines, in the harness |
| 4 | `docs-rooms.agent.spec.ts` approval loop | an approval was answered | that the click landed — the same defect already fixed in the Workflows spec, which stalled a live run for its whole time limit | Fixed here: retried up to three times while the request is still open |
| 5 | `runtime/rooms/room-lifecycle.ts` (3 sites), `room-app-actions.ts` | nothing | — | Acceptable. Each is best-effort state cleanup on a path that already returns `fail(...)`, so the caller reports the failure |
| 6 | `runtime/delivery/availability.ts`, `loop-store.ts` | nothing | — | Acceptable. A missing tool catalogue and a failed legacy rename are both real "not there" answers |

### Finding 1 in full

Workflows and Rooms disagree about the same receipt. A workflow step that says
it opened a pull request has its ref cross-checked against the live open-PR list
(`verifyReceipt`), and a ref that matches nothing downgrades the delivery. A Room
finishing to the same destination is checked only for shape: destination match,
non-empty ref, non-empty summary, parseable timestamp, and an approval token for
an external send. Nothing looks for the pull request.

So the mechanism that fixed hollow success for Workflows was never extended to
Rooms. A Room can finish `completed` with a plausible URL and no pull request
behind it.

This becomes its own task rather than being fixed inside this discovery. The fix
is small — `applyDeliveryContract` already exists and is destination-driven — but
it changes when a Room can call itself finished, which deserves its own change
and its own test.

### Acceptance criteria

- [x] Every finding names the file, what it claims, and what it fails to verify.
- [x] Each finding is judged: needs fixing, acceptable as written, or already
      covered by a durable check.
- [x] Anything that needs fixing becomes its own task — finding 1 is written up
      above as a task of its own.
- [x] A finding of "nothing needs changing" is a valid result. It was not the
      result: one real gap was found.

## 13c. Bug: an edit-workspace Room cannot start

Found while capturing the Meridian Room. The Room reached `paused` with zero
turns and nothing spent:

```
conductor-failed: "Persistent session denied: tool-not-allowed"
```

**The chain.** The planner gives every member `git_manager`. The Room's access
choice was `edit-workspace`. At approval, `clamp.ts` applies the permission
profile and removes `git_manager` from the policy, because
`applyPermissionProfile` requires `vcs: 'push'` for it. The session request
still asks for the member's full configured tool list, `git_manager` included.
`validate.ts` compares request against policy and denies.

Approval and execution therefore describe different tool sets — which is what
the comment above that very filter says must not happen:

> Apply the same profile filter before approval that session construction
> applies at runtime. Approval and execution must describe one tool set.

**Why it matters.** The Conductor is started first, so the whole Room pauses
before any member takes a turn. Any Room granted `edit-workspace` appears to be
affected, which is the normal choice for a team that should not push.

This belongs with [13b](#13b-discovery-work-that-reports-success-without-doing-anything):
a contract agreed in one place and bypassed in another.

### Work checklist

- [x] Reproduce with an `edit-workspace` Room and confirm the denied tool is
      `git_manager`.
- [x] Decide which side is wrong: the member's tool list should never have
      carried a tool its access cannot support. Filtering the request instead
      would keep the proposal promising a tool the member never gets.
- [x] Prevent the planner from giving a member a tool its access level forbids,
      so the proposal never promises it.
- [x] Add tests: `room-access-map.test.ts` holds the map to the host's VCS-write
      list, and `room-smoke.test.ts` covers the new validation rule.

**The fix.** Three changes, each closing one step of the chain:

1. `shared/room-access-map.ts` now labels `gh`, `git_manager`, `git_push` and
   `create_pr` as `github-write`, matching the host's VCS-write group. Before
   this the map had no rule for `git_manager` at all.
2. `shared/room-validation.ts` refuses a blueprint that pairs a `github-write`
   tool with a permission level below `edit-and-push`
   (`push-tool-without-push-permission`). The pair can no longer be approved.
3. `runtime/rooms/planner-prompt.ts` states the rule, so the planner writes a
   legal team rather than failing validation and retrying.

**A second, wider instance of the same fault.** The next live Room paused for the
same reason with a different tool: the Conductor was given `question`, which the
host does not classify at all, and the host fails closed. Members now record what
the grant actually granted and their sessions ask for exactly that
(`runtime/rooms/room-lifecycle.ts`, `member-grant.ts`), so request and policy can
no longer differ for any tool class. Removals are logged, because the team was
designed around that tool.

Still open, and not needed for the capture: the planner is offered the whole
workspace tool catalogue, including tools no Room member can ever be granted. It
should be offered only what a Room can hold.

### Acceptance criteria

- [x] A tool removed by the permission profile can no longer reach the proposal,
      so the user is never shown a tool the member cannot use.
- [x] An `edit-workspace` Room starts and its members take turns. Confirmed live
      by run 4: five members, 29 turns, no `tool-not-allowed` pause.
- [ ] The denial message names the tool, rather than only its error code. Not
      done: it needs a host change, and the fix above stops the denial happening.

## 13d. Bug: a Room member is told to use a command it does not have

Found in the live Meridian Room, in three of the four member transcripts.

**What happens.** A member tries to commit with `git commit` in bash. The host
blocks it and answers:

> Mutating git commands are managed by Sero — use the sero-cli tool instead:
> `sero git status`, `sero git checkpoint [msg]`, `sero git push [branch]`, …

The member does as it is told, and gets `ERROR: Unknown command: git`. It runs
`sero help` and sees only `orchestrator`, `room`, `rooms` and `help`.

**Why.** Both halves are working as designed and they contradict each other.
`git-turn-undo-capture.ts` blocks mutating git in bash and names the shared CLI's
`sero git` commands. A Room member does not have the shared CLI: `wiring.ts`
gives each member a PRIVATE registry holding only its own app's commands, on
purpose — a member that could reach `sero app click` could drive the user's
desktop, which no Room approval describes.

So the advice is true for a chat agent and false for a Room member.

**What it costs.** Eight blocked bash calls and nine unknown-command errors
across three members in one run, each one a tool call, tokens and part of a turn.
It is also visible in every member transcript the guide screenshots.

**What saves it.** Nothing is lost: the host checkpoints a mutating turn at
`agent_end`, so the work does get committed. The member never learns that, and
spends its own turn trying to do it by hand.

### Options

| Option | Effect |
| --- | --- |
| A. Make the block message context-aware | When this session's registry has no `git` command, say what is true for it: "your changes are committed for you at the end of your turn." Small, honest, no new authority |
| B. Give members a `git` command scoped to their `vcs` level | More capable, and a bigger decision: it puts a VCS surface inside the member registry that the Room approval would have to describe |

Recommendation: A. B is a design decision, not a bug fix.

### Work checklist

- [x] Decide between A and B. **A**, implemented.
- [x] Implement, with a test that a member session's block message names only
      commands that member's registry actually holds.

**The fix.** `create-sero-extension.ts` already treats `options.cliRegistry` as
"this session has a private command surface", so that flag now reaches
`registerGitTurnUndoCapture`. A session without the shared CLI is told the truth
instead: it has no git command, and it does not need one, because everything it
changes is committed when its turn ends.

Found again on the very next live run, and worse: two members — including the
Conductor — did not work around it but stopped and asked the user how to commit,
which is not a question a user can answer. That would have ended the run.

## 13e. Gap: a read-only reviewer cannot read what it is reviewing

Found in the live Meridian Room, and argued out between two members in the open.

**What happens.** The Conductor integrates three branches and asks the reviewer
to check them together. The reviewer has no worktree, no shell and no git — it
was approved `read-only`, which is the right level for a reviewer. The `patch`
artifact it is handed carries a *ref* to the integration branch, so there is
nothing in it to read. It publishes a blocking review saying so:

> The supplied patch artifact contains only the ref instruction, not a diff, and
> this harness exposes no shell/git execution or worktree creation tool.

The Conductor accepted the block and republished the change as a readable
accounting of every source and test edit. Both members behaved correctly, and it
cost several turns.

**Why it matters.** The Room protocol tells members that nobody else can open
their checkout and that artifacts are how work is shown. A `patch` artifact whose
ref names a branch quietly breaks that promise for any member without git — which
is every read-only member, and read-only is what a reviewer should be.

### Options

| Option | Effect |
| --- | --- |
| A. A patch artifact carries its diff | The artifact is self-contained, which is what the protocol already claims. Costs artifact size on a large change |
| B. Give a reviewer read access to the integration branch | Truer to a real review, but it puts a checkout in the hands of a member the user approved as read-only |

Recommendation: A. The protocol already tells members artifacts are how work
travels; this makes that true for the one kind that carries code.

### Work checklist

- [ ] Decide between A and B.
- [ ] Implement, with a test that a member holding no git tool can read a
      published patch.

## 13f. Gap: an access level selects tools, it does not confine a member

Found in run 4, the phase 2 capture run.

**What happens.** Every member was granted `edit-workspace`, and the proposal
told the user so. Ada then pushed a branch and opened pull request #1, using
`bash` and the machine's authenticated `gh`. No approval was requested. The
Room's timeline holds one `approval` event, and it is the rounding question.

**Why.** An access level decides which Sero tools the member is granted. `bash`
is one of those tools at `edit-workspace`, and a shell reaches anything the
user's account reaches. `git-turn-undo-capture.ts` blocks mutating git *in a
session that Sero manages checkpoints for*; it is not a boundary around what the
member can run.

**What was done now.** Three guide pages claimed, in different words, that
withholding push forces an escalation. All three were corrected to say that an
access level selects tools and is not a sandbox.

### Options

| Option | Effect |
| --- | --- |
| A. Scope the shell below `edit-and-push` | Closest to what the proposal implies. Needs a real command boundary, not a message; a member without a usable shell also loses test running |
| B. Stop implying that access bounds behaviour | Free, already done in the docs. Leaves the proposal's "lowered to edit-workspace" line reading stronger than it is |
| C. Make the proposal say what the level does | The approval screen states that a member with the shell can run any command the user can. Honest, cheap, and does not weaken the member |

Recommendation: C now, A as its own piece of work. Do not fix it inside this
docs plan.

### Work checklist

- [x] Correct `guide/rooms.md`, `guide/rooms-advanced.md` and
      `guide/orchestrator.md`.
- [ ] Decide between A, B and C.

## 14. Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Worlds and capture harness | Done | Both worlds seeded; two capture specs over a shared crop helper |
| 1 Lattice capture | Done | 12 of 13; fan-out expansion and two run states recorded as missing |
| 2 Meridian capture | Done | Run 4 completed on gpt-5.6-terra: $1.63, 21 min, 29 turns; 10 of 12 shots, 2 recorded with reasons |
| 3 Guide pages | Done | Four pages, each one Diátaxis type; plain-language and anti-AI passes run |
| 4 Reference pages | Done | Map legend, routing fields, claims and artifacts added; action table verified |
| 5 Wiring and verification | Done | Build clean, links and images resolve, checked at 1440px and 420px |
| 13f Access is not a sandbox | Raised, not started | Run 4 pushed and opened a PR on `edit-workspace`; docs corrected, product decision open |
| 13a Refine feedback fix | Done | Working line, kept request, outcome stated; covered by `refine-plan.test.tsx` |
| 13b Hollow-success discovery | Done | 6 findings; 2 harness bugs fixed, 1 product gap raised as its own task |
| 13e Reviewer cannot read a patch artifact | Raised, not started | Found live; costs turns and blocks the review |
| 13d Member told to use a missing command | Done | Option A; covered by `git-turn-undo-capture.test.ts` |
| 13c edit-workspace Room cannot start | Fixed, awaiting live proof | Map, validation and planner prompt fixed; phase 2 run confirms it |

This table and the phase checkboxes are updated as each task completes, not at
the end.

## 15. Writing rules

- Second person, present tense, one idea per sentence.
- No jargon shortcuts in the guides. "A separate copy of your files" before
  "worktree", every time.
- Reference pages stay precise and technical, but still spell out terms rather
  than assuming them.
- Each guide opens on a situation, not a definition.
- Screenshots carry alt text that says what the picture shows, not "screenshot
  of the panel".
