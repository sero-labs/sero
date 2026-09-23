## 1. Runtime: create a project on a folder or a workspace

- [x] 1.1 In `plugins/sero-architect-plugin/runtime/projects-actions.ts`, replace `create(input: { idea; folder; executionMode?; models? })` with `CreateProjectInput { idea; executionMode?; models?; folder?; workspaceId? }`, and add an optional `workspaceId` to `NewProjectInput` and `createProjectRecord` in `shared/record.ts` so the record is written with it instead of `null`. Verify `pnpm --filter @sero-ai/plugin-architect typecheck` passes.
- [x] 1.2 In `create`, resolve `workspaceId` against `host.listWorkspaces()` and refuse when the workspace is not registered, is `global`, or already holds a project; set the record's `name`, `folder` and `workspaceId` from the workspace. Verify `runtime/__tests__/projects-actions.test.ts` cases: an existing workspace yields a record whose `name`/`folder`/`workspaceId` come from it, `host.listWorkspaces()` length is unchanged, and a second project on the same workspace is refused.
- [x] 1.3 In `create`, refuse a new folder that already exists, using `host.fileInfo(folder)`, with a message naming the folder; keep `requireEmpty: false` in `runtime/host.ts`. Verify a test asserting no record is written, `createWorkspace` is not called, and the refusal names the folder.
- [x] 1.4 Require exactly one of `folder` and `workspaceId` and refuse when neither or both are given. Verify tests for the absent-folder, absent-workspace and both-given calls, and that `advanceIntake` still reuses a workspace on resume after a record update failed.

## 2. Tool and UI actions carry the choice

- [x] 2.1 Add an optional `workspaceId` to `ProjectsToolParams` in `plugins/sero-architect-plugin/extension/projects-tool.ts`, require `folder` only when `workspaceId` is absent, and pass both through to `actions.create`. Verify `extension/__tests__/tools.test.ts` covers a create with `workspaceId` and one with `folder`.
- [x] 2.2 Change `ArchitectActions.create` in `plugins/sero-architect-plugin/ui/lib/actions.ts` to take the same input object and send only the fields it holds. Verify `pnpm --filter @sero-ai/plugin-architect typecheck` passes and the existing create call in `ArchitectApp.tsx` compiles after task 4.1.

## 3. The dialog offers the choice

- [x] 3.1 In `plugins/sero-architect-plugin/ui/components/IntakeDialog.tsx`, add the two-part choice (`New folder` / `Existing workspace`), defaulting to New folder. Render Name and Location under New folder and hide them under Existing workspace; keep Description, Use worktree, Model overrides, Cancel and Create project unchanged, with Use worktree off by default. Verify `ui/__tests__/project-controls.test.tsx` covers both modes and that a New folder submit still sends the idea, folder, execution mode and models.
- [x] 3.2 Load the workspace list with `window.sero.workspace.list?.()` when the dialog is open, drop `global`, list workspaces without a project first, each with its path, and show the rest as `Architect project` and disabled. Verify tests cover the order, the disabled rows, the absent Global workspace, and that the chosen `workspaceId` is submitted instead of a folder.
- [x] 3.3 Keep `Create project` disabled until New folder is valid or an Existing workspace is chosen, and surface a runtime refusal through the existing `role="alert"` error line. Verify a test that an existing-folder refusal is shown and the dialog stays open.

## 4. The app supplies the project links

- [x] 4.1 In `plugins/sero-architect-plugin/ui/ArchitectApp.tsx`, derive the workspace ids the watched index already links from `index.projects`, pass them to `IntakeDialog`, and forward the create input object from `useCreateProject`. Verify the Architect `ui/__tests__` suites pass and that a workspace in the index renders as `Architect project` in the picker.

## 5. Match the drawing

- [x] 5.1 Style the choice and the workspace picker in `plugins/sero-architect-plugin/ui/styles.css` under the plugin scope, using host tokens (`--bg-surface`, `--border-subtle`, `--text-muted`, `--accent`) rather than Tailwind-only colour names, to match frame 1 and the open picker in frame 2. Verify `pnpm --filter @sero-ai/plugin-architect preview` renders both modes and the open picker without a clipped panel.

## 6. Evidence

- [x] 6.1 Add previews for the New folder dialog, the Existing workspace dialog and the open picker in `plugins/sero-architect-plugin/ui/__preview__/main.tsx`, and append a workspace list to the `window.sero` stub there and in `ui/__preview__/fixture.ts`. Verify each preview renders through the real `IntakeDialog`.
- [x] 6.2 Capture `apps/styleguide/public/prototypes/agent-workspace-ux-audit/7-architect-in-an-existing-workspace.html` frame 1 and frame 2, and the built dialog at a viewport wider than the panel, opening the picker on both sides, then read each pair as images side by side. Verify every fold and the picker were opened before any difference was recorded.
- [x] 6.3 Write `comparison.md` with the capture method, each difference the captures showed and what was done about it, and the departures taken knowingly: the refusal checks the folder the user named while the host still resolves a slug destination; New folder is the default choice; a workspace with an unavailable path is offered and fails into the blocked state. Name any frame that was never compared.

## 7. Checks and delivery

- [x] 7.1 Run `pnpm typecheck` from the monorepo root and confirm no errors in the renderer or the Electron main process.
- [x] 7.2 Run the touched suites: `plugins/sero-architect-plugin/runtime/__tests__/projects-actions.test.ts`, `plugins/sero-architect-plugin/extension/__tests__/tools.test.ts` and `plugins/sero-architect-plugin/ui/__tests__/project-controls.test.tsx`, and record the result before review.
- [x] 7.3 Open the pull request as a draft, linked to issue #542 in its description, and paste the `comparison.md` captures into the description.
