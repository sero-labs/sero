## Context

See proposal.md — Why. The facts that shape the approach, as the code stands:

**The intake call chain.** `IntakeDialog` (`ui/components/IntakeDialog.tsx`) collects
an idea, a name and a location, and calls `onCreate(idea, folder, executionMode,
models)`. `ArchitectApp.useCreateProject` forwards that to
`useArchitectActions.create` (`ui/lib/actions.ts`), which runs the
`architect_projects` tool. `executeProjectsTool` (`extension/projects-tool.ts`)
calls `ProjectsActions.create` (`runtime/projects-actions.ts:199`), which writes a
record and calls `advanceIntake`.

**Creation always makes a workspace.** `advanceIntake` calls
`host.createWorkspace(record.name, path.dirname(record.folder))`
(`projects-actions.ts:114`) only when `record.workspaceId` is null, and the adapter
maps it to `host.workspace.create(name, parentPath, { requireEmpty: false })`
(`runtime/host.ts:101`). With `requireEmpty: false`, an existing destination
directory is reused and its `.sero-workspace.json` is rewritten, and a destination
whose id is already registered is bumped to a `name-2` sibling. `advanceIntake` is
re-entrant by design: a resume after a partial failure takes the same path without
creating a second workspace.

**The record already holds the link.** `ProjectRecord.workspaceId` exists and
`createProjectRecord` (`shared/record.ts:407`) writes it as `null`. The watched
index carries `ArchitectIndexEntry.workspaceId` (`shared/types.ts`), so the UI can
already tell which workspaces hold a project.

**Discovery needs no change.** The discovery instruction already reads "Start from
the user idea and the workspace" (`shared/owner-contract.ts:143`), and
`advancePhase` only requires a non-null `workspaceId`.

**The dialog already uses the host bridge.** `IntakeDialog` reads
`window.sero.workspace.pickFolder()` and the model catalogue through
`window.sero`. `SeroWorkspaceBridge.list()` returns `WorkspaceInfoIPC[]`
(`packages/common/src/admin-bridge.ts:345`), which carries `id`, `name` and `path`.

## Goals / Non-Goals

**Goals:**

- New project can start on an existing workspace without creating or changing one.
- New folder never takes over an existing folder and never makes a sibling.
- The picker shows what the drawing shows: free workspaces first, taken ones
  labelled and disabled, Global absent.
- One create path for both choices, so the tool, the UI and the record stay one
  contract.

**Non-Goals:**

- The take-over in the desktop Add Workspace menu, which is a separate path.
- Detecting a workspace whose path is currently unavailable; creation fails into
  the existing blocked state as it does today.
- Any host, IPC or preload change.

## Decisions

### 1. One create input, not a second tool action

`ProjectsActions.create` takes a discriminated input:

```ts
interface CreateProjectInput {
  idea: string;
  executionMode?: ExecutionMode;
  models?: ModelDefaultInput[];
  folder?: string;       // New folder
  workspaceId?: string;  // Existing workspace
}
```

Exactly one of `folder` and `workspaceId` is required. The tool gains an optional
`workspaceId` parameter, and `ArchitectActions.create` and
`IntakeDialog.onCreate` take the same object. **Alternative considered:** keep the
positional `create(idea, folder, executionMode, models)` and add a fifth
parameter. Rejected: two mutually exclusive fields read better than a positional
pair a caller can set together, and the object makes the tool, the actions and the
dialog one shape.

### 2. The picker reads the same host bridge the dialog already uses

`IntakeDialog` loads workspaces with `window.sero.workspace.list?.()` when it
opens, drops the Global workspace by id, and marks the rest against the project
links its caller passes. `ArchitectApp` derives those links from the watched index
it already holds and passes them as a prop.

**Alternative considered:** add a `workspaces` read action to `architect_projects`.
Rejected: it adds a second read path for data the UI already has (the index) or can
already reach (the bridge), and the preview harness already stands up
`window.sero`.

### 3. The runtime is the authority, and re-checks everything

The dialog's list can be stale, so `create` re-validates on submit:

- `workspaceId`: the workspace must be registered in the profile, must not be
  `global`, and must not already hold a project. On success the record takes the
  workspace's `id`, `path` and `name`, and `advanceIntake` skips workspace creation
  because `workspaceId` is set.
- `folder`: the destination the host would create must be free. Intake resolves
  the exact destination the host would pick — `path.dirname(folder)` joined with
  `ensureUniqueId(workspaceSlug(basename(folder)), registeredIds)`, both shared
  from `@sero-ai/common` — and refuses when either the folder the user named or
  that destination exists. It records the destination as the project's folder, so
  the record and the created workspace agree from the first write.
  `host.pathExists` uses `fs.stat`, so an existing directory counts; `fileInfo`
  cannot answer this, because it reads the first bytes and returns `null` when
  that read fails on a directory. Intake resolution lives in
  `runtime/intake-placement.ts`, so `create` stays a short caller.

A workspace already holding a project is refused even if the UI offered it,
because one Architect project per workspace is a runtime rule.

### 4. The existence check lives before the record, not in `advanceIntake`

Intake placement resolves once, before `create` writes a record, so a refusal
leaves no project behind. `advanceIntake` stays re-entrant differently: because
the record already holds the resolved destination, a retry finds a workspace the
failed attempt created by that exact path and adopts it, instead of making a
suffixed sibling. It adopts only a workspace no other project already owns, and
the whole step — read ownership, find or create, save the id — runs on one
promise queue per runtime (`runtime/workspace-claim.ts`, the `RecordStore`
write-queue precedent). Two intakes that both passed the check therefore cannot
adopt the same workspace; the second waits, then makes its own. The refusal does
not move into the host adapter.

### 5. `requireEmpty` stays `false`, and the host adapter is untouched

The host's `ensureUniqueId` bumps a destination when the base id is already
registered, so intake predicts the bumped path itself rather than asking the host
to change. The host keeps the reuse behavior its other callers rely on, and the
plugin owns the one rule that must be exact: what the destination will be.

### 6. The drawing governs the dialog's appearance

The choice is a two-part segmented control and the picker is the shared
`@sero-ai/ui` Select, because plugin work must not use a native select. Free
workspaces come first, each row shows the name on the left and the path on the
right, and a taken row shows "Architect project" on the right. Styles go in
`ui/styles.css` under the plugin scope and use host tokens (`--bg-surface`,
`--border-subtle`, `--text-muted`) rather than Tailwind-only colour names. New
folder stays the default choice, and Use worktree stays off by default. The
drawing's two frames, its Decisions and its "Controls on this screen today" lists
are binding; `comparison.md` records the captures and any departure.

## Risks / Trade-offs

- **The shared id rule is the host's rule.** Intake predicts a workspace's
  destination with `workspaceSlug` and `ensureUniqueId` from `@sero-ai/common`,
  which the desktop workspace manager also uses. One spelling of the rule, so the
  two cannot drift apart silently.
- **`packages/common` changed.** The new `workspace-id` module may need the
  package republished before a release that consumes it.
- **The picker list can change between open and submit.** Mitigated by decision 3:
  the runtime re-validates and refuses.
- **`window.sero.workspace.list` is optional.** When it is absent the picker shows
  no workspaces and Existing workspace cannot be chosen; the dialog still works for
  New folder. The preview harness and the tests supply it.
- **A workspace with an unavailable path is offered.** Mitigated by the existing
  blocked state: `git init` fails and the project stays in `intake` with the
  failure reason, which the page already shows.

## Open Questions

None.
