# Facts — apps/desktop/src/components/layout

_Last reviewed: 2026-04-12_

## What this code does
`src/components/layout` is the shell-facing UI layer for the desktop app. It renders the always-on chrome (`TitleBar`, `MainSidebar`, `StatusBar`, `ChatPanel`) and also hosts a large set of cross-cutting feature surfaces that hang off the shell: workspace/session management, chat/tool rendering, auth/provider dialogs, theme editing, model selection and local-model management, git publish/PR flows, device pairing, and collaboration activity views.

## Shape & metrics
- Total files: 88
- Total LOC: 15,908
- Largest files:
  - `apps/desktop/src/components/layout/ContextEditor.tsx` (479 LOC)
  - `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None
- Near-cap files (≥400 LOC):
  - `apps/desktop/src/components/layout/ContextEditor.tsx` (479)
  - `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479)
  - `apps/desktop/src/components/layout/AuthLoginViews.tsx` (464)
  - `apps/desktop/src/components/layout/WorkspaceTree.tsx` (445)
  - `apps/desktop/src/components/layout/ModelSelector.tsx` (445)
  - `apps/desktop/src/components/layout/remote-origin-views.tsx` (438)
  - `apps/desktop/src/components/layout/ToolCallHelpers.tsx` (412)
  - `apps/desktop/src/components/layout/model-manager/ModelManagerDialog.tsx` (406)
  - `apps/desktop/src/components/layout/ThemeEditorSheet.tsx` (400)
- External dependencies of note: `motion/react`, `lucide-react`, `@sero-ai/ui` ai-elements + Radix wrappers, browser media APIs (`MediaRecorder`, `navigator.mediaDevices`), `zustand`, DOM portals/resizable panels
- Upstream callers:
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/components/profiles/OnboardingWizard.tsx`
  - `apps/desktop/src/hooks/useCheckpointRestore.ts`
- Downstream dependencies:
  - Renderer stores: `src/stores/{agent,app,workspace,sessions,theme,feedback,dev-server,vcs,model-preferences,container}`
  - Hooks: `src/hooks/{useChatPromptInput,useMessageQueue,useCheckpointRestore,useUserFeedbackInit}`
  - Preload bridge domains: `window.sero.{agent,auth,workspace,plugins,vcs,github,voice,gateway,devServer,appState,localModels,themes,debug,shell,subagent}`

## Architectural notes
- This directory is no longer just shell chrome. It mixes true shell components (`TitleBar`, `MainSidebar`, `StatusBar`, `ChatPanel`) with several feature islands: auth/provider management, theme editing, model management, git ship/publish/PR flows, device pairing, collaboration visualisation, and workspace remote-origin management.
- Shell ownership should stay aligned with AD-001 and AD-003: the shell composes global chrome and the global chat panel, but feature-specific workflows should not accumulate as an undifferentiated `layout/` catch-all.
- Collaboration surfaces in this folder are the shell landing zone for AD-021, while workspace/container affordances (`WorkspaceTree`, mounts, remote origin) are renderer clients of AD-018-backed flows and main-process workspace/VCS state.
- Memory and thinking UI in chat (`MemoryContextBlock`, `ThinkingBlock`, `ChatMessageItem`) are coupled to the renderer event/stash pipeline described in `docs/features/memory.md`; changes here must stay in sync with the store/hook plans already recorded for `src/stores` and `src/hooks`.
- Titlebar Git controls consume watched app-state files rather than invoking git directly from the renderer. Watch/unwatch symmetry matters here.

## Runtime-sensitive surfaces
- Global shell behaviors that must not regress:
  - `sero:open-session` and `sero:workspace-changed` custom-event handling in `WorkspaceTree`
  - global chat routing and collaboration tray resize persistence in `ChatPanel`
  - remote-origin creation/connection and PR creation flows in workspace and titlebar surfaces
  - auth/provider refresh triggering model-state refresh across open sessions
  - microphone permission, device enumeration, and transcription lifecycle in `VoiceTranscriptionControl`
- Production/external assumptions to preserve explicitly:
  - GitHub auth status and fallback repo URL generation
  - plugin discovery search/install/uninstall behavior when the registry/network is unavailable
  - browser support differences for `MediaRecorder`, `requestIdleCallback`, and device labels
  - font-loading behavior for theme editing (currently tied to Google-font preloading)

## Surprising discoveries
- `components/layout` contains 88 files and nearly 16k LOC, but only a small subset is actual shell scaffolding.
- Workspace remote setup (`RemoteOriginManager` + `remote-origin-views`) and titlebar publishing (`titlebar/GitRemotePublishSection`) implement almost the same GitHub/origin workflow separately.
- Several components still rely on render-phase side effects instead of explicit lifecycle hooks: `ThemeEditorSheet` sets state during render, `useAutoScroll` schedules `requestAnimationFrame` from render, and `FontPicker` preloads fonts during render.
- The shell directory now houses entire sub-products: model manager/local providers, theme editor, auth dialog, git ship deck, collaboration room, QR device pairing, and plugin discovery.

## Post-fix snapshot — 2026-04-14 (git-remote workflow)

### Metrics after fixes
- Total files: 91 (was 88)
- Largest file: `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `git-remote/workflow.ts` as the shared runtime owner for GitHub auth status loading, default repo-name generation, origin parsing, create-repo URL fallback, and add-or-update origin semantics.
- Rebased `RemoteOriginManager.tsx` and `remote-origin-views.tsx` on the shared workflow so the workspace dialog now reuses the same origin parsing and connection/update logic as the titlebar surface.
- Rebased `titlebar/GitRemotePublishSection.tsx` on the shared workflow and added focused coverage in `git-remote/workflow.test.ts` for fallback URL resolution, existing-origin updates, and origin parsing.
- `remote-origin-views.tsx` dropped below the near-cap list (438 → 392 LOC) and `titlebar/GitRemotePublishSection.tsx` slimmed from 323 → 293 LOC.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup for `WorkspaceTree.tsx`, `ThemeEditorSheet.tsx`, `ModelSelector.tsx`, `ContextEditor.tsx`, and `model-manager/local-models/LocalProviderForm.tsx` remains deferred.
- Shared autocomplete/listbox primitives, render-phase side-effect cleanup, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-14 (workspace-tree split)

### Metrics after fixes
- Total files: 95 (was 91)
- Total LOC: 16,500 (was 15,908 at the original review)
- Largest file: `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `workspace-tree/useWorkspaceTreeRuntime.ts` so mount loading, Escape-clears-selection behavior, `sero:workspace-changed` refreshes, and `sero:open-session` chat routing now live in one focused runtime owner.
- Added `workspace-tree/WorkspaceNode.tsx` plus `workspace-tree/WorkspaceBulkDeleteDialog.tsx`, reducing `WorkspaceTree.tsx` to a thin shell over the extracted runtime and presentation seams (445 → 77 LOC).
- Added `workspace-tree/useWorkspaceTreeRuntime.test.tsx` to cover the runtime-sensitive custom-event and selection-clearing behavior called out in the plan.
- `WorkspaceTree.tsx` is no longer in the near-cap list; the remaining cap-pressure set is now `ContextEditor.tsx`, `LocalProviderForm.tsx`, `AuthLoginViews.tsx`, `ModelSelector.tsx`, `ToolCallHelpers.tsx`, `ModelManagerDialog.tsx`, and `ThemeEditorSheet.tsx`.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup for `ThemeEditorSheet.tsx`, `ModelSelector.tsx`, `ContextEditor.tsx`, and `model-manager/local-models/LocalProviderForm.tsx` remains deferred after the `WorkspaceTree.tsx` split.
- Shared autocomplete/listbox primitives, render-phase side-effect cleanup, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-15 (theme-editor split)

### Metrics after fixes
- Total files: 101 (was 95)
- Total LOC: 16,897 (was 16,500)
- Largest file: `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `theme-editor/useThemeEditorState.ts` plus `theme-editor/shared.ts` so draft initialization/teardown, live preview application, preset save/reset flows, and preview reversion now live behind one focused controller seam instead of render-phase state updates inside `ThemeEditorSheet.tsx`.
- Added `theme-editor/{ThemeEditorDetailsSection.tsx,ThemeEditorTabs.tsx,ThemeEditorFooter.tsx}` and reduced `ThemeEditorSheet.tsx` to a thin presentation shell over the extracted sections and controller (400 → 112 LOC).
- Added `theme-editor/useThemeEditorState.test.tsx` to cover the behavior-sensitive open/close initialization, live preview revert, save, and built-in preset reset flows.
- `ThemeEditorSheet.tsx` is no longer in the near-cap list; the remaining cap-pressure set is now `ContextEditor.tsx`, `LocalProviderForm.tsx`, `AuthLoginViews.tsx`, `ModelSelector.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.
- The `ThemeEditorSheet` render-phase state update noted in the original review is now gone; the remaining render-phase side-effect follow-up is limited to `CollaborationFeedItems.tsx` and `theme-editor/FontPicker.tsx`.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup for `ModelSelector.tsx`, `ContextEditor.tsx`, and `model-manager/local-models/LocalProviderForm.tsx` remains deferred, along with the still-near-cap `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx` follow-up.
- Shared autocomplete/listbox primitives, the remaining render-phase side-effect cleanup in collaboration/font helpers, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-15 (model-selector split)

### Metrics after fixes
- Total files: 107 (was 101)
- Total LOC: 17,255 (was 16,897)
- Largest file: `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `model-selector/useModelSelectorState.ts` so focused-session model availability, preference filtering, favourites derivation, idle popover priming, manager open/close, and model/thinking mutation routing now live in one focused controller seam.
- Added `model-selector/{filtering.ts,ModelSelectorTrigger.tsx,ModelSelectorList.tsx,ThinkingPicker.tsx}` and reduced `ModelSelector.tsx` to a thin shell over extracted filtering, presentation, and thinking-picker helpers (445 → 108 LOC).
- Added `model-selector/useModelSelectorState.test.tsx` to cover hidden-model/provider filtering, favourites visibility, open-state priming/reset, thinking-badge suppression, and focused-session action routing.
- `ModelSelector.tsx` is no longer in the near-cap list; the remaining cap-pressure set is now `ContextEditor.tsx`, `LocalProviderForm.tsx`, `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup for `ContextEditor.tsx` and `model-manager/local-models/LocalProviderForm.tsx` remains deferred, along with the still-near-cap `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx` follow-up.
- Shared autocomplete/listbox primitives, the remaining render-phase side-effect cleanup in collaboration/font helpers, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-15 (context-editor split)

### Metrics after fixes
- Total files: 114 (was 107)
- Total LOC: 17,591 (was 17,255)
- Largest file: `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` (479 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `context-editor/useContextEditorState.ts` so preset metadata, prompt fallback, enabled-count derivation, save-input visibility, and apply-and-close semantics now live in one focused controller seam instead of the dialog shell.
- Added `context-editor/{PresetBar.tsx,SystemPromptSection.tsx,CapabilitySection.tsx,ToolsSection.tsx,SkillsSection.tsx}` and reduced `ContextEditor.tsx` to a thin dialog shell over the extracted preset/system/tools/skills presenters (479 → 100 LOC).
- Added `context-editor/useContextEditorState.test.tsx` to cover prompt fallback, user-preset metadata, save-input toggling, and the “close only after successful apply” guardrail.
- `ContextEditor.tsx` is no longer in the near-cap list; the remaining cap-pressure set is now `LocalProviderForm.tsx`, `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup for `model-manager/local-models/LocalProviderForm.tsx` remains deferred, along with the still-near-cap `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx` follow-up.
- Shared autocomplete/listbox primitives, the remaining render-phase side-effect cleanup in collaboration/font helpers, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-15 (local-provider-form split)

### Metrics after fixes
- Total files: 123 (was 114)
- Total LOC: 18,131 (was 17,591)
- Largest file: `apps/desktop/src/components/layout/AuthLoginViews.tsx` (464 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `model-manager/local-models/useLocalProviderFormState.ts` so preset application, advanced connection request reuse, model discovery/dedupe, duplicate-name validation, and save payload assembly now live in one focused controller seam.
- Added `model-manager/local-models/{shared.ts,LocalProviderField.tsx,LocalProviderPresetSection.tsx,LocalProviderConnectionSection.tsx,LocalProviderCompatSection.tsx,LocalProviderModelsSection.tsx,LocalProviderFooter.tsx}` and reduced `LocalProviderForm.tsx` to a thin composition shell (479 → 113 LOC).
- Added `model-manager/local-models/useLocalProviderFormState.test.tsx` to cover preset application/reset behavior, advanced header/auth reuse for connection tests, model dedupe/manual edits, duplicate provider-name guardrails, and edited-provider save semantics.
- `LocalProviderForm.tsx` is no longer in the near-cap list; the remaining cap-pressure set is now `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup now only covers `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.
- Shared autocomplete/listbox primitives, the remaining render-phase side-effect cleanup in collaboration/font helpers, and shell error-surface normalization remain exactly as described in the original plan.

## Post-fix snapshot — 2026-04-15 (autocomplete/listbox primitive)

### Metrics after fixes
- Total files: 125 (was 123)
- Total LOC: 18,311 (was 18,131)
- Largest file: `apps/desktop/src/components/layout/AuthLoginViews.tsx` (464 LOC)
- Files over 500 LOC: None (unchanged)
- Type escape hatches remaining: none detected by `rg` for `@ts-ignore`, `@ts-expect-error`, `as any`, or `as unknown as` in `apps/desktop/src/components/layout/`

### What changed
- Added `AutocompleteListbox.tsx` as the shared runtime/presentation owner for selected-index state, capture-phase keyboard handling, selection reset/clamping, scroll-into-view, and common listbox shell/option styling.
- Rebased `SlashCommandMenu.tsx` on the shared primitive so it now owns only slash-command filtering, source grouping, and row content while dropping duplicate document-listener and listbox boilerplate (197 → 121 LOC).
- Rebased `FileReferenceMenu.tsx` on the shared primitive so it now owns only fuzzy matching, path highlighting, and file-icon rendering while dropping duplicate navigation/listbox code (212 → 133 LOC).
- Added `AutocompleteListbox.test.tsx` to cover the hot-path keyboard guardrails called out in the plan: wraparound navigation, Enter selection, reset-on-filter-change, Escape close, and scroll-into-view behavior.

### Still outstanding
- The larger ownership repartition of `components/layout` into clearer shell-vs-feature subtrees is still pending.
- Near-cap cleanup still covers `AuthLoginViews.tsx`, `ToolCallHelpers.tsx`, and `ModelManagerDialog.tsx`.
- Remaining Medium/Low follow-up is now limited to render-phase side-effect cleanup in collaboration/font helpers plus shell error-surface normalization.
