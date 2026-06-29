# 08 — Loop Library

A **Loop Library** is a profile-global, versioned store of loop *definitions*.
Orchestrator owns it. The user **Saves** a loop they have built into the library
and **Loads** a library loop into any workspace. A loaded loop stays linked to
the version it came from, so it can **Update** to a newer version or
**Downgrade** to an older one later.

This is a save/load library, not a peer-to-peer sharing mechanism: there is one
canonical store per profile, and every workspace in that profile saves into and
loads from the same place.

```text
workspace A loop ──Save──▶ library entry [v1 v2 v3]
                                  │
workspace B  ◀──Load (v3)─────────┤   workspace C ◀──Load (v1)──┐
   linked @ v3                     │      linked @ v1            │
   "v3 is latest"                  └────── new version v4 ───────┘
                                          B & C see "v4 available"
```

## Why a profile-global store

A loop today is **workspace-scoped** — it lives inside its workspace at
`<workspace>/.sero/apps/orchestrator/state.json` (see
[02 Plugin Shell](02-integration-seams.md#plugin-shell)). A library must outlive
any single workspace and be reachable from all of them, so it is **profile-global**.

It reuses the established global-app-state location. A `scope: "global"` app
resolves its state to `path.join(SERO_HOME, "apps", <id>, "state.json")`
(`features/apps/discovery/index.ts`), instantiated once under the synthetic
`global` workspace. The library follows that convention:

```text
$SERO_HOME/apps/orchestrator-library/
  index.json                       # watched — drives the browser list + "update available"
  entries/<entryId>/
    entry.json                     # { id, name, summary, latestVersion, createdAt, updatedAt }
    versions/1.json                # immutable LibraryVersion
    versions/2.json                # …
```

The library is a **data store Orchestrator owns**, not a second app runtime: the
browser UI stays in the existing per-workspace Orchestrator panel. The only
things borrowed from the `scope: "global"` machinery are the path convention and
the file watch. The plugin never imports `SERO_HOME`; the desktop side resolves
the absolute root and injects it through a host seam (below).

The profile boundary is the identity boundary — a different Sero profile is a
different library. This is consistent with the state-scope decision in
[00 D-07](00-architecture.md#d-07--state-scope).

## What a saved definition contains

A library version stores the loop's **definition** — everything that describes
*what the loop does* — and nothing that is specific to one running instance.

| Saved (definition) | Never saved (instance / runtime) |
| --- | --- |
| `prompt`, `title`, `summary` | `id`, `workspaceId`, `status` |
| `plan` (objective, steps, instructions, deps, guards) | `runtime` (variables, step states, workspace, PRs) |
| `triggers` — type/schedule/event config only | trigger `id`, `fireCount`, `lastFireAt`, `nextFireAt` |
| `limits`, `logPolicy` | `runs`, run digests, `revisions` |
| `contextOverrides` | `warnings`, `insights`, `suggestions`, `answeredInputs` |
|  | `createdAt` / `updatedAt`, `libraryLink`, `stepOverrides` |

A step's per-step model/tool picks live **inside** the plan
(`execution.model` / `execution.tools`), so the saved plan already embeds the
loop's current picks as that version's baseline — which is exactly what a
consumer should get on Load.

## Data model

New types live in `shared/library-types.ts`, re-exported from `shared/types.ts`.

```ts
/** A trigger's portable config — no ids, no fire counters, no loop/workspace binding. */
interface SharedTriggerConfig {
  type: "manual" | "cron" | "event" | "hybrid";
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  debounceMs?: number;
  maxFires?: number;
}

/** The shareable payload: the loop minus all instance/runtime state. */
interface SharedLoopDefinition {
  schemaVersion: 1;
  prompt: string;
  title: string;
  summary: string;
  plan: LoopPlan;
  triggers: SharedTriggerConfig[];
  limits: LoopLimits;
  logPolicy: LogPolicy;
  contextOverrides?: ContextOverrides;
}

/** One immutable, monotonically numbered version of an entry. */
interface LibraryVersion {
  version: number;                 // 1, 2, 3 … never reused
  definition: SharedLoopDefinition;
  note?: string;                   // optional "what changed"
  savedFromWorkspaceId?: string;   // provenance only
  createdAt: string;
}

interface LibraryEntry {
  id: string;
  name: string;                    // editable label (defaults to the loop title)
  summary: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** One row in the watched index.json. */
interface LibraryEntrySummary {
  id: string;
  name: string;
  summary: string;
  latestVersion: number;
  versionCount: number;
  updatedAt: string;
}

interface LibraryIndex {
  version: 1;
  entries: LibraryEntrySummary[];
}
```

### Additions to the loop instance

Two fields are added to `Loop` (see [01-data-model.md](01-data-model.md)):

```ts
interface LoopLibraryLink {
  entryId: string;
  version: number;     // the version this loop is currently on
  syncedAt: string;
}

interface StepOverride { model?: string; thinking?: string; tools?: string[]; }

interface Loop {
  // …existing fields…
  /** Set when the loop was loaded from / saved to the library. Absent ⇒ standalone. */
  libraryLink?: LoopLibraryLink;
  /** Local per-step overrides, replayed after a version switch so they survive. */
  stepOverrides?: Record<string /* stepId */, StepOverride>;
}
```

`stepOverrides` is **instance-local** and is **not** part of `SharedLoopDefinition`
(the published plan already embeds the picks). Its only job is to protect
*unsaved* local picks from being wiped when the plan is replaced on a version
switch.

## Transforms (pure, testable)

- `toSharedDefinition(loop): SharedLoopDefinition` — drops every "never saved"
  field above and reduces each `LoopTrigger` to a `SharedTriggerConfig`.
- `instantiate(def, ctx): Loop` — builds a fresh loop: new `id`, the current
  `workspaceId`, `status: "draft"`, a new synthetic `parentSessionId`, empty
  `runtime`/`runs`/`revisions`/history, triggers materialized with new ids and
  zeroed counters, `plan`/`limits`/`logPolicy`/`contextOverrides` copied from the
  definition, and `libraryLink` set.

## Versioning rule

Versions are **immutable** and **monotonic**. Saving a new version appends
`versions/{latest+1}.json` and bumps `entry.latestVersion`; existing version
files are never rewritten. All versions are retained, so Downgrade can target any
prior version. (Version pruning is out of scope for v1.)

## Local edits vs library updates (library-managed plan)

The plan of a linked loop is **library-managed**: there is no manual, in-place
plan editor for it. A user changes the plan by editing a working loop and
**Saving a new version**, then other instances pull it.

Two things still legitimately change a *linked* loop locally, and each is handled
without breaking the link:

1. **Per-step picks** (`set_step_model`, `set_step_tools`). These apply to the
   live plan as today **and** are recorded into `stepOverrides`. On a version
   switch they are replayed onto matching step ids in the new plan; picks for
   steps that no longer exist are dropped (recorded as a one-line warning). They
   do **not** count as divergence.

2. **Autonomous recovery / reflection** may revise a running loop's plan
   (`revise-step`, `revise-plan`) — the loop must be able to recover. This is
   allowed. It makes the loop **structurally diverged** from its linked version.

**Divergence is derived, not stored.** It is computed by comparing the loop's
current plan against the linked version's plan with the overlay fields
(`execution.model`/`thinking`/`tools`) ignored, so a model tweak never reads as a
structural change. A diverged loop shows "modified locally" with two ways out:
**Save** it as a new version, or **re-sync** to the linked version (which
discards the local plan changes — confirmed first).

## Actions

Added to `OrchestratorAction` (see [01 Coordinator Actions](01-data-model.md#coordinator-actions)):

```ts
| { kind: "library_save"; loopId: string; mode: "new-version" | "new-entry"; name?: string; note?: string }
| { kind: "library_load"; entryId: string; version?: number }   // v1: loads a draft; activation is the existing `activate` action
| { kind: "library_set_version"; loopId: string; version: number }   // update OR downgrade
| { kind: "library_unlink"; loopId: string }
| { kind: "library_delete"; entryId: string }
```

The browser list is a **watched read** (the renderer subscribes to the library
index), not an action — mirroring how the loop list is fed by the watched
`index.json`.

Validation:

- `library_save` `new-version` requires an existing link; `new-entry` always
  allowed (and creates+links a fresh entry, or just an entry if invoked from a
  standalone "Save as").
- `library_load` rejects an unknown entry/version with a clear error.
- `library_set_version` rejects an unknown version, and rejects while the loop is
  mid-run (see flow).
- `library_delete` never cascades to loaded loops.

## Flows

**Save.** `toSharedDefinition(loop)` builds the payload.
- No link, or `mode: "new-entry"` → create an entry (name defaults to the loop
  title) at `v1`, set/replace `loop.libraryLink`.
- Linked, `mode: "new-version"` → append `versions/{latest+1}.json`, bump the
  entry, set `loop.libraryLink.version` to the new version. Divergence (if any)
  clears because the plan now matches the version just written.

**Load.** The browser lists entries; the user picks one (latest version by
default) → `instantiate(host, def, link)` creates a fresh draft loop in the
current workspace, then the **normal create validate path** runs (unique step
ids, acyclic deps, supported targets, one final step). An invalid saved plan
blocks as a draft with the errors, exactly like create. In v1 a load always
produces a **draft** — activation is the existing `activate` action (the browser
can chain it for "activate after load"), so the runtime stays out of the engine.

**Update / Downgrade.** Same machinery, target = any version. Load the target
`definition.plan`, swap it onto the loop through the existing **revise-plan**
validate + step-state reconcile path, replay `stepOverrides`, set
`libraryLink.version`. Local triggers/limits/log policy/context overrides are
untouched. Applied **only when the loop is idle** (no active run); mid-run it is
rejected with "finish or stop the current run first". If the loop is structurally
diverged, the switch is confirmed first (it discards local plan changes).

**"Update available" — push, not polling.** Each workspace watches the global
`index.json` via `host.appState.watch` (the same mechanism that drives the loop
index). When any workspace Saves a new version, the index changes → linked loops
whose `entry.latestVersion > libraryLink.version` surface an update. No timers,
no polling (consistent with the no-polling rule).

**Fail-soft cases.**
- A saved plan referencing a model/tool absent in the loading workspace uses the
  existing model-unavailable MED fallback and tolerant tool allowlist — a warning
  on the loop, never a hard failure.
- Deleting an entry/version a loaded loop links to leaves the loop fully working
  (it owns its plan copy); the link just reports the source is gone.

## Host seam

A new `library` capability on `OrchestratorHost`, backed on the desktop side by
the app-state read/update/watch primitives pointed at the resolved global root
(`path.join(SERO_HOME, "apps", "orchestrator-library")`), injected into the
adapter — the plugin never hardcodes `SERO_HOME`.

```ts
interface LibraryStore {
  readIndex(): Promise<LibraryIndex>;
  readEntry(entryId: string): Promise<LibraryEntry | null>;
  readVersion(entryId: string, version: number): Promise<LibraryVersion | null>;
  /** Appends a version and updates entry.json + index.json as one serialized write. */
  putVersion(entry: LibraryEntry, version: LibraryVersion): Promise<void>;
  deleteEntry(entryId: string): Promise<void>;
  watchIndex(): void;
  unwatchIndex(): void;
}

interface OrchestratorHost {
  // …existing…
  library: LibraryStore;
}
```

All workspaces run in one Electron main process per profile, so library writes
serialize through `host.appState.update`'s per-file ordering plus an in-process
queue — the same single-writer discipline the loop store uses. Cross-process
writers are not a concern within one profile.

## UI

- **Library browser** — opened from the Orchestrator panel; a flat, searchable
  list of entries (name, summary, latest version, version count). Selecting an
  entry shows its versions; **Load** (latest by default, or a chosen version)
  creates the loop in the current workspace.
- **Save** — a "Save to Library" action on a loop. Default **New version** when
  the loop is linked; **Save as new entry** is the secondary choice; an optional
  one-line change note.
- **Loop detail (linked loop)** — shows the linked entry + current version, an
  **"vN available"** badge when newer, a version picker for Update/Downgrade, a
  "modified locally" notice with Save / Re-sync when diverged, and **Unlink**.
- **Loop list** — a small badge counts loops with an available update.
- **Slash commands** —
  `/orchestrator library_save <loopId> [--as-new] [note]`,
  `/orchestrator library_load <entryId> [version]`,
  `/orchestrator library_list`,
  `/orchestrator library_update <loopId> <version>`.

## Functional requirements

- **FR-L1** Save publishes the loop's definition (full, minus instance/runtime
  state) as a new immutable version of its linked entry; an unlinked loop's first
  Save creates a new entry at `v1` and links it. "Save as new entry" always
  creates an independent entry.
- **FR-L2** Load instantiates a fresh loop in the current workspace from a chosen
  entry version (latest by default): new ids, fresh runtime, empty history, link
  set; then the normal validate (and optional activate) path runs.
- **FR-L3** A loaded loop is linked to `(entryId, version)`. Update switches to a
  newer version and Downgrade to an older one; all versions are retained, so any
  prior version is selectable.
- **FR-L4** Switching versions replaces the loop's plan with the target version's
  plan and replays the local step-override overlay onto matching steps; local
  triggers, limits, log policy, and context overrides are untouched. Overrides for
  steps absent in the new plan are dropped with a warning.
- **FR-L5** Version availability is push-based: the watched library index surfaces
  "update available" on a linked loop when a newer version exists. No polling.
- **FR-L6** The plan is library-managed: no manual in-place plan editor on a
  linked loop; plan changes are made by Saving a new version. Autonomous
  recovery/reflection may still revise a running loop's plan; the resulting
  structural divergence is derived and surfaced, and an explicit version switch
  overwrites it after confirmation.
- **FR-L7** A version switch is applied only when the loop is idle; mid-run it is
  rejected with a clear message. The plan is re-validated on Load and on switch;
  an invalid plan blocks with the validation errors, exactly like create.
- **FR-L8** The library is profile-global at `$SERO_HOME/apps/orchestrator-library/`,
  shared across all the profile's workspaces, and survives restarts. Deleting an
  entry or version never breaks loaded loops; the link reports the source is gone.
- **FR-L9** Unlink detaches a loaded loop into a standalone loop (no version
  tracking), keeping its current plan and settings.

## Out of scope (v1) — later layers

- **Cross-machine / team sharing** — export-to-file and remote registries. v1 is
  one profile, one machine. The `SharedLoopDefinition` is deliberately a clean,
  portable payload so a file export can be added later without a model change.
- **Overlay / re-base divergence** — keeping structural local plan edits as a diff
  that re-bases onto new versions. v1 is library-managed (switch overwrites).
- **Auto-update** — subscribed loops always tracking latest. v1 is manual, by
  design (nothing changes on its own).
- **Version pruning / retention UI** — all versions are kept.
- **Entry organisation** — folders, tags, ownership. v1 is a flat searchable list.
- **Derived divergence indicator** (FR-L6, partial) — a linked loop whose plan
  was changed by autonomous recovery/reflection is not yet flagged "modified
  locally". The library-managed model still holds (no in-place plan editor; a
  version switch replaces the plan and replays the overlay); surfacing structural
  drift + a Save/Re-sync affordance is a follow-up.
- **Loop-list update badge** — "update available" is surfaced on the linked
  loop's detail; a count badge on the loop *list* needs `LoopSummary` to carry
  link/update info and is deferred.
