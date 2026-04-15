# Refactoring Plan — apps/desktop/src/components/layout

_Plan drafted: 2026-04-12_

## Executive Summary
`src/components/layout` is functional and feature-rich, but it has drifted from “shell chrome” into a catch-all bucket for nearly every cross-cutting renderer surface in the app. There are no current High-priority hard-rule violations in this folder, but the ownership blur and near-cap file cluster mean shell work will keep getting slower and riskier unless the directory is re-partitioned, duplicated workflows are consolidated, and a few render-time lifecycle hacks are retired.

## Issues Found (prioritized)
- **Medium** — ~~`components/layout` is no longer a shell-only layer; ownership is smeared across unrelated feature islands — `apps/desktop/src/components/layout/WorkspaceTree.tsx:50-445`, `apps/desktop/src/components/layout/ChatPanel.tsx:46-296`, `apps/desktop/src/components/layout/CommandMenu.tsx:19-118`, `apps/desktop/src/components/layout/AuthLoginDialog.tsx:57-334`, `apps/desktop/src/components/layout/ThemeEditorSheet.tsx:59-399`, and `apps/desktop/src/components/layout/titlebar/GitTitleBarControls.tsx:11-160` together show the pattern. This fights the shell/app split from AD-001 and AD-003: the shell should compose global chrome, not become the default home for auth, git publishing, theme tooling, model management, gateway QR login, and collaboration internals.~~ ✅ 2026-04-15 (`44c0f213`) — Repartitioned the folder so top-level files are now stable shell/compatibility façades while auth, device pairing, models, theme, workspace, and titlebar Git workflows live under feature-owned subtrees (`auth/`, `device/`, `models/`, `theme/`, `workspace/`, `titlebar/git/`, plus `shell/` for true chrome). Effort: **L**.

- **Medium** — ~~A large near-cap cluster is one feature away from repeated 500-LOC violations — `apps/desktop/src/components/layout/ContextEditor.tsx:1-479`, `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx:1-479`, `apps/desktop/src/components/layout/AuthLoginViews.tsx:1-464`, `apps/desktop/src/components/layout/ModelSelector.tsx:1-445`, `apps/desktop/src/components/layout/ToolCallHelpers.tsx:1-412`, and `apps/desktop/src/components/layout/model-manager/ModelManagerDialog.tsx:1-406` remain in the danger zone after `WorkspaceTree.tsx` and `ThemeEditorSheet.tsx` were split on 2026-04-14/15 (`c3326a2e`, `b322b915`). The folder has no High violation today, but the cap pressure is still widespread enough that more feature work here will become expensive by default.~~ ✅ 2026-04-15 (`1c46330f`) — Completed the remaining `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `model-manager/ModelManagerDialog.tsx` split pass; the folder now has no files at or above 400 LOC and the largest remaining file is `remote-origin-views.tsx` at 392 LOC. Effort: **M**.

- **Medium** — ~~Git remote publish/origin flows are duplicated across workspace and titlebar surfaces and are already diverging in behavior and error semantics — `apps/desktop/src/components/layout/remote-origin-views.tsx:53-289`, `apps/desktop/src/components/layout/RemoteOriginManager.tsx:45-95`, and `apps/desktop/src/components/layout/titlebar/GitRemotePublishSection.tsx:38-317` each implement their own GitHub status checks, default repo-name generation, origin creation, existing-origin connection, fallback URL handling, and failure messaging. This is classic drift-prone duplication in a runtime-sensitive surface.~~ ✅ 2026-04-14 (`ad8cfc67`) — Added `git-remote/workflow.ts` as the shared runtime owner for GitHub status loading, repo-name defaults, origin parsing, create-repo fallback URL resolution, and add-or-update origin semantics while keeping the workspace dialog and titlebar presenters visually distinct. Effort: **M**.

- **Medium** — ~~Slash-command and file-reference autocompletes duplicate the same document-level keyboard/listbox machinery instead of sharing one primitive — `apps/desktop/src/components/layout/SlashCommandMenu.tsx:53-178` and `apps/desktop/src/components/layout/FileReferenceMenu.tsx:85-212` both maintain selected-index state, `scrollIntoView`, capture-phase `keydown` listeners, and nearly identical listbox rendering. This is small-scale duplication, but it sits in a hot UX path and invites inconsistent keyboard behavior over time.~~ ✅ 2026-04-15 (`bcb2d01d`) — Added `AutocompleteListbox.tsx` as the shared capture-phase keyboard/listbox primitive so both menus now only own filtering/grouping and row rendering. Effort: **S**.

- **Medium** — ~~Several layout helpers still perform side effects during render, obscuring lifecycle ownership and making behavior harder to reason about — `apps/desktop/src/components/layout/CollaborationFeedItems.tsx:326-338` still schedules `requestAnimationFrame` from render, and `apps/desktop/src/components/layout/theme-editor/FontPicker.tsx:20-24` still preloads fonts during render after the `ThemeEditorSheet` draft initialization was moved into `useThemeEditorState` on 2026-04-15 (`b322b915`). None of these are broken today, but they bypass the normal “external side effects live in effects/callback refs” rule and increase future regression risk.~~ ✅ 2026-04-15 (`cc7d6fab`) — Moved collaboration auto-scroll into an effect-backed hook and `FontPicker` Google-font preloading into a mount effect, with focused tests covering post-commit scroll timing plus one-time preload/selection behavior. Effort: **S**.

- **Low** — A few shell surfaces still collapse operational failures into empty/no-op states, making runtime issues look like “no data” — `apps/desktop/src/components/layout/WorkspaceTree.tsx:95-97` ignores workspace-open failure, `apps/desktop/src/components/layout/remote-origin-views.tsx:53-61` treats VCS lookup errors as “no origin”, `apps/desktop/src/components/layout/AuthLoginDialog.tsx:80-83` replaces provider-load failure with empty lists, and `apps/desktop/src/components/layout/AppStoreDialog.tsx:83-108` turns plugin-search failure into an empty discover result. Effort: **S**.

## Proposed Refactoring
1. ~~**Re-partition `components/layout` by ownership while keeping shell entrypoints stable.**~~ ✅ 2026-04-15 (`44c0f213`)
   - Keep true shell façades at the top level or under a dedicated `shell/` area:
     - `TitleBar`
     - `MainSidebar`
     - `StatusBar`
     - `ChatPanel`
     - `NewAppBanner`
   - Move feature-heavy support code into clearer subtrees, for example:
     - `layout/chat/**` — prompt/tool/message/collaboration rendering
     - `layout/workspace/**` — `WorkspaceTree`, `SessionNode`, add-workspace, mounts, remote-origin manager
     - `layout/auth/**` — auth dialog/views
     - `layout/theme/**` — theme browser/editor and token controls
     - `layout/models/**` — `ModelSelector` + `model-manager/**`
     - `layout/titlebar/git/**` — ship/publish/PR controls
   - Preserve import stability during the migration with thin re-export files if needed.
   - Landed by moving the real shell implementations under `shell/`, carving feature-owned `auth/`, `device/`, `models/`, `theme/`, `workspace/`, and `titlebar/git/` subtrees, and leaving top-level compatibility façades so existing imports stay stable.
   - Why: restores the AD-001/AD-003 shell boundary without forcing a full UI rewrite.

2. ~~**Split the near-cap hubs before they cross the hard 500-LOC line.**~~ ✅ 2026-04-15 (`1c46330f`)
   - Target the highest-pressure files first:
     - ~~`WorkspaceTree.tsx` → `useWorkspaceTreeRuntime`, `WorkspaceNode`, `WorkspaceBulkDeleteDialog`~~ ✅ 2026-04-14 (`c3326a2e`)
     - ~~`ThemeEditorSheet.tsx` → draft-state/preview hook + sectioned presentation shell~~ ✅ 2026-04-15 (`b322b915`)
     - ~~`ModelSelector.tsx` → trigger, provider list, thinking picker, search/filter hook~~ ✅ 2026-04-15 (`6df0b02f`)
     - ~~`ContextEditor.tsx` → top-level dialog shell + separate preset/system/tools/skills modules~~ ✅ 2026-04-15 (`53f64174`)
     - ~~`model-manager/local-models/LocalProviderForm.tsx` → connection section, compat section, model list section, save footer~~ ✅ 2026-04-15 (`a891f56a`)
     - ~~`AuthLoginViews.tsx` → provider-list helpers plus extracted auth-flow presenters~~ ✅ 2026-04-15 (`1c46330f`)
     - ~~`ToolCallHelpers.tsx` → extracted summary/detail/image/single-call presenters with a thin compatibility barrel~~ ✅ 2026-04-15 (`1c46330f`)
     - ~~`model-manager/ModelManagerDialog.tsx` → extracted tab bar, derived-state runtime, and thinner dialog shell~~ ✅ 2026-04-15 (`1c46330f`)
   - Align with the existing Wave A/Wave C pattern: stores/hooks own orchestration, layout files should mostly compose focused helpers.

3. **Extract one shared git-remote workflow used by both workspace and titlebar UI.**
   - Introduce a shared module/hook (for example `layout/git-remote/useGitRemoteOrigin.ts` or `lib/git-remote.ts`) covering:
     - GitHub auth status loading
     - default repo name generation
     - create-repo + fallback URL resolution
     - connect/update existing origin
     - `origin` fetch/parse helpers
   - Keep the two surfaces visually distinct (`RemoteOriginManager` dialog vs titlebar publish card), but make them thin presenters over the same workflow.
   - This is especially important because this path changes runtime behavior, not just shape.

4. **Replace the two autocomplete popovers with a shared listbox/navigation primitive.**
   - Extract generic selection state + capture-phase keyboard handling into something like:
     - `useAutocompleteListbox(items, open, onSelect, onClose)`
     - or a shared `AutocompletePopover` component with render props
   - Then let `SlashCommandMenu` and `FileReferenceMenu` provide only their filtering/grouping and row renderers.
   - This reduces duplicated hot-path logic and makes keyboard behavior easier to keep consistent.

5. ~~**Move render-time side effects into explicit lifecycle helpers.**~~ ✅ 2026-04-15 (`cc7d6fab`)
   - `ThemeEditorSheet`: replace render-phase `setDraft`/`setTab` with an explicit open-transition effect or a small controller hook.
   - `useAutoScroll`: move `requestAnimationFrame(scrollToBottom)` into an effect keyed by feed length.
   - `FontPicker`: preload fonts at module init, on panel open, or in an effect rather than during render.
   - These changes are structural, but they touch subtle UX behavior, so they need targeted verification.

6. **Normalize shell error and transient-feedback behavior.**
   - Surface explicit load/search/origin failures instead of silently showing empty states.
   - Consolidate repeated “flash success/error, then clear” state patterns into a small helper where it materially reduces boilerplate.
   - Make sure shell actions that can fail (open workspace from plugin event, fetch origin, plugin search, auth provider load) leave an observable trace in the UI.

## Benefits & Trade-offs
- Benefits: clearer shell ownership, smaller and more reviewable files, less duplicated git/autocomplete logic, easier future work on chat/theme/model/git surfaces, and better runtime observability when shell actions fail.
- Trade-offs: notable file churn, more imports to update, potential merge conflicts with ongoing UI work, and some temporary re-export/shim code while the folder is being re-shaped.

## Dependencies & Risks
- This folder consumes many store/hook contracts already reviewed in Wave A/B; extraction work should follow those ownership decisions rather than reintroducing renderer-side orchestration.
- Unifying git remote flows is runtime-sensitive work: it can change success-path behavior, fallback URL generation, and existing-origin update semantics. Verify both “create GitHub repo” and “connect existing origin” flows from both entrypoints.
- Replacing render-time side effects must preserve subtle UX behavior: live theme preview, collaboration auto-scroll timing, and font availability in the editor.
- File moves will touch `apps/desktop/src/App.tsx`, profile/onboarding surfaces, and a few hooks importing layout utilities; keep the migration incremental to avoid unnecessary churn.

## Next Steps
1. ~~Re-partition `components/layout` by ownership while keeping shell entrypoints stable.~~ ✅ 2026-04-15 (`44c0f213`)
2. ~~Extract a shared git-remote workflow and migrate `RemoteOriginManager` + `GitRemotePublishSection` to it.~~ ✅ 2026-04-14 (`ad8cfc67`)
3. ~~Continue splitting the near-cap hubs before adding more feature work there.~~ ✅ 2026-04-15 (`1c46330f`)
   - ~~`WorkspaceTree.tsx` → `useWorkspaceTreeRuntime`, `WorkspaceNode`, `WorkspaceBulkDeleteDialog`~~ ✅ 2026-04-14 (`c3326a2e`)
   - ~~`ThemeEditorSheet.tsx`~~ ✅ 2026-04-15 (`b322b915`)
   - ~~`ModelSelector.tsx`~~ ✅ 2026-04-15 (`6df0b02f`)
   - ~~`ContextEditor.tsx`~~ ✅ 2026-04-15 (`53f64174`)
   - ~~`model-manager/local-models/LocalProviderForm.tsx`~~ ✅ 2026-04-15 (`a891f56a`)
   - ~~`AuthLoginViews.tsx`~~ ✅ 2026-04-15 (`1c46330f`)
   - ~~`ToolCallHelpers.tsx`~~ ✅ 2026-04-15 (`1c46330f`)
   - ~~`model-manager/ModelManagerDialog.tsx`~~ ✅ 2026-04-15 (`1c46330f`)
4. ~~Build a shared autocomplete/listbox primitive and migrate `SlashCommandMenu` + `FileReferenceMenu`.~~ ✅ 2026-04-15 (`bcb2d01d`)
5. ~~Remove render-phase side effects from theme/collaboration/font helpers.~~ ✅ 2026-04-15 (`cc7d6fab`)
6. Low follow-up still deferred: normalize shell error and transient-feedback behavior.
7. Verification checklist:
   - Open a session via the `sero:open-session` custom event and confirm the chat panel opens/focuses correctly.
   - Create a workspace, then create/connect a remote origin from both the workspace dialog and the titlebar ship panel.
   - Draft and create a PR from the titlebar flow after publishing.
   - Open Theme Editor, preview changes, cancel, reopen, and save a preset.
   - Exercise slash-command and `@file` menus with keyboard navigation (`↑/↓`, `Enter`, `Tab`, `Esc`).
   - Test voice transcription device switching and QR URL copy success/failure states.

## Execution log
- `ad8cfc67` — `refactor(layout): share git remote origin workflow`
- `c3326a2e` — `refactor(layout): split workspace tree runtime`
- `b322b915` — `refactor(layout): split theme editor state`
- `6df0b02f` — `refactor(layout): split model selector runtime`
- `53f64174` — `refactor(layout): split context editor dialog`
- `a891f56a` — `refactor(layout): split local provider form`
- `bcb2d01d` — `refactor(layout): share autocomplete listbox primitive`
- `cc7d6fab` — `refactor(layout): move render-time side effects into lifecycle hooks`
- `1c46330f` — `refactor(layout): split remaining near-cap helper surfaces`
- `44c0f213` — `refactor(layout): repartition shell feature ownership`
