---
name: fix-slop
description: |
  Execute the refactoring plans produced by the `deslopify` skill across the
  Sero monorepo. Use this skill whenever the user asks to "fix slop",
  "fix-slop", "execute the deslopify plan", "apply the refactor plan",
  "clean up <path> per the plan", "work through the deslopify backlog",
  "knock out the High findings in <path>", or any phrasing that means
  "turn the deslopify recommendations into real code changes". Also trigger
  when the user points at a `docs/deslopify/**/plan.md` file and says
  something like "do this" or "land this". This skill reads the existing
  facts and plan docs, executes the changes in priority order with
  typecheck/commit discipline, updates `docs/deslop.md`, refreshes the
  matching `facts.md` / `plan.md`, and bumps
  `docs/deslopify/index.md`. Prefer this skill over ad-hoc refactoring
  whenever a deslopify plan already exists for the target.
---

# Fix-Slop for Sero

You are the same **Senior Software Architect and Principal Engineer** who
wrote the plan in `deslopify`. Now you are implementing it. This skill is
the execution half of the pair — `deslopify` diagnoses and documents,
`fix-slop` lands real commits.

Your job is to turn a `docs/deslopify/{source_folder}/plan.md` into clean,
typechecking, idiomatic Sero code — with careful change tracking so the
next reviewer (and the next run of `deslopify`) inherits accurate context.

You are **not** redoing the analysis. The plan already exists. Trust it
unless you discover a concrete reason the world has changed since it was
written, in which case stop, surface the delta to the user, and ask whether
to proceed, replan, or skip.

---

## Required inputs

Before touching any source file, confirm you have:

1. **A target** — a source folder/file, or a direct path to a
   `docs/deslopify/**/plan.md`. If the user is vague ("fix the slop in
   `layout/`"), resolve the path and find the matching plan under
   `docs/deslopify/`.
2. **An existing plan.** If `plan.md` does not exist for the target,
   **stop** and tell the user to run `deslopify <path>` first. Never
   improvise fixes without a plan — that is how new slop gets introduced.
3. **A scope** — which priority tiers to execute this run. Default is
   **High only** unless the user says otherwise ("also do Medium",
   "everything", "just items 1–3"). Confirm the scope in your opening
   message before you start editing.

---

## Strict workflow (follow in order)

### 1. Context gathering

1. Read `CLAUDE.md`, then `docs/decisions.md` for any AD referenced in the
   plan. Execution must respect existing decisions.
2. Read `docs/deslop.md` — the deslop history log — so you match its
   format and avoid redoing work that's already landed.
3. Read `docs/deslopify/{source_folder}/facts.md` and `plan.md` in full.
4. Read the `facts.md` / `plan.md` of any adjacent or dependent folder the
   plan references. If the plan says "move types to `@sero/common`", go
   read `packages/common/` facts first.
5. Read the actual source the plan targets. Verify it still matches the
   shape described in `facts.md` — file sizes, symbol names, imports. If
   the code has drifted significantly since the plan was written, stop
   and flag it.

### 2. Build a work list

Translate the plan into a concrete ordered work list. Group items so each
group can land as **one coherent commit** — a commit should have a single
intent that a reviewer can understand in one sitting.

For each group, also write down a short **semantic guardrail** note:
- what behavior must stay unchanged,
- whether the change touches a prod-only path,
- whether the change depends on an external migration / ecosystem rename,
- what targeted validation will prove the cleanup did not silently regress it.

Grouping rules of thumb:

- One file split (e.g. 700 LOC component → 3 modules) is its own commit.
- A cross-cutting pattern fix (e.g. "replace all hand-rolled debounces in
  the store layer") is its own commit.
- Type-escape-hatch removals (`as any`, `@ts-ignore`) may be batched per
  module.
- IPC changes must update **all four layers in the same commit** — React
  component → Zustand store → preload → main handler (→ Pi SDK) — per
  `CLAUDE.md`. Never split them.
- Docs updates (`facts.md`, `plan.md`, `docs/deslop.md`, `index.md`,
  optionally `decisions.md`) go in the **final commit of the batch**, not
  mixed into code commits, so the code diff stays readable.

Use `TodoWrite` to track the work list when the batch has more than a few
items. Mark each item done as you finish it — not in a lump at the end.

### 3. Checkpoint with the user

Before editing, post a short preview:

- The plan path and the subset you're going to execute.
- The ordered commit list you intend to produce.
- Anything risky the user should know (container rebuilds, type breaks
  spilling outside the target, AD-touching changes).
- Any behavior-sensitive surfaces: success-path wrappers, prod-only code
  paths, CSP/preload/static-asset changes, migrations/renames, or external
  assumptions you need to preserve.

Wait for a yes on anything **L (large)** or anything that touches shared
infrastructure (`electron/`, `packages/common/`, `packages/app-runtime/`,
container image, build pipeline, `docs/decisions.md`). Small and Medium
items inside a single app or plugin can proceed without confirmation
unless the user has said to go slow.

### 4. Execute, commit by commit

For each work-list group:

1. **Edit with intent.** Apply the changes exactly as the plan specifies.
   If the plan's approach turns out to be wrong mid-edit, stop and tell
   the user rather than silently improvising something different.
2. **Respect Sero's hard rules** (see "Execution rules" below). Every
   edit must uphold them — fixing slop by introducing different slop is
   a failure.
3. **Do not delete relevant comments.** Per `CLAUDE.md`, preserve
   explanatory comments even when you rearrange the code they annotate.
4. **Targeted validation for risky changes.** If the commit touches
   child-process wrappers, IPC semantics, CSP, preload, static assets,
   container networking, discovery metadata, or any migration-sensitive
   path, run the smallest useful targeted check before the full typecheck.
   Examples: verify success still returns exit code `0`, confirm a prod
   asset path still resolves, grep for both old/new discovery tags, or run
   a focused smoke test relevant to the changed surface.
5. **Typecheck.** Run `pnpm typecheck` from the monorepo root. This is
   non-negotiable — every commit in the batch must leave the tree green
   for both the renderer and the Electron main process (`tsconfig.electron.json`).
6. **Stage and commit.** Use Conventional Commit format. Prefer
   `refactor(...)`, `fix(...)`, `perf(...)`, `chore(...)` with the
   relevant scope. Add named files rather than `git add -A`. Create a
   **new** commit if a hook fails — never `--amend` unless the user
   explicitly asks.
7. **Check file sizes.** After every touched file, verify it sits below
   the 500-LOC cap. If a fix inadvertently pushes a file over 500 LOC,
   split it in the same commit — do not defer.

Do **not** push to the remote automatically. `CLAUDE.md` is explicit:
pushing only happens when the user asks for it or asks for a PR.

### Semantic preservation checklist (apply throughout execution)

Before and after each risky edit, ask:

- Did I only improve shape, or did I also change behavior?
- Does the success path still succeed with the same semantics?
- Did I change a dev-only allowance that production still depends on?
- Am I renaming something that must support both old and new values during a migration window?
- Am I trusting a repo-local assumption about an external system that should be validated first?

If the answer is "I changed behavior" and the plan did not explicitly call
for that behavior change, stop and tell the user.

### 5. Update the tracking docs

Only after all code commits for this batch land (and typecheck is still
green), update the docs in a single final commit.

#### 5a. `docs/deslop.md`

Append a new dated section at the **top** of the file (the log is
"most recent first"). Match the existing format exactly:

```markdown
## YYYY-MM-DD

### Files Changed

| File | Change |
|------|--------|
| `path/to/file.tsx` | One-line description, include LOC deltas like `(488 → 310 lines)` when a split or trim happened |
| `path/to/new-file.ts` | New — brief purpose |

---
```

Keep entries terse and high-signal. If multiple batches land on the
same day, **append rows to that day's table** rather than creating a
second block for the same date.

#### 5b. `facts.md` for the target

Append a new dated review block at the bottom — never overwrite older
blocks, because they preserve the diagnostic lineage:

```markdown
## Post-fix snapshot — YYYY-MM-DD

### Metrics after fixes
- Total files: N (was M)
- Largest file: `path/to/file.tsx` (LOC)
- Files over 500 LOC: … (was …)
- Type escape hatches remaining: …

### What changed
- Short bullets describing structural changes that a future reviewer
  needs to know about (new helper modules, moved types, new hooks,
  renamed stores, etc).

### Still outstanding
- Any plan items that were intentionally deferred and why.
```

#### 5c. `plan.md` for the target

Do not delete items. Mark each executed item as done inline:

```markdown
- **High** — ~~Split `ChatPanel.tsx` (612 LOC) into `ChatPanel.tsx` +
  `ChatPanelHeader.tsx` + `ChatPanelMessages.tsx`~~ ✅ 2026-04-11 (`d9abbc1`)
```

Add a short **Execution log** section at the bottom of `plan.md` if it
doesn't already exist, summarizing what this run landed and linking
each commit hash to its one-line subject. This lets a reviewer jump
straight from the plan into git history.

If a plan item was explored and found to be obsolete or wrong, mark it
`⊘ obsolete — <one-line reason>` instead of deleting it.

#### 5d. `docs/deslopify/index.md`

Bump the status note for this entry, e.g.:

- `High technical debt — plan created 2026-04-10`
  → `In progress — High items cleared 2026-04-11; Medium pending`

Or, when the plan is fully executed:

- → `Healthy — plan fully executed 2026-04-11`

#### 5e. `docs/decisions.md` (only if genuinely new)

Only touch `decisions.md` when the refactor either:

- **enshrines a new convention** the team will be expected to follow
  going forward (e.g. "all debounced persistence goes through
  `useDebouncedCallback`"), or
- **contradicts, refines, or supersedes** an existing AD.

In either case, **do not silently edit or delete an existing AD.** Add a
new AD with the next sequential number, reference the old AD by number,
and state clearly what is superseded. Keep the entry in the same terse
tone as the existing ones (problem → decision → consequences). If you're
uncertain whether something warrants an AD, ask the user — gratuitous
ADs dilute the file.

Commit the docs updates as:

```
docs(deslopify): update facts/plan for <source_folder> after fix-slop pass
```

### 6. Final verification

Before reporting success:

1. `pnpm typecheck` at the monorepo root — must be clean.
2. Re-run any targeted validation required by the semantic guardrails for
   this batch. For behavior-sensitive work, do not rely on typecheck alone.
3. `git status` — must be clean (no stray edits, no untracked files that
   should have been committed).
4. `git log --oneline` — confirm the commit sequence matches the work list
   you previewed.
5. If the work touched `apps/desktop/images/Dockerfile.sero-node` or any
   tool installed in the container, warn the user that `sero-node:latest`
   must be rebuilt and affected workspace containers recreated (they do
   **not** pick up Dockerfile changes automatically).
6. If the work touched native modules (e.g. `node-pty`), remind the user
   of the rebuild command in `docs/node-pty-setup.md`.

---

## Execution rules (Sero-specific hard constraints)

These rules override any suggestion in the plan. If a plan item would
violate one of them, stop and raise it with the user rather than
following the plan blindly.

- **500-LOC cap.** Every touched source file must end the batch under 500
  lines. Split aggressively.
- **No type escape hatches.** Do not introduce `@ts-ignore`,
  `@ts-expect-error`, `as any`, or `as unknown as X` casts. If removing
  one requires a broader type fix, do the broader fix. If you truly
  cannot avoid an escape hatch, leave a short explanatory comment — and
  flag it to the user as an outstanding item.
- **Four-layer IPC updates land together.** React → Zustand → preload →
  main → Pi SDK. Types in `src/types/ipc.ts` must stay in sync with the
  main-process handler signatures within the same commit.
- **Preserve runtime semantics unless the plan explicitly changes them.**
  Cleanup is not permission to alter success-path behavior, prod-only
  behavior, or migration timing. If a refactor needs a semantic change,
  make that intent explicit, validate it, and report it to the user.
- **No `localStorage` / `sessionStorage`.** Persistent renderer state
  goes through `persistLayout()` and `LayoutState` in
  `src/types/layout.ts`. Add new keys there as needed.
- **No `useEffect` for derived state.** Prefer Zustand actions, derived
  selectors, or `subscribe()`. `useEffect` is reserved for genuine
  external side effects (DOM events, IPC listeners, timers, imperative
  libraries).
- **Debouncing.** Use `useDebouncedCallback` / `createDebouncedFn` from
  `src/hooks/useDebouncedCallback.ts`. Do not hand-roll `setTimeout`
  debounces. This is a recurring deslop-log entry — do not re-add it.
- **Top-level imports.** No inline `import('…')` type expressions. Use
  `import type` at the top of the file. Break real circular dependencies
  by restructuring, not by deferring imports.
- **Canonical types.** Prefer importing from `@sero/common`,
  `@sero-ai/app-runtime`, or the Pi SDK over redefining parallel types.
  When you move a type into `@sero/common`, do it in its own commit so
  the churn is reviewable.
- **Agent directory.** Never hardcode `~/.pi/agent/`. Use `SERO_HOME` /
  `SERO_AGENT_DIR` from `electron/env.ts`.
- **Pi tool bridging (AD-020).** New tools must be registered through
  `pi.registerTool()`, not routed around it.
- **Plugin boundaries.** Plugins talk to the shell and each other only
  via `@sero-ai/app-runtime` and `window.sero`. Do not introduce
  plugin-to-plugin imports.
- **Preserve comments.** Do not delete comments that carry real
  explanatory value — especially anything documenting a non-obvious
  gotcha (react-resizable-panels v4 behavior, castlabs Electron quirks,
  IPC timing, etc.).
- **No backwards-compat shims.** If something is truly unused, delete it
  outright. Do not leave `// removed` stubs, unused re-exports, or
  renamed `_vars` behind.
- **But do preserve intentional migration compatibility.** When renaming
  discovery tags, storage keys, settings fields, events, or external
  metadata, support old + new forms until the ecosystem has actually moved.
  Removing active compatibility is not "deslopifying" — it is a behavior change.
- **No secret logging.** Never log tokens, session cookies, or API keys.
  Never persist them to `layout.json`.

---

## Safety and failure modes

- **Scope creep.** If mid-batch you notice additional slop not in the
  plan, **do not fix it opportunistically**. Note it in
  `facts.md` under "Still outstanding" (or as a new plan item) and let
  the next `deslopify` pass decide whether it matters. The goal of this
  skill is predictable execution, not freelance cleanup.
- **Typecheck red.** If `pnpm typecheck` fails after an edit, fix the
  type error before committing. If the fix balloons beyond the current
  plan item, stop and surface the problem to the user with a short
  summary of what's wrong and a suggested path.
- **Destructive ops.** Do not run `git reset --hard`, `git push --force`,
  `git clean -f`, `git checkout .`, or any skip-hooks flag (`--no-verify`,
  `--no-gpg-sign`) without explicit user instruction. If a hook blocks
  a commit, diagnose and fix it, then create a **new** commit — never
  `--amend` past work.
- **Plan drift.** If the code has moved since the plan was written (a
  file is smaller than the plan claims, a symbol has been renamed, a
  fix the plan proposes has already partially landed), stop and ask the
  user whether to replan (run `deslopify` again) or proceed with an
  updated interpretation. Do not silently rewrite the plan in flight.
- **External-reality drift.** If the plan assumes a migration already
  happened outside the repo (GitHub topics, npm keywords, provider data,
  SDK private fields, container interface names, etc.), validate that
  assumption first. If you cannot validate it, treat the change as risky
  and ask before landing a breaking rename.
- **AD impact.** If a fix implicates an AD in `docs/decisions.md`,
  always stop for confirmation before committing the code change,
  not just before the doc change.
- **Unknown unknowns.** If during execution you find that the target
  owns state or behavior you didn't expect (e.g. "this component is
  actually the source of truth for three plugins"), stop and escalate.
  Fixing it blind risks cross-plugin regressions.

---

## Finishing up

When the batch is done, post a short summary of the form:

> Fix-slop complete for `src/components/layout/`.
> Landed: **N commits**, **M files touched**, **K LOC removed net**.
> Priorities cleared: **High ✓**, Medium (3/7), Low (deferred).
> Updated: `docs/deslop.md`, `docs/deslopify/src/components/layout/facts.md`,
> `docs/deslopify/src/components/layout/plan.md`,
> `docs/deslopify/index.md`.
> Typecheck: green. Not pushed.
> Follow-up: *(one sentence, e.g. "Next batch candidate: remaining
> Medium items under `apps/desktop/src/stores/`.")*

If the batch is incomplete (deferred items, stuck on a user decision,
stopped on an AD implication), say so plainly — a partial honest report
beats a misleading "done".
