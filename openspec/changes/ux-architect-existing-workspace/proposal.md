## Why

New project can only make a new folder. When the user points it at code they
already have, their choice is not offered, and the folder they name is silently
taken over: Sero rewrites its `.sero-workspace.json`, or makes an empty sibling
beside it. Architect's first phase already starts from a workspace's contents, so
the only missing piece is a way to choose one.

The approved drawing is
`apps/styleguide/public/prototypes/agent-workspace-ux-audit/7-architect-in-an-existing-workspace.html`.
Its two frames, its Decisions and its "Controls on this screen today" lists are
binding.

## What Changes

- **New project gains a choice: New folder or Existing workspace.** New folder
  keeps Name and Location. Existing workspace replaces them with a Workspace
  picker, and the project takes the workspace's name. Description, Use worktree,
  Model overrides, Cancel and Create project are unchanged, and Use worktree stays
  off by default.
- **The Workspace picker lists workspaces that have no Architect project first**,
  each with its path. A workspace that already has a project is shown with
  "Architect project" and cannot be chosen. The Global workspace is left out.
- **New folder refuses a folder that exists.** It no longer registers an existing
  folder in place and no longer makes an empty sibling when the name is already a
  workspace. The user is told the folder exists and can choose Existing workspace
  or another folder.
- **A project created on an existing workspace records that workspace's id and
  path and creates and registers no workspace.** Intake then runs as it does
  today: the repository is initialised, the owner grant is requested and discovery
  starts from the workspace's contents.
- **One Architect project per workspace.** A workspace with a project cannot be
  chosen again; its new work goes to that project through "Tell Architect what to
  do next".

Non-goals: the same take-over in the desktop Add Workspace menu, which is a
separate user-facing path; the discovery prompt, which already reads the
workspace; and the one-project-per-workspace rule, which does not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `architect-ui`: intake offers New folder or Existing workspace; the Existing
  workspace picker's contents, order and disabled rows; the project takes the
  workspace's name; New folder refuses a folder that exists.
- `architect-project-record`: a project created on an existing workspace records
  that workspace's id and path, and creation creates and registers no workspace.

## Impact

- Architect UI: `ui/components/IntakeDialog.tsx` (the choice and the picker),
  `ui/ArchitectApp.tsx` (which workspaces already hold a project),
  `ui/lib/actions.ts` (the create contract), `ui/styles.css` (the segmented
  choice and the picker rows), and the preview harness `ui/__preview__/main.tsx`
  and `ui/__preview__/fixture.ts` for captures.
- Architect runtime: `runtime/projects-actions.ts` (`create` accepts a
  workspace, refuses an existing folder, and skips workspace creation) and
  `extension/projects-tool.ts` (the `create` action accepts `workspaceId`).
  `runtime/host.ts` is unchanged; it already exposes `fileInfo` and
  `listWorkspaces`.
- Tests: `runtime/__tests__/projects-actions.test.ts` and
  `ui/__tests__/project-controls.test.tsx`; `runtime/__tests__/helpers.ts` gains
  an existing workspace.
- Evidence: `comparison.md` with the drawing's two frames beside the built
  surface, captured through the preview harness.
- No host, IPC, preload or main-process change. No new dependency.
