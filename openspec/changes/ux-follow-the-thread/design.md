## Context

See proposal.md for motivation. The facts that shape the approach, as the code
stands:

**How an app open becomes history.** `setActiveApp`
(`apps/desktop/src/stores/app/state.ts:208`) pushes an entry carrying the view the
app last showed in that workspace, read from `appViewIds`. The app then mounts and
publishes its own location through `host.navigate`, which reaches
`setAppView`/`publishView` (`apps/desktop/src/stores/navigation.ts:59`). Because
the pushed entry already has a `viewId`, `publishView` appends a second entry
instead of replacing the first. When the app has no saved view, the entry's
`viewId` is `undefined` and `publishView` already replaces — which is why the
defect only shows after the Orchestrator has shown a view in that workspace.

**The sibling app already does the right thing.** `useArchitectView`
(`plugins/sero-architect-plugin/ui/lib/navigation.ts`) calls
`host.navigate(viewId, { replace: true })` for a mount-time launch and for the
first mount that has no host location. `useOrchestratorNavigation`
(`plugins/sero-orchestrator-plugin/ui/lib/orchestrator-navigation.ts`) makes the
same calls without the option: the mount-launch effect, the first-mount effect,
and the plugin-state restore.

**The workspace listener.** `listenForAppNavigationWorkspace`
(`apps/desktop/src/stores/app/listeners.ts:29`) subscribes to
`activeWorkspaceId` and calls `replaceCurrent`. The same mutation happens on a
history restore (`apps/desktop/src/lib/open-app.ts`), on `appControl.open`, and in
four compound host actions. `open-app.ts` compensates for the listener by calling
`replaceCurrent(target.entry)` after `setActiveWorkspace`.

**The project id is already on the record.** `Loop.project`
(`plugins/sero-orchestrator-plugin/shared/types.ts`) and
`RoomDefinition.projectContext`
(`plugins/sero-orchestrator-plugin/shared/room-types.ts:314`) carry
`{projectId, runId, configRevision?, modelSnapshot?}`. `resolveProjectContext`
(`plugins/sero-architect-plugin/runtime/model-resolution.ts:192`) is the only
production constructor; `dispatch-link` spreads it, and `services.dispatch`
forwards it into `createOptions.project` and `roomRequest.project`. Nothing
carries the project's name.

**The label has no workspace.** `NavButtons.labelFor`
(`apps/desktop/src/components/layout/titlebar/NavButtons.tsx`) resolves only the
app label, though `useWorkspaceStore` is already imported there and each entry
carries a `workspaceId`.

## Goals / Non-Goals

**Goals:**

- One Back returns to where the user came from, for a launched Workflow or Room,
  for a workspace switch, and for Back/Forward that cross a workspace.
- A Workflow and a Room name the Architect project that created them and open it.
- The Workflow settings row keeps every value it shows today.

**Non-Goals:**

- Porting the audit capture rig onto `main` (see Decisions).
- Refreshing the displayed project name after a rename.
- Agent Board's own Back to the Room, which is unchanged.
- Any IPC, preload or main-process surface.

## Decisions

### 1. The app replaces its launch entry, not the shell

Mirror Architect: pass `{ replace: true }` on the Orchestrator's mount-time launch
and its first-mount location. **Alternative considered:** change `setActiveApp` to
push `viewId: undefined` and let the shell's existing `publishView` replace rule
do the work for every app. Rejected: the shell deliberately records the view the
app last showed, and other navigation code reads `entries[index].viewId`.
Changing the entry's shape affects every app, while the drawing states the fix
app-side ("The Orchestrator replaces the page it opened on") and Architect
already sets the precedent.

### 2. Record the workspace switch where the user acts

Delete `listenForAppNavigationWorkspace`. Add two helpers beside `navigateBack`
in `apps/desktop/src/lib/open-app.ts`:

- `switchWorkspace(id)` pushes the active app's location in the new workspace and
then calls `setActiveWorkspace`. Use it where the workspace moves and no app open
follows, or where the same app is about to open.
- `selectWorkspaceForApp(appId, id)` calls `switchWorkspace` when `appId` is
already the active app, and otherwise only sets the workspace, because the app
open that follows records the move.

Use them at every site that changes workspace while an app is open:

```text
components/layout/workspace/workspace-tree/WorkspaceNode.tsx  handleHeaderClick
components/layout/workspace/workspace-tree/WorkspaceNode.tsx  handleNewSession
stores/sessions.ts                                             setActiveSession
stores/workspace.ts                                            createWorkspace/cloneWorkspace/addFolder
lib/app-control-bridge.ts                                      openApp
stores/editor-bridge.ts                                        focusEditor
components/layout/DevServerPanel.tsx                          the open action
components/layout/PendingQuestionCard.tsx                      handleOpen
components/apps/board/BoardCard.tsx                            openCard/openInBrowser
```

`setActiveApp` records a new app and workspace, but it returns early when the app
is already active. A caller that sets the workspace and then opens the same app
records nothing, so it must record the step itself. Every other
`setActiveWorkspace` caller is a history restore and must not push:

```text
lib/open-app.ts  navigate
```

**Alternative considered:** keep the listener and change `replaceCurrent` to
`push`, with `open-app.navigate` restoring `{entries, index}` after the workspace
change. Rejected: the listener cannot tell a user switch from a history restore,
and on a cross-workspace app open it records the app being left in the new
workspace — a place the user never chose — so Back stops returning to where they
came from.

This also removes the `replaceCurrent(target.entry)` compensation in
`open-app.navigate`, because nothing rewrites the entry any more.

### 3. Snapshot the project's display name at dispatch

Add an optional display name to `OrchestratorProjectContext` and fill it in
`resolveProjectContext` from `record.name`. Both surfaces read it from the record
they already load. **Alternative considered:** resolve the name live from the
Architect's global index, as the host's Agent Board store does. Rejected: it adds
a second watcher, a `globalStatePath` lookup inside a plugin, and a dependency on
another app's state shape, to render a label whose link already works from the
id. The cost is that a rename leaves the displayed name stale; the link uses
`projectId` and still reaches the project.

The field is display-only: `sameOrchestratorProjectAttribution`,
`checkOrchestratorProjectContext` and `override-actions` compare `projectId` and
`runId` only.

### 4. Keep the settings row's Context value

The drawing's frame 1 drops `CONTEXT` and adds `FROM`, but its own parity list
says "all kept · 1 added", and #538 already recorded the same line as a carried
departure. The row gains `FROM` and keeps `CONTEXT`, so it shows one more value
than the drawing. Recorded in `comparison.md`.

### 5. The Back and Forward labels always name the landing workspace

The suffix is the workspace of the place being reached, or the active workspace
when that place has none (a global app). This reproduces all three frames exactly.
The issue's wording ("names the workspace when it differs") cannot be reconciled
with frames 1 and 2, where the target is the global Architect app: under "when it
differs" those frames would carry no suffix. The consequence — an ordinary
in-workspace Back also gains a suffix the drawing never shows — is recorded as a
departure.

### 6. Assemble the workspace-name label at the control

`NavButtons` resolves a target entry's workspace name from `useWorkspaceStore`,
falling back to the active workspace's name when the entry has none. The label
stays a tooltip and an `aria-label`; the visible control is the chevron.

### 7. Evidence is a focused navigation spec

Add `apps/desktop/e2e/navigation.workflow.spec.ts`, asserting the four moves in
the issue's "Done when". **Alternative considered:** port
`apps/desktop/e2e/ux-audit/navigation.ts` and its helper layer (~1.9k lines) from
the unmerged `feat/audit-architect-ux` branch. Rejected as beyond the change: that
is a capture rig for an audit, and this change needs four assertions. The audit's
records remain the manual capture profile for `comparison.md`.

## Risks / Trade-offs

- **A renamed project leaves a stale name on existing work** → the link uses the
  project id, so it still reaches the project; the staleness is recorded in
  `comparison.md` and the spec says the name is the name at creation.
- **A future workspace switch might miss the recording helper** → the rule is
  stated in `app-navigation-history`; the helper sits beside the other navigation
  entry points so the obvious call is the recording one.
- **Compound workspace switches no longer rewrite the current entry** → this is
  the intended fix. The current entry becomes stale until the next navigation,
  exactly as it is today after a `replaceCurrent`; Back now reaches the page the
  user left rather than the one the write erased.
- **The Back label can name a workspace the user is about to leave** when the
  target is a global app → matches all three drawn frames; recorded as a
  departure from the issue's "when it differs" wording.

## Migration Plan

None. The new context field is optional, so records written before this change
load unchanged and simply show no project name or `FROM` value.

## Open Questions

None.
