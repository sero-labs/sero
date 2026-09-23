## Why

One Back does not return the user to where they came from. Opening a Workflow or a
Room that Architect sent pushes a second history entry, so Back lands on
"Select a Workflow from the list." or the Rooms list. Switching workspace
overwrites the current entry, so Back skips the page the user left. Neither
surface names the Architect project that sent the work, although the Workflow
record already saves its id.

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/6-follow-the-thread.html`.
Its three frames, its Decisions and its "Controls on this screen today" lists are
binding.

## What Changes

- **A launch records where it landed.** An app that opens on launch parameters
  replaces the entry the shell pushed for it, so one Back returns to the app the
  user came from. The page the app last showed in that workspace is not left
  behind as a step.
- **Switching workspace records a step.** Choosing another workspace while the
  same app stays open adds a place in history, so one Back returns to the exact
  page the user left in the old workspace.
- **The Back label names the workspace it lands in**, for example
  `Back to Sero Orchestrator · FroggerNeon`.
- **A Workflow's settings line names the Architect project it came from** and
  links to that project. The line gains `FROM`; every setting it shows today is
  kept, so the line carries one more value than the drawing's frame 1.
- **A Room's header names the project that opened it**, beside its state, and
  links to that project.
- **Creation retains the project's display name.** The stored project context
  gains the name the project had when the work was dispatched, so both surfaces
  can name it without reading another app's state. The name is a snapshot; the
  link uses the id and stays correct if the project is renamed.

Non-goals: the "What starts a Workflow" detail dialog, the Workflow result and
objective, the Room's brief, team, activity and side panels, and the Agent
Board's own Back behaviour, which already returns to the Room and does not
change.

## Capabilities

### New Capabilities

- `app-navigation-history`: the shell's back/forward history across apps and
  workspaces — what becomes a step, and what the Back control promises.

### Modified Capabilities

- `orchestrator-ui`: a Workflow's settings line names the Architect project it
  came from; a Room's header names the project that opened it.
- `orchestrator-dispatch-handle`: the project context retained at creation also
  carries the project's display name.

## Impact

- Host: `apps/desktop/src/stores/app/listeners.ts` (the workspace listener is
  removed), `apps/desktop/src/App.tsx`, `apps/desktop/src/lib/open-app.ts`,
  `apps/desktop/src/stores/sessions.ts`,
  `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`,
  `apps/desktop/src/components/layout/titlebar/NavButtons.tsx`, and
  `apps/desktop/src/lib/open-app.test.ts`.
- Shared: `packages/common/src/orchestrator-project-context.ts` gains an
  optional display name.
- Architect: `plugins/sero-architect-plugin/runtime/model-resolution.ts` fills
  it. The authority checks compare only `projectId` and `runId` and are
  unaffected.
- Orchestrator plugin:
  `ui/lib/orchestrator-navigation.ts` (launch replaces its entry),
  `ui/lib/loop-settings.ts` and `ui/components/LoopSettingsLine.tsx` (`FROM`),
  `ui/components/RoomTopBar.tsx` (the project link), and new preview fixtures
  for the two captured surfaces.
- Evidence: a new `apps/desktop/e2e/navigation.workflow.spec.ts` asserting the
  four moves this change is about, and `comparison.md` with the captures.
- No IPC, preload or main-process change. No new dependency.
