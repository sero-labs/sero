# Plan: "Run in my workspace even with uncommitted changes" override

**Branch:** `feat/sero-orchestrator-2` (continue here; do **not** push/PR unless asked)
**Status:** Ready to implement in a fresh session.
**Derives from:** the dirty-preflight gap found while reviewing recurring workspace-root loops
(see [pr-awareness-and-tracking-plan.md](pr-awareness-and-tracking-plan.md) for the sibling effort).

---

## 1. The problem, and the fix we chose

A loop set to **run in the workspace root** (not a managed worktree) does a **dirty preflight**
before each background step: if the workspace has uncommitted changes it shows a 30s choice prompt
(stash / make a worktree / defer) and, on timeout, makes a worktree.

That check **can't tell the loop's own leftover changes from the user's unrelated work** — both look
like "uncommitted changes." So a recurring edit-in-place loop (e.g. *"every minute, +1 the counter in
counter.txt"*) works on run 1, then run 2 sees run 1's own change as "dirty," prompts, and on timeout
silently relocates to a worktree — and the real file stops advancing.

Two constraints the user set:
- **Do not rely on a loop step committing** (unless committing is the user's explicit intent).
- **"Only run in non-git folders"** is not an acceptable answer.

**Chosen fix (simple and predictable — no cleverness):** let the user explicitly say *"for this loop,
run in the workspace root even when it's dirty — don't pause."* It's **opt-in**, the safe default is
unchanged, and it's reachable two ways: a **loop setting** up front, and a **prompt path** mid-flight
("run here, and stop asking for this loop").

We deliberately rejected the "smarter" alternative (auto-ignore only the loop's *own* changes, still
warn about the user's): it's more complex, needs change-attribution, and still nags if the user has
any unrelated edit. The blunt, user-owned override is the more predictable primitive.

### One implementation reality that shapes the UI

The dirty prompt is rendered as a **single-select question** via the shared user-feedback bus
([request-choice.ts](../../../../apps/desktop/electron/platform/desktop/request-choice.ts)) — it has
**no checkbox primitive**. A literal "Don't ask again" checkbox would mean extending that shared
question UI (and its IPC) for every feature that uses it. The simple, predictable equivalent is an
extra **choice**: *"Run here, and don't ask again for this loop."* Same outcome, zero new UI
primitives. (A real checkbox can be added later if the exact UX is wanted — out of scope here.)

---

## 2. Hard constraints (do not violate)

- **Safe default unchanged.** The new flag defaults **off**. With it off, today's behavior (prompt,
  30s → worktree) is byte-for-byte the same.
- **No new heuristics.** This is a user setting, not an inferred decision. We do not compute "is this
  the loop's own change?" — the user owns the call.
- **No mandatory commit.** Nothing in this change makes a loop commit. Running in place leaves the
  working tree exactly as the steps left it.
- **Only relevant in workspace-root mode.** Managed-worktree loops never hit the dirty preflight, so
  the flag has no effect there and must not be surfaced as if it does.
- Conventional Commits. Top-level imports only. `pnpm typecheck` green + affected suites + a real run.
- 500 LOC max per touched file (none of these are near the limit).

---

## 3. Current state (verified, with refs)

**The setting lives on the loop's workspace config**
- `LoopWorkspaceSettings`
  ([shared/types.ts:84-89](../../../../plugins/sero-orchestrator-plugin/shared/types.ts#L84-L89)):
  `useManagedWorktree`, `reuseExistingWorktree`, `dirtyWorkspacePromptTimeoutMs`,
  `dirtyWorkspaceDefaultAction`.
- Defaults in `DEFAULT_WORKSPACE_SETTINGS`
  ([shared/defaults.ts](../../../../plugins/sero-orchestrator-plugin/shared/defaults.ts)).

**The dirty preflight**
- `resolve()` in
  [workspace.ts:90-108](../../../../plugins/sero-orchestrator-plugin/runtime/workspace.ts#L90-L108):
  in workspace-root mode it calls `host.getWorkspaceStatus()`; clean → `workspaceRootContext`; dirty →
  `resolveDirty()`.
- `resolveDirty()` + `DIRTY_CHOICES`
  ([workspace.ts:27-31, 110-141](../../../../plugins/sero-orchestrator-plugin/runtime/workspace.ts#L27-L31)):
  the three current choices and the timeout-to-worktree default.
- The returned `loop` is committed by the engine
  ([run-engine.ts:123-131](../../../../plugins/sero-orchestrator-plugin/runtime/run-engine.ts#L123-L131)),
  so a change made to `loop.workspace` inside `resolve()` **persists** — no separate `updateState`.

**How a workspace setting threads from the UI**
- Form switch → submit → dispatch:
  [CreateLoopForm.tsx:47-50](../../../../plugins/sero-orchestrator-plugin/ui/components/CreateLoopForm.tsx#L47-L50),
  [OrchestratorApp.tsx:81-88](../../../../plugins/sero-orchestrator-plugin/ui/OrchestratorApp.tsx#L81-L88).
- Flat params → `OrchestratorAction.options.workspace` in the extension tool:
  [extension/tools.ts:46, 93-96](../../../../plugins/sero-orchestrator-plugin/extension/tools.ts#L93-L96).
- Merged onto defaults at create time:
  [loop-factory.ts:31-33, 89](../../../../plugins/sero-orchestrator-plugin/runtime/loop-factory.ts#L31-L33).

**Dirty status source (unchanged)** — `git status --porcelain --untracked-files=all`, ignoring `.sero/`
([workspace-preflight.ts](../../../../apps/desktop/electron/features/vcs/worktree/workspace-preflight.ts)).

---

## 4. Design

One new boolean on the loop's workspace settings — **`allowDirtyWorkspaceRoot`** (default `false`).
Meaning: *"In workspace-root mode, run in the workspace root even when it has uncommitted changes;
don't run the dirty preflight."*

- **Up front:** a switch on the create form, shown **only when "Run in a managed worktree" is off**
  (it's meaningless otherwise). Label reads plainly, e.g. *"Run here even with uncommitted changes."*
- **Mid-flight:** two new prompt choices so the override is reachable when the prompt appears —
  *"Run here, keep my changes"* (this run only) and *"Run here, and don't ask again for this loop"*
  (persists the flag). The existing stash / worktree / defer choices stay.
- **Resolution:** when the flag is set, `resolve()` **skips `getWorkspaceStatus()` entirely** and runs
  in the workspace root as-is. (Skipping the git call is a small bonus.)
- **Default path untouched:** flag off + dirty → the same prompt and the same timeout-to-worktree.

The trade-off is explicit and the user's to own: with the flag on, the loop **won't warn even when the
dirty state is genuinely the user's unrelated work** — if a step touches those files it runs over them.
Isolation remains one toggle away (managed-worktree mode).

---

## 5. Workstreams

### WS-A — The setting (type + default + threading)
- **Type:** add `allowDirtyWorkspaceRoot: boolean` to `LoopWorkspaceSettings`
  ([shared/types.ts:84-89](../../../../plugins/sero-orchestrator-plugin/shared/types.ts#L84-L89)) with a
  one-line doc comment ("workspace-root mode only: run in place even when dirty; skips the dirty
  preflight").
- **Default:** `allowDirtyWorkspaceRoot: false` in `DEFAULT_WORKSPACE_SETTINGS`
  ([shared/defaults.ts](../../../../plugins/sero-orchestrator-plugin/shared/defaults.ts)). `mergeWorkspaceSettings`
  already spreads partials over the defaults, so create-time threading is automatic once the option is
  passed.
- **Extension tool:** add an optional `allowDirtyWorkspaceRoot` boolean to the action schema and fold
  it into `options.workspace` beside `useManagedWorktree`
  ([extension/tools.ts:46, 93-96](../../../../plugins/sero-orchestrator-plugin/extension/tools.ts#L93-L96)).

### WS-B — Resolution short-circuit
- In `resolve()`
  ([workspace.ts:90-108](../../../../plugins/sero-orchestrator-plugin/runtime/workspace.ts#L90-L108)),
  before the `getWorkspaceStatus()` call in the workspace-root branch:
  ```ts
  if (loop.workspace.allowDirtyWorkspaceRoot) {
    const resolved = workspaceRootContext(host, 'dirty-workspace-allowed');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }
  ```
- Add `'dirty-workspace-allowed'` to the `ResolvedWorkspaceContext['resolvedBy']` union
  ([shared/types.ts:174](../../../../plugins/sero-orchestrator-plugin/shared/types.ts#L174)) so the
  resolution reason is legible in state/debug logs.

### WS-C — Prompt paths (the "don't ask again" equivalent)
- Add two choices to `DIRTY_CHOICES`
  ([workspace.ts:27-31](../../../../plugins/sero-orchestrator-plugin/runtime/workspace.ts#L27-L31)):
  `run-in-workspace-root` ("Run here, keep my changes") and `run-in-workspace-root-always`
  ("Run here, and don't ask again for this loop").
- In `resolveDirty()`
  ([workspace.ts:110-141](../../../../plugins/sero-orchestrator-plugin/runtime/workspace.ts#L110-L141))
  handle both: resolve to `workspaceRootContext` **without stashing**. For `...-always`, also persist
  the flag by returning a loop with `workspace: { ...loop.workspace, allowDirtyWorkspaceRoot: true }`
  (the engine commits the returned loop, so it sticks for every later run).
- Extend the `DirtyWorkspaceDecision['action']` union with `'run-in-workspace-root'`
  ([shared/types.ts:204](../../../../plugins/sero-orchestrator-plugin/shared/types.ts#L204)) and record
  the decision like the existing branches.
- **Timeout behavior unchanged** — still `create-managed-worktree`. We only add explicit opt-in paths.

### WS-D — UI
- **Create form:** add a `Switch` under the existing "Run in a managed worktree" row, **rendered only
  when `useManagedWorktree` is false**, bound to a new `allowDirtyWorkspaceRoot` state; pass it through
  `onSubmit` → `OrchestratorApp.onCreate` dispatch → `options.workspace`
  ([CreateLoopForm.tsx:47-50](../../../../plugins/sero-orchestrator-plugin/ui/components/CreateLoopForm.tsx#L47-L50),
  [OrchestratorApp.tsx:81-88](../../../../plugins/sero-orchestrator-plugin/ui/OrchestratorApp.tsx#L81-L88)).
  Keep it self-explanatory (no sub-label clutter).
- **Loop detail (optional, light):** where `LoopDetail` shows the workspace mode
  ([LoopDetail.tsx:91-97](../../../../plugins/sero-orchestrator-plugin/ui/components/LoopDetail.tsx#L91-L97)),
  add a small "runs in place even when dirty" hint when the flag is on. Read-only; skip if it adds
  noise.

---

## 6. Tests & validation

**Add / update** (mirror the existing `workspace.test.ts` style)
- `resolve()` with `allowDirtyWorkspaceRoot: true` and a **dirty** `workspaceStatus`: returns a
  `workspace-root` context, `resolvedBy: 'dirty-workspace-allowed'`, and **never calls the dirty
  prompt** (assert `host.choiceRequests` is empty).
- `resolve()` with the flag **off** and dirty: unchanged — still prompts (existing tests must stay
  green).
- `resolveDirty()` choice `run-in-workspace-root-always`: resolves to workspace-root **and** the
  returned loop has `workspace.allowDirtyWorkspaceRoot === true` (persisted).
- `resolveDirty()` choice `run-in-workspace-root`: resolves to workspace-root and does **not** stash
  (assert `host.stashes` is empty) and does **not** persist the flag.
- Extension-tool mapping test: `allowDirtyWorkspaceRoot` flows into `options.workspace`.

**Run before commit**
- `pnpm typecheck` from repo root — must stay green.
- Orchestrator suite (`sero-orchestrator-plugin`).
- **Real run** — the counter case end to end on a **git** workspace:
  1. Create *"every minute, +1 the counter in counter.txt"*, **workspace-root mode**, override **on**.
  2. Confirm via `state.json` / debug logs that runs 2, 3, … resolve `workspace-root`
     (`resolvedBy: 'dirty-workspace-allowed'`), no choice prompt fires, and `counter.txt` advances
     `1 → 2 → 3` in the real workspace.
  3. With the override **off**, confirm the prompt still appears on run 2 (default unchanged), and that
     picking "Run here, and don't ask again" flips the loop so run 3 stops prompting.

---

## 7. Out of scope (deferred)

- **A real checkbox on the prompt.** We model "don't ask again" as a choice to avoid extending the
  shared user-feedback question UI. Revisit only if the exact checkbox UX is specifically wanted.
- **"Smart" own-change detection** (warn only about the user's unrelated changes). Explicitly rejected
  here as cleverness; the predictable user-owned override is the chosen primitive.
- **A global/default preference** ("always allow dirty workspace-root for every loop"). This plan is
  per-loop only; a global default can layer on later if asked.
- **Auto-committing iterations.** Not part of this change (and the user wants commits only when that's
  their explicit intent).

---

## 8. Doc updates (do as part of the change)
- `specs/01-data-model.md` — add `allowDirtyWorkspaceRoot` to `LoopWorkspaceSettings`.
- `specs/02-integration-seams.md` — note the new resolution short-circuit and the two prompt choices in
  the Dirty Workspace Preflight section.

---

## 9. Suggested commit sequence
1. `feat(orchestrator): add allowDirtyWorkspaceRoot loop setting` (WS-A)
2. `feat(orchestrator): run in workspace root as-is when the override is set` (WS-B + WS-C)
3. `feat(orchestrator): surface the dirty-workspace override in the UI` (WS-D)
4. `docs(orchestrator): record the dirty-workspace override` (§8)

Each commit: `pnpm typecheck` green + relevant suite green before moving on.
