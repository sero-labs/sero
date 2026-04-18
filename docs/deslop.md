# Deslop Log

Changes made during code quality passes. Most recent first.

---

## 2026-04-18

### Files Changed

| File | Change |
|------|--------|
| `packages/common/src/{app-tools.ts,plugins.ts,index.ts}` | Added canonical app-tool result types plus the shared host-capability / compatibility contract used by discovery, preload, and plugin manifests |
| `packages/app-runtime/src/{sero-bridge.ts,use-app-tools.ts,index.ts}` | Added the generic federated-app tool hook so plugin UIs can call app-local extension tools through `appAgent.invokeTool(...)` |
| `apps/desktop/electron/ipc/agent/handlers/{app-agent.ts,app-agent-tools.ts}` | Added app-agent tool execution IPC and normalized app-tool result shaping for isolated app sessions |
| `apps/desktop/electron/preload/apps/app-domain.ts`, `apps/desktop/src/types/{electron-apps.d.ts,ipc-channels.ts,ipc-channels-app-agent.ts,sero-apps.ts}` | Extended the preload/type surface for app-tool invocation and host-compatibility metadata without breaking the 500-LOC cap |
| `apps/desktop/src/lib/app-runtime.test.tsx`, `apps/desktop/electron/__tests__/ipc/app-agent-tool-execution.test.ts` | Added focused coverage for the generic app-tool bridge in both renderer and main-process seams |
| `apps/desktop/electron/cli/core/{types.ts,registry.ts,schema-bridge.ts}`, `apps/desktop/electron/cli/index.ts`, `apps/desktop/electron/ipc/agent/core/agent.ts` | Reworked bridged app commands into provenance-aware session-owned registry state, refreshed custom `tool.cli` handlers from live session definitions, and removed session-owned commands on teardown |
| `apps/desktop/electron/__tests__/cli/{custom-tool-cli-bridge.test.ts,extension-session-bridge.test.ts,tool-bridge-policy.test.ts}` | Added/kept focused regressions for builtin override, hot-update refresh, uninstall cleanup, and live session tool resolution |
| `apps/desktop/electron/features/apps/discovery/{index.ts,plugin-meta.ts}` | Split plugin metadata parsing out of discovery and added runtime compatibility evaluation to discovered manifests (305 lines after split) |
| `apps/desktop/electron/features/plugins/{activation.ts,compatibility.ts,manager.ts,settings.ts}` | Added runtime host-version/capability enforcement plus startup activation reconciliation while reducing `manager.ts` below the cap again (498 → 448 lines) |
| `apps/desktop/electron/ipc/integrations/plugins.ts`, `apps/desktop/electron/__tests__/features/plugins/{plugin-manager.test.ts,plugin-compatibility.test.ts}` | Reconciled installed plugin activation at startup and added focused install/load compatibility regressions |
| `apps/desktop/src/stores/app/{shared.ts,discovery.ts,state.ts}`, `apps/desktop/src/stores/app.test.ts`, `apps/desktop/src/components/layout/{AppStoreCard.tsx,AppStoreDialog.tsx}` | Kept unsupported plugins browseable in the App Store while hiding them from active sidebar/preload paths and surfacing compatibility errors inline |
| `docs/plugins/{technical.md,guide.md,host-compatibility.md}` | Updated plugin docs for `requiredHostCapabilities`, enforced compatibility checks, truthful hot-load behavior, and a downstream migration guide for plugin authors |
| `docs/deslopify/apps/desktop/electron/cli/{facts,plan}.md`, `docs/deslopify/index.md` | Recorded the platform-hardening execution pass, marked the CLI plan healthy, and left the Google integration/re-review follow-up tracked separately |
| `docs/deslopify/plugins/sero-google-plugin/{facts,plan}.md`, `docs/deslopify/index.md` | Recorded the post-PR-146 Google integration pass, marked Phase 9 complete, and narrowed the remaining Google migration work to the still-unchecked manual verification items |
| `plugins/sero-google-plugin/extension/google/{auth-tool.ts,auth.ts}` | Restored secure OAuth config writes (0700 dir / 0600 file) and ensured failed browser launch closes the Google OAuth loopback server |
| `plugins/sero-google-plugin/extension/google/cli-followup.ts`, `plugins/sero-google-plugin/extension/__tests__/google-cli-handlers.test.ts` | Made follow-up summary delivery best-effort so successful Google CLI actions are not misreported as failures when session messaging is unavailable |
| `plugins/sero-google-plugin/extension/__tests__/{google-auth.test.ts,google-auth-tool.test.ts}` | Added focused regressions for loopback-server cleanup on opener failure and locked-down OAuth config file permissions |
| `apps/desktop/electron/cli/index.ts` | Removed stale Google static bridge allowlist entries so `gmail` / `gcal` are owned solely by the plugin manifest again (308 → 305 lines) |
| `apps/desktop/electron/features/profile/{agent-config-migration.ts,copy-profile-data.ts}` | Repointed legacy Google profile migration/copy behavior from dead `google-auth.json` host files to the plugin-owned `agent/plugin-config/sero-google-plugin.json` path |
| `apps/desktop/electron/__tests__/features/profile/{agent-config-migration.test.ts,copy-profile-data.test.ts}` | Added focused regressions for plugin-owned Google config migration/copy behavior |

---

## 2026-04-16

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/electron/features/plugins/manager.ts` | Added uninstall/rollback `unregisterAppPath()` cleanup so plugin discovery registration stays symmetric without changing install success-path behavior (498 → 498 lines) |
| `apps/desktop/electron/features/apps/discovery/index.ts` | Added explicit `unregisterAppPath()` lifecycle teardown for manually registered discovery paths (312 → 320 lines) |
| `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts` | Added focused register/unregister regression coverage so manual discovery paths disappear immediately without restart |
| `apps/desktop/electron/__tests__/features/plugins/plugin-manager.test.ts` | New — verifies plugin install/uninstall clears discovery state and settings immediately in-process |
| `docs/deslopify/apps/desktop/electron/features/plugins/{facts,plan}.md` | Recorded the uninstall-path symmetry closeout, refreshed plugin-folder metrics, and left split/diagnostic follow-ups deferred |
| `docs/deslopify/{index,outstanding}.md` | Reduced the active final-closeout queue from two items to one after clearing plugin uninstall-path symmetry |
| `apps/desktop/electron/features/plugins/package-build.ts` | Made git/local source plugin prep deterministic by always reinstalling dependencies before build instead of trusting pre-existing `node_modules` |
| `apps/desktop/electron/__tests__/features/plugins/plugin-package-build.test.ts` | Added regressions that both git and local staged source installs still run dependency install when `node_modules` already exists |
| `docs/deslopify/apps/desktop/electron/features/plugins/plan.md` | Marked only the deterministic source-build closeout item complete and left uninstall-symmetry/bridge-policy follow-ups untouched |
| `docs/deslopify/{index,outstanding}.md` | Reduced the active final-closeout queue from three items to two after clearing deterministic plugin source-build prep |
| `apps/desktop/electron/features/apps/state/manager.ts` | Hardened app-state watch bootstrap so concurrent watch/unwatch cancels cleanly, failed setup retries correctly, and non-`EEXIST` bootstrap errors no longer leave broken watcher entries behind (305 → 324 lines) |
| `apps/desktop/electron/__tests__/features/apps/app-state-manager.test.ts` | New — covers cancelled concurrent bootstrap and retry-after-failed-watch behavior |
| `apps/desktop/electron/features/apps/extensions/git-checkpoints.ts` | Replaced loose checkpoint-summary parsing with record guards plus safer bash/agent-end helpers (295 → 315 lines) |
| `apps/desktop/electron/features/apps/extensions/ui-context.ts` | Replaced the `theme: any` stub with a concrete Pi `Theme`, documented the unsupported custom-UI no-op seam, and kept notification behavior unchanged (75 → 145 lines) |
| `apps/desktop/electron/__tests__/features/apps/{git-checkpoints,ui-context}.test.ts` | New — covers checkpoint summary fallback behavior and extension UI notification/no-op contracts |
| `docs/deslopify/apps/desktop/electron/features/apps/{facts,plan}.md` | Recorded the High-item execution pass, noted the live-folder/plan drift, and narrowed remaining work to Medium/Low follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/apps/` in progress with both High items cleared |
| `apps/desktop/electron/features/agent/assistants/image-agent.ts` | Replaced loose Gemini content/global typings with SDK-backed parts, a typed legacy `__seroImageGen` bridge, and current ownership comments (189 → 198 lines) |
| `apps/desktop/electron/__tests__/features/agent/image-agent.test.ts` | New — covers the typed legacy `__seroImageGen` exposure contract |
| `docs/deslopify/apps/desktop/electron/features/agent/{facts,plan}.md` | Recorded the image-agent typing/bridge/comment cleanup closeout and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/agent/` healthy with all tracked items cleared |
| `apps/desktop/electron/features/collaboration/specialist-runner.ts` | New — shared single-specialist execution helper for standard and debate collaboration runs |
| `apps/desktop/electron/features/collaboration/{index.ts,debate.ts}` | Rebased both collaboration strategies on the shared specialist runner while preserving phase callbacks, model overrides, and degraded-mode behavior |
| `apps/desktop/electron/features/collaboration/required-agents.ts` | New — required-role preflight validator shared by standard and debate collaboration strategies |
| `apps/desktop/electron/features/collaboration/{index.ts,debate.ts}` | Added fail-fast required-agent preflight checks before specialist orchestration and synthesis |
| `apps/desktop/electron/__tests__/features/collaboration/degraded-mode.test.ts` | Added regressions that missing required collaboration/debate agents fail before orchestration starts |
| `apps/desktop/src/lsp/language-routing.ts` | Exported canonical LSP routing maps so renderer and main-process editor config share one source of truth |
| `apps/desktop/electron/features/editor/lsp/types.ts` | Rebased TypeScript server `extensions`/`monacoLanguageIds`/`languageIdMap` on shared routing metadata |
| `apps/desktop/electron/__tests__/features/editor/lsp-config-routing.test.ts` | New — guards that main-process `findConfigByLanguageId()` stays aligned with shared LSP routing contracts |
| `docs/deslopify/apps/desktop/electron/features/collaboration/{facts,plan}.md` | Recorded the shared-runner + required-agent preflight closeout and marked the folder plan fully executed |
| `docs/deslopify/apps/desktop/electron/features/editor/{facts,plan}.md` | Recorded the canonical routing-contract extraction closeout and narrowed remaining editor work to adapter/install follow-ups |
| `docs/deslopify/index.md` | Marked collaboration healthy and updated editor status after clearing the first Medium follow-up |
| `apps/desktop/electron/features/editor/lsp/server-request-handlers.ts` | New — documented adapter table for supported LSP server-initiated request methods |
| `apps/desktop/electron/features/editor/lsp/lsp-process.ts` | Rebased server-request handling onto the shared adapter table and rate-limited unhandled-method logs (303 → 285 lines) |
| `apps/desktop/electron/features/editor/lsp/types.ts` | Pinned runtime container-side TypeScript/LSP install versions for reproducible startup installs |
| `apps/desktop/electron/__tests__/features/editor/{lsp-server-request-handlers,lsp-config-routing}.test.ts` | Added adapter-table coverage and pinned-install-command guardrails |
| `docs/deslopify/apps/desktop/electron/features/editor/{facts,plan}.md` | Recorded adapter-table + install-policy closeout and marked the editor folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/editor/` healthy with all tracked items cleared |
| `docs/deslopify/desktop-packages-plugins/{facts,plan}.md` | Retired the final deferred Low-polish tracker for the cross-cutting baseline and recorded a docs-only full closeout |
| `docs/deslopify/index.md` | Marked `desktop-packages-plugins/` fully closed with no remaining tracked follow-ups |
| `apps/desktop/electron/features/gateway/server/cost-tracker.ts` | Refactored gateway cost-config loading to return a result-shaped read, preserve malformed/unreadable config files, and surface explicit load errors without clobbering operator config |
| `apps/desktop/electron/__tests__/features/gateway/cost-tracker.test.ts` | New — verifies malformed `gateway-config.json` is preserved with surfaced load errors, while first-run missing config still persists defaults |
| `docs/deslopify/apps/desktop/electron/features/gateway/{facts,plan}.md` | Closed stale request-validation tracker row, recorded the non-destructive cost-config fix, and narrowed remaining gateway backlog to subscription/static-file/dual-UI follow-ups |
| `docs/deslopify/index.md` | Updated gateway status after clearing another Medium follow-up and removed deleted `plugins/sero-hello-world-plugin/` from the tracked backlog |
| `apps/desktop/electron/features/onboarding/{preflight.ts,index.ts,types.ts}` | Split onboarding preflight into explicit read-only vs repair-aware entry points, switched auth/memory probes to async fs reads, and removed dead helper leftovers |
| `apps/desktop/electron/features/onboarding/{provider-health.ts,model-groups.ts,provider-metadata.ts}` | Removed onboarding imports from IPC internals by introducing feature-owned provider metadata/model-group shaping helpers and async local-provider probing |
| `apps/desktop/electron/ipc/onboarding/onboarding.ts` | Made onboarding IPC state requests call the explicit repair-aware entrypoint (`getOnboardingStateWithRepairs`) |
| `apps/desktop/electron/__tests__/features/onboarding/{preflight,model-groups}.test.ts` | New — covers read-only vs repair-aware onboarding preflight behavior and model-group parity with existing IPC shaping |
| `docs/deslopify/apps/desktop/electron/features/onboarding/{facts,plan}.md` | Closed stale onboarding tracker rows, recorded post-fix metrics, and marked all Medium/Low items executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/onboarding/` healthy after the full cleanup pass |
| `apps/desktop/electron/features/gateway/bridge/agent-bridge.ts` | Added formal gateway event-listener subscriptions so adapters consume forwarded events without method monkey-patching |
| `apps/desktop/electron/features/gateway/channels/discord.ts` | Replaced gateway method monkey-patching with bridge subscriptions and removed easy non-null/type-escape leftovers in mention/typing handling (478 → 464 lines) |
| `apps/desktop/electron/features/gateway/server/static-files.ts` | Reworked static serving around startup-primed `web-dist` metadata so request paths use cached manifest lookups instead of repeated sync existence/stat checks |
| `apps/desktop/electron/features/gateway/index.ts` | Primed gateway static-file cache at server startup before request handling (495 → 497 lines) |
| `apps/desktop/electron/__tests__/features/gateway/{agent-bridge,static-files}.test.ts` | New — regression coverage for event-listener fan-out and cached static-file fallback behavior |
| `docs/deslopify/apps/desktop/electron/features/gateway/{facts,plan}.md` | Closed stale gateway tracker rows, recorded the Discord-subscription/static-file Medium closeout, and narrowed remaining work to the Low dual-UI ownership decision |
| `docs/deslopify/index.md` | Updated gateway status after clearing all tracked Medium follow-ups |
| `apps/desktop/electron/features/gateway/channels/web.ts` | Declared `web-dist/` SPA as primary UI owner by redirecting standalone web-chat root traffic to gateway SPA while preserving `/basic` fallback |
| `apps/desktop/electron/__tests__/features/gateway/web-chat-server.test.ts` | New — locks standalone redirect-to-SPA behavior and explicit `/basic` fallback routing |
| `docs/deslopify/apps/desktop/electron/features/gateway/{facts,plan}.md` | Recorded Low ownership closeout, refreshed post-fix gateway snapshot, and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/gateway/` healthy with all tracked items cleared |
| `apps/desktop/electron/features/subagent/core/single-run.ts` | New — shared single-run executor for subagent resolve/configure/track/run/finalize flow |
| `apps/desktop/electron/features/subagent/index.ts` | Reduced `SubagentManager` single-mode duplication by delegating `runSingle()`/`runSingleStructured()` to the shared executor (492 → 333 lines) |
| `docs/deslopify/apps/desktop/electron/features/subagent/{facts,plan}.md` | Recorded the Medium single-run extraction closeout and refreshed the post-fix subagent snapshot |
| `docs/deslopify/index.md` | Updated subagent status to show the first Medium item cleared with policy/comment follow-ups still pending |
| `apps/desktop/electron/features/subagent/{core/types.ts,index.ts,runtime/discovery.ts}` | Removed non-functional runtime policy knobs (`tools`, `extensions`, `blockedExtensions`) and made discovery emit explicit ignored-field warnings for unsupported frontmatter |
| `apps/desktop/electron/__tests__/features/subagent/discovery.test.ts` | Added coverage that unsupported `tools`/`extensions` frontmatter is warned and ignored while discovery remains stable |
| `docs/deslopify/apps/desktop/electron/features/subagent/{facts,plan}.md` | Recorded the Medium policy-surface cleanup closeout and narrowed remaining work to the Low loader-comment fix |
| `docs/deslopify/index.md` | Updated subagent status to show High + Medium items cleared with only Low cleanup pending |
| `apps/desktop/electron/features/vcs/core/vcs-manager.ts` | Preserved explicit filesystem checkpoint sources instead of rewriting `fs` checkpoints to `manual` |
| `apps/desktop/electron/__tests__/features/vcs/vcs-manager.test.ts` | New — regression coverage for filesystem checkpoint creation + log parsing source semantics |
| `docs/deslopify/apps/desktop/electron/features/vcs/{facts,plan}.md` | Recorded the filesystem checkpoint-source Medium closeout and refreshed the VCS post-fix snapshot |
| `docs/deslopify/index.md` | Updated VCS status after clearing the checkpoint-source Medium item |
| `packages/common/src/{vcs.ts,index.ts}` | New canonical shared VCS contract module and root exports so renderer/main process consume one neutral type owner |
| `apps/desktop/src/types/vcs.ts` | Reduced desktop VCS types to a compatibility barrel that re-exports canonical `@sero/common` contracts |
| `apps/desktop/electron/features/vcs/{core/{pr-ops,vcs-ops}.ts,support/{parsers,types}.ts}` | Repointed Electron VCS runtime imports to the shared `@sero/common` contracts instead of renderer-owned type paths |
| `apps/desktop/{electron/{preload/api/workbench.ts,ipc/integrations/vcs.ts},src/{stores/vcs.ts,types/electron-workspace.d.ts,components/apps/explorer/{editor/DiffTab.tsx,vcs/*},components/layout/{shell/StatusBar.tsx,titlebar/git/GitPullRequestComposer.tsx}}}` | Rebased preload/IPC and renderer VCS consumers onto the canonical shared contracts without runtime behavior changes |
| `apps/desktop/electron/features/vcs/core/git-runner.ts` | Replaced process-lifetime host SSH transport probe caching with TTL + SSH key metadata invalidation while preserving SSH-vs-HTTPS auth behavior |
| `apps/desktop/electron/__tests__/features/vcs/git-runner.test.ts` | New — focused regressions for host SSH probe cache TTL expiry and key-metadata invalidation behavior |
| `docs/deslopify/apps/desktop/electron/features/vcs/{facts,plan}.md` | Recorded host-transport Medium closeout and refreshed remaining VCS modularization/timestamp follow-ups |
| `docs/deslopify/index.md` | Updated VCS status to reflect host transport Medium closeout with modularization + Low follow-ups pending |
| `apps/desktop/electron/features/vcs/core/vcs-ops.ts` | Reduced to a thinner VCS orchestration façade over extracted bookmark/remote/push helper modules (442 → 325 lines) |
| `apps/desktop/electron/features/vcs/core/vcs-ops/{bookmark-ops.ts,remote-ops.ts,push-helpers.ts}` | New — focused helper modules for bookmark lifecycle, remote lifecycle, and push-branch resolution/branch-at-commit flows |
| `apps/desktop/electron/features/vcs/core/pr-ops.ts` | Reduced to a thin PR orchestration façade over extracted state/preview/create helpers (438 → 109 lines) |
| `apps/desktop/electron/features/vcs/core/pr-ops/{state.ts,preview.ts,create.ts}` | New — separated PR branch-state resolution, diff/preview shaping, and `gh pr create` execution/error formatting |
| `docs/deslopify/apps/desktop/electron/features/vcs/{facts,plan}.md` | Recorded the VCS modularization Medium closeout, refreshed metrics, and narrowed remaining work to the Low checkpoint-description follow-up |
| `docs/deslopify/index.md` | Updated VCS status to show all Medium follow-ups cleared with only the Low checkpoint-description item pending |
| `apps/desktop/electron/features/container/network/{http-proxy,port-forward}.ts` | Hardened proxy client/target filtering and made container port scans/bridge teardown awaitable with stale-state cleanup (`http-proxy.ts` 221 → 232 lines; `port-forward.ts` 213 → 234 lines) |
| `apps/desktop/electron/features/container/{index.ts,core/lifecycle.ts}` | Awaited scanner cleanup during stop/remove/shutdown and enforced `readOnlyMounts` as `:ro` (`lifecycle.ts` 454 → 454 lines) |
| `apps/desktop/electron/main.ts` | Graceful shutdown now awaits container port-forward disposal before stopping containers |
| `apps/desktop/electron/__tests__/features/container/{http-proxy,port-forward,lifecycle}.test.ts` | New/updated — focused regression coverage for proxy subnet/target guards, bridge teardown on scan stop/failure, and read-only mount command wiring |
| `docs/deslopify/apps/desktop/electron/features/container/{facts,plan}.md` | Recorded the High-item + mount-contract execution pass, noted plan drift, and narrowed remaining work to tool dedupe/near-cap/dead-metrics follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/container/` in progress after clearing both High items plus the mount-contract Medium fix |
| `apps/desktop/electron/shared/settings/settings-helpers.ts` | Hardened settings reads into an explicit malformed-file boundary with actionable errors and provider-manifest cache invalidation on writes |
| `apps/desktop/electron/{features/onboarding/preflight.ts,ipc/workspace/profiles.ts,__tests__/features/onboarding/preflight.test.ts,__tests__/shared/settings/settings-helpers.test.ts}` | Preserved malformed `settings.json` files by aborting onboarding/model-config mutations instead of rewriting broken state |
| `apps/desktop/electron/shared/infra/{shared-infra.ts,singletons.ts,runtime-settings.ts}` | Split shared infra into focused registrars while preserving the exported singleton API (`shared-infra.ts` 264 → 151 lines) |
| `apps/desktop/electron/shared/providers/package-provider-manifests.ts` | Removed the dead provider-manifest helper and switched cache refresh to invalidation-driven reads with a safety TTL |
| `packages/common/src/{user-feedback.ts,index.ts}`, `apps/desktop/electron/shared/lib/user-feedback-bus.ts`, `plugins/sero-user-feedback-plugin/shared/emitter.ts` | Deduplicated the user-feedback bus singleton factory on one shared global helper |
| `apps/desktop/electron/preload/{integrations/google-imagegen.ts,editor/debug-lsp.ts,platform/host-services.ts}` | Replaced remaining weak preload bridge signatures with concrete Google/imagegen/LSP/layout contracts |
| `apps/desktop/electron/__tests__/ipc/preload-api-subscriptions.test.ts` | Added typed Google and LSP subscription teardown coverage |
| `apps/desktop/electron/ipc/agent/core/{agent.ts,agent-session-open.ts,agent-helpers.ts,agent-messages.ts,sdk-private-adapter.ts,agent-event-broadcast.ts,agent-ids.ts}` | Split near-cap agent IPC ownership, isolated private SDK access, and centralized agent event fanout (`agent.ts` 498 → 354 lines; `agent-helpers.ts` 453 → 158 lines) |
| `apps/desktop/electron/ipc/{lib/window-broadcast.ts,agent/handlers/{prompts,sessions}.ts,gateway/gateway-ops.ts,apps/apps.ts,integrations/{plugins,github,vcs}.ts,container/{container,dev-server,terminal}.ts,editor/{debug,editor,lsp}.ts,platform/{auth/safe-storage.ts,ui/user-feedback-questions.ts},collaboration/collaboration.ts,subagent/subagent.ts}` | Replaced sync hot-path filesystem calls with async equivalents where practical and removed duplicated BrowserWindow broadcast boilerplate |
| `apps/desktop/electron/__tests__/ipc/agent-sdk-private-adapter.test.ts` | New — locks the private SDK adapter guardrails used by context overrides and runtime model mutation |
| `apps/desktop/electron/platform/security/csp.ts` | Tightened production CSP by keeping inline-script and broad framed http(s) allowances dev-only |
| `apps/desktop/electron/platform/protocols/{ext-protocol.ts,builtin-resources.ts,builtin-package-detection.{js,d.ts}}`, `apps/desktop/scripts/build-electron.mjs`, `apps/desktop/electron/features/plugins/manager.ts` | Added extension-protocol unregister symmetry and unified builtin package detection across runtime + build tooling |
| `apps/desktop/electron/platform/env/index.ts` | Refactored env bootstrap into explicit resolve/apply/load stages while preserving pre-SDK ordering guarantees |
| `apps/desktop/electron/__tests__/platform/{builtin-package-detection,csp,env,ext-protocol}.test.ts` | New — targeted regression coverage for Group 1 platform boundary hardening |
| `apps/desktop/electron/features/apps/discovery/index.ts` | Tightened `sero.plugin` manifest validation so malformed metadata is warned, `isPlugin` follows explicit declaration, and valid manifests keep their existing discovery behavior (320 → 430 lines) |
| `apps/desktop/electron/__tests__/features/apps/app-discovery.test.ts` | Added malformed-manifest regressions that preserve valid plugin metadata behavior while covering invalid category and non-object `sero.plugin` cases |
| `docs/deslopify/apps/desktop/electron/features/apps/plan.md` | Marked the final apps discovery closeout item complete and moved the remaining folder follow-ups to backlog-only status |
| `docs/deslopify/{index,outstanding}.md` | Marked the deslopify closeout wave complete with zero active items and all remaining follow-ups explicitly backlog-only |

---

## 2026-04-15

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/layout/ThemeEditorSheet.tsx` | Reduced to a thin theme-editor shell over extracted controller/presentation modules and removed render-phase draft initialization (400 → 112 lines) |
| `apps/desktop/src/components/layout/theme-editor/{shared.ts,useThemeEditorState.ts,ThemeEditorDetailsSection.tsx,ThemeEditorTabs.tsx,ThemeEditorFooter.tsx}` | New — extracted theme-editor draft/preview controller, shared preset helpers, and focused metadata/tab/footer sections |
| `apps/desktop/src/components/layout/theme-editor/useThemeEditorState.test.tsx` | New — covers theme-editor open/close initialization, live preview revert, save, and built-in reset behavior |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the ThemeEditorSheet split, refreshed layout metrics, and narrowed the remaining near-cap/render-side-effect backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the ThemeEditorSheet split cleared |
| `apps/desktop/src/components/layout/ModelSelector.tsx` | Reduced to a thin model-selector shell over extracted controller/presentation modules (445 → 108 lines) |
| `apps/desktop/src/components/layout/model-selector/{filtering.ts,ModelSelectorTrigger.tsx,ModelSelectorList.tsx,ThinkingPicker.tsx,useModelSelectorState.ts,useModelSelectorState.test.tsx}` | New — extracted model-selector filtering/runtime ownership, focused trigger/list/thinking presenters, and direct state coverage |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the ModelSelector split, refreshed layout metrics, and narrowed the remaining near-cap backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the ModelSelector split cleared |
| `apps/desktop/src/components/layout/ContextEditor.tsx` | Reduced to a thin context-editor shell over extracted preset/system/tools/skills modules (479 → 100 lines) |
| `apps/desktop/src/components/layout/context-editor/{CapabilitySection.tsx,PresetBar.tsx,SkillsSection.tsx,SystemPromptSection.tsx,ToolsSection.tsx,useContextEditorState.ts,useContextEditorState.test.tsx}` | New — extracted context-editor preset/runtime ownership, focused section presenters, and direct state coverage |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the ContextEditor split, refreshed layout metrics, and narrowed the remaining near-cap backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the ContextEditor split cleared |
| `apps/desktop/src/components/layout/model-manager/local-models/LocalProviderForm.tsx` | Reduced to a thin local-provider shell over extracted form-state and presentation modules (479 → 113 lines) |
| `apps/desktop/src/components/layout/model-manager/local-models/{shared.ts,LocalProviderField.tsx,LocalProviderPresetSection.tsx,LocalProviderConnectionSection.tsx,LocalProviderCompatSection.tsx,LocalProviderModelsSection.tsx,LocalProviderFooter.tsx,useLocalProviderFormState.ts}` | New — extracted focused helpers, sections, and controller ownership for preset, connection, model, and save flows |
| `apps/desktop/src/components/layout/model-manager/local-models/useLocalProviderFormState.test.tsx` | New — covers preset application, advanced connection reuse, model dedupe/manual edits, duplicate-name guardrails, and edited-provider save semantics |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the LocalProviderForm split, refreshed layout metrics, and narrowed the remaining near-cap backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the LocalProviderForm split cleared |
| `apps/desktop/src/components/layout/AutocompleteListbox.tsx` | New — shared capture-phase keyboard/listbox primitive for slash-command and file-reference menus |
| `apps/desktop/src/components/layout/AutocompleteListbox.test.tsx` | New — covers wraparound navigation, selection/reset, Escape close, and scroll-into-view behavior for the shared autocomplete primitive |
| `apps/desktop/src/components/layout/SlashCommandMenu.tsx` | Rebased slash-command autocomplete on the shared listbox primitive and reduced duplicated keyboard/render code (197 → 121 lines) |
| `apps/desktop/src/components/layout/FileReferenceMenu.tsx` | Rebased file-reference autocomplete on the shared listbox primitive and reduced duplicated keyboard/render code (212 → 133 lines) |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the shared autocomplete/listbox primitive closeout, refreshed layout metrics, and narrowed the remaining backlog to render-side-effect and error-surface follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the shared autocomplete/listbox item cleared |
| `apps/desktop/src/components/layout/CollaborationFeedItems.tsx` | Moved collaboration auto-scroll scheduling from render into an effect-backed hook with animation-frame cleanup |
| `apps/desktop/src/components/layout/CollaborationFeedItems.test.tsx` | New — covers post-commit auto-scroll scheduling and feed-length change guardrails |
| `apps/desktop/src/components/layout/theme-editor/FontPicker.tsx` | Moved Google-font preloading from render into a mount effect while preserving one-time loading |
| `apps/desktop/src/components/layout/theme-editor/FontPicker.test.tsx` | New — covers one-time Google-font preloading and preset-selection loading |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the render-side-effect cleanup closeout, refreshed layout metrics, and narrowed the remaining backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the render-side-effect cleanup item cleared |
| `apps/desktop/src/components/layout/AuthLoginViews.tsx` | Reduced to a thin auth-login barrel over extracted provider-list and auth-flow modules (464 → 14 lines) |
| `apps/desktop/src/components/layout/auth-login-views/{ProviderListView.tsx,AuthFlowViews.tsx,provider-list-helpers.ts,provider-list-helpers.test.ts}` | New — extracted auth provider-list/auth-flow presenters plus focused preferred-provider and saved-credential coverage |
| `apps/desktop/src/components/layout/ToolCallHelpers.tsx` | Reduced to a thin tool-call compatibility barrel over extracted presenter modules (412 → 18 lines) |
| `apps/desktop/src/components/layout/tool-call-helpers/{ToolSummaryText.tsx,ToolLine.tsx,ToolImages.tsx,ToolDetail.tsx,SingleToolCall.tsx}` | New — extracted summary-link, image-preview, detail, and single-call presenters for tool groups |
| `apps/desktop/src/components/layout/model-manager/ModelManagerDialog.tsx` | Reduced to a thinner model-manager shell over extracted runtime and tab helpers (406 → 196 lines) |
| `apps/desktop/src/components/layout/model-manager/{ModelManagerTabBar.tsx,useModelManagerState.ts,runtime.ts,runtime.test.ts}` | New — extracted model-manager tab chrome, derived-state runtime, and focused favourite/hidden-count coverage |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the remaining near-cap cleanup closeout, refreshed layout metrics, and narrowed remaining work to ownership repartition plus Low error-surface follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the remaining near-cap cleanup cleared |
| `apps/desktop/src/components/layout/{TitleBar,MainSidebar,StatusBar,ChatPanel,CommandMenu,NewAppBanner}.tsx` | Reduced the top-level layout shell files to thin compatibility façades over `shell/` ownership modules |
| `apps/desktop/src/components/layout/shell/{TitleBar,MainSidebar,StatusBar,ChatPanel,CommandMenu,NewAppBanner}.tsx` | New — dedicated shell ownership area for always-on chrome and command surfaces |
| `apps/desktop/src/components/layout/{auth,device,models,theme,workspace}/**` | Repartitioned auth, device pairing, model, theme, and workspace implementations under feature-owned subtrees while preserving stable façade imports |
| `apps/desktop/src/components/layout/titlebar/{GitTitleBarControls,GitShipPanel,GitRemotePublishSection,GitPullRequestComposer,GitShipActionPill,git-titlebar-state}.ts*` | Reduced titlebar Git entrypoints to thin compatibility façades over `titlebar/git/` |
| `apps/desktop/src/components/layout/titlebar/git/**` | New — dedicated titlebar Git ownership subtree for publish/PR state and presenters |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the ownership repartition closeout, refreshed layout metrics, and left only the Low error-surface follow-up deferred |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` healthy with all Medium items cleared |
| `apps/desktop/src/components/layout/{ErrorSurface.tsx,error-utils.ts}` | New — shared shell error notice and error-message helper for retryable operational failure states |
| `apps/desktop/src/components/layout/AppStoreDialog.tsx` | Discover plugin search now surfaces explicit retryable failures instead of falling back to empty results |
| `apps/desktop/src/components/layout/auth/{AuthLoginDialog.tsx,AuthLoginDialog.test.tsx}` | Auth provider loading now exposes retryable failures in-place instead of rendering empty lists, with focused coverage |
| `apps/desktop/src/components/layout/git-remote/{workflow.ts,workflow.test.ts}` | Origin lookup now distinguishes VCS load failures from "no origin," with regression coverage for the new error result |
| `apps/desktop/src/components/layout/workspace/{WorkspaceTree.tsx,RemoteOriginManager.tsx,RemoteOriginManager.test.tsx}` | Surfaced workspace-open and remote-origin lookup failures with observable shell notices and focused coverage |
| `apps/desktop/src/components/layout/workspace/workspace-tree/{useWorkspaceTreeRuntime.ts,useWorkspaceTreeRuntime.test.tsx}` | Preserved `sero:open-session` routing while surfacing workspace-open failures to the tree UI, with coverage |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Closed the final Low layout follow-up, refreshed post-fix metrics, and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` fully executed after the Low error-surface pass |
| `apps/desktop/src/components/profiles/OnboardingWizard.tsx` | Reduced to a thin onboarding dialog shell over extracted launch/runtime controllers (486 → 132 lines) |
| `apps/desktop/src/components/profiles/onboarding/{onboarding-launch-runtime.ts,useOnboardingLaunch.ts,onboarding-launch-runtime.test.ts}` | New — extracted onboarding session/runtime ownership plus focused sequencing/auth-recovery coverage |
| `docs/deslopify/apps/desktop/src/components/profiles/{facts,plan}.md` | Recorded the onboarding runtime extraction, refreshed profile-folder metrics, and narrowed the remaining backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/profiles/` in progress with the first Medium onboarding item cleared |
| `apps/desktop/src/components/profiles/OnboardingWizard.tsx` | Replaced the render-phase launch-dialog ref mutation with an effect-backed visibility hook while preserving pending-input dismissal behavior (132 → 128 lines) |
| `apps/desktop/src/components/profiles/onboarding/{useLaunchingDialogVisibility.ts,useLaunchingDialogVisibility.test.tsx}` | New — extracted launch-dialog visibility lifecycle ownership and added focused coverage for pending-input dismissal + relaunch reset behavior |
| `docs/deslopify/apps/desktop/src/components/profiles/{facts,plan}.md` | Recorded the launch-dialog lifecycle cleanup, refreshed profile-folder metrics, and narrowed the remaining backlog to profile-error + GitHub-step follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/profiles/` in progress with the first two Medium onboarding items cleared |
| `apps/desktop/src/components/profiles/{CreateProfileDialog.tsx,ProfileForm.tsx,ProfileSetup.tsx,ProfileSwitcher.tsx,useProfileOperationState.ts}` | Unified restart-aware profile create/switch error handling and surfaced actionable retry copy inline across setup, dialog, and titlebar flows |
| `apps/desktop/src/components/profiles/ProfileOperations.test.tsx` | New — covers first-run activation failure copy, create-dialog switch failures, and inline switcher error visibility |
| `apps/desktop/src/stores/profiles.ts` | Centralized restart-aware profile operation errors and preserved correct switch-vs-create failure reporting during activation |
| `docs/deslopify/apps/desktop/src/components/profiles/{facts,plan}.md` | Recorded the profile-error cleanup, refreshed profile-folder metrics, and left only the Low GitHub-step follow-up pending |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/profiles/` in progress with the third Medium onboarding item cleared |
| `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx` | Centralized optional GitHub-step state transitions around a dedicated onboarding controller while preserving check-before-show, back-cancel, and skip semantics |
| `apps/desktop/src/components/profiles/onboarding/GitHubConnectCard.tsx` | Reduced to a pure presenter over controller-provided GitHub auth/device-flow state |
| `apps/desktop/src/components/profiles/onboarding/{useOnboardingGitHubStep.ts,useOnboardingGitHubStep.test.tsx}` | New — consolidated onboarding GitHub-step control and added focused coverage for refreshed-status, back, and skip flows |
| `apps/desktop/src/hooks/useGitHubAuthFlow.ts` | Added reusable GitHub status refresh support so onboarding can re-check auth without duplicating bridge logic |
| `docs/deslopify/apps/desktop/src/components/profiles/{facts,plan}.md` | Closed the final GitHub-step consolidation item, refreshed profile-folder metrics, and marked the plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/profiles/` fully executed after the Low GitHub-step pass |
| `apps/desktop/src/hooks/useChatPromptInput.ts` | Centralized built-in `/login` and `/logout` routing so slash selection and raw submit paths share one helper |
| `apps/desktop/src/hooks/useGitHubAuthFlow.ts` | Centralized transient copy feedback timer/reset behavior behind one shared helper while preserving success/failure timings |
| `apps/desktop/src/hooks/{useChatPromptInput.test.tsx,useGitHubAuthFlow.test.tsx}` | New — focused coverage for built-in prompt command routing plus GitHub auth copy success/failure reset behavior |
| `docs/deslopify/apps/desktop/src/hooks/{facts,plan}.md` | Closed the remaining Low hook cleanup items, refreshed hook-folder metrics, and marked the plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/hooks/` fully executed after the Low helper-dedupe pass |
| `apps/desktop/src/lib/federation-registry.ts` | Centralized failed federated-load cache cleanup so transient remote outages drop stale lazy/LRU state and retry on the next access |
| `apps/desktop/src/lib/federation-registry.test.ts` | Added jsdom regression coverage that a failed lazy remote load retries and recovers without restart, alongside the existing transient fallback test |
| `docs/deslopify/apps/desktop/src/lib/{facts,plan}.md` | Recorded the federation retry closeout, refreshed lib-folder metrics, and narrowed the remaining backlog to Medium/Low follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lib/` in progress with the High federation retry item cleared |
| `apps/desktop/src/lib/app-control/dom-interactions.ts` | Reduced to a thin app-control DOM interaction router over extracted concern-specific modules (385 → 42 lines) |
| `apps/desktop/src/lib/app-control/dom/{geometry.ts,targeting.ts,actions.ts,inspect.ts}` | New — split app-panel rect math, selector/point targeting, action handlers, and inspect payload shaping into focused modules while preserving the router API |
| `docs/deslopify/apps/desktop/src/lib/{facts,plan}.md` | Recorded the dom-interactions split closeout, refreshed lib-folder metrics, and narrowed the remaining backlog to font-preload + theme dead-code follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lib/` in progress with High + first Medium items cleared |
| `apps/desktop/src/lib/google-fonts.ts` | Changed Google font preloading to a curated popular subset while keeping less-common families on-demand via `loadGoogleFont()` |
| `apps/desktop/src/lib/google-fonts.test.ts` | New — covers curated preload scope, dedupe behavior, on-demand loading of non-preloaded families, and system/unknown no-op handling |
| `docs/deslopify/apps/desktop/src/lib/{facts,plan}.md` | Recorded the font-preload strategy closeout, refreshed lib-folder metrics, and narrowed the backlog to only the Low theme dead-code follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lib/` in progress with High + both Medium items cleared |
| `apps/desktop/src/lib/theme-engine.ts` | Removed dead `presetToMeta` metadata helper and dropped the unused `ThemePresetMeta` import (297 → 285 lines) |
| `docs/deslopify/apps/desktop/src/lib/{facts,plan}.md` | Recorded the Low theme dead-code cleanup closeout, refreshed lib-folder metrics, and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lib/` healthy with all tracked items cleared |
| `apps/desktop/src/lsp/use-lsp.ts` | Reduced to a thin renderer-LSP composition hook over extracted provider, document-sync, and diagnostics modules (300 → 87 lines) |
| `apps/desktop/src/lsp/{provider-registry.ts,document-sync.ts,diagnostics.ts}` | New — extracted Monaco provider registration, document lifecycle, and diagnostics/server-stop ownership from `use-lsp.ts` |
| `apps/desktop/src/lsp/use-lsp.test.tsx` | New — covers LSP startup plus didOpen/didChange/didSave/diagnostics/didClose lifecycle across the split modules |
| `docs/deslopify/apps/desktop/src/lsp/{facts,plan}.md` | Recorded the renderer LSP modularization pass, refreshed folder metrics, and narrowed the remaining backlog to shared-routing + diagnostics follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lsp/` in progress with the first Medium modularization item cleared |
| `apps/desktop/src/lsp/{language-routing.ts,document-sync.ts,use-lsp.ts,lsp-conversions.ts,use-lsp.test.tsx,language-routing.test.ts}` | Extracted shared renderer language-routing metadata and rebased LSP startup/document-sync/provider registration plus focused routing coverage on one canonical map |
| `apps/desktop/src/components/apps/explorer/{editor/editor-panel-shared.ts,vcs/vcs-utils.ts}` | Rebased explorer editor + diff language inference onto the shared LSP language-routing module and removed duplicated extension maps |
| `docs/deslopify/apps/desktop/src/lsp/{facts,plan}.md` | Recorded the shared language-routing extraction closeout, refreshed metrics, and narrowed the remaining backlog to diagnostics + protocol-shape follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lsp/` in progress with the shared-routing Medium item cleared |
| `apps/desktop/src/lsp/diagnostics-routing.ts` | New — workspace-scoped URI→model registry for diagnostics marker routing without global Monaco model scans |
| `apps/desktop/src/lsp/{document-sync.ts,diagnostics.ts}` | Replaced publishDiagnostics model scanning + `as never[]` with typed notification guards and direct route-based marker application |
| `apps/desktop/src/lsp/use-lsp.test.tsx` | Added regression coverage that diagnostics updates no longer call `monaco.editor.getModels()` |
| `docs/deslopify/apps/desktop/src/lsp/{facts,plan}.md` | Recorded the diagnostics-routing closeout, refreshed LSP metrics, and left only the Low protocol-shape follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lsp/` in progress with diagnostics cleanup cleared |
| `apps/desktop/src/components/apps/explorer/explorer-language-routing.test.ts` | New — focused re-review guard that explorer editor + diff language inference stay pinned to canonical `src/lsp/language-routing.ts` |
| `docs/deslopify/apps/desktop/src/lsp/{facts,plan}.md` | Recorded the explorer/editor shared-routing re-review closeout and refreshed the remaining Low-only follow-up notes |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lsp/` in progress with the explorer/editor re-review item cleared |
| `apps/desktop/src/lsp/{lsp-protocol.ts,lsp-conversions.ts,diagnostics.ts}` | Added a canonical renderer LSP protocol-contract module and removed inline protocol interface shadows from conversion/diagnostics runtime code (`lsp-conversions.ts` 218 → 174 lines) |
| `docs/deslopify/apps/desktop/src/lsp/{facts,plan}.md` | Recorded the Low protocol-shape extraction closeout, refreshed LSP metrics, and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/lsp/` healthy with all tracked items cleared |
| `apps/desktop/src/stores/app.ts` | Reduced to a thin compatibility barrel over focused app-store ownership modules (460 → 10 lines) |
| `apps/desktop/src/stores/app/{state.ts,shared.ts,layout-hydration.ts,discovery.ts,listeners.ts}` | New — split app store state, helper contracts, layout hydration, discovery/plugin-change reconciliation, and listener wiring into focused modules |
| `docs/deslopify/apps/desktop/src/stores/{facts,plan}.md` | Recorded the stores cap-relief follow-up closeout, refreshed post-fix metrics, and narrowed remaining backlog to Low selector-churn follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/stores/` in progress with cap-relief follow-up cleared |
| `apps/desktop/src/stores/agent-selectors.ts` | Stabilized streaming-ID and focused-command selector outputs so unchanged results reuse cached references instead of emitting fresh arrays |
| `apps/desktop/src/stores/sessions.ts` | Memoized workspace-grouped session selector output by sessions/query inputs to reduce avoidable object churn in workspace tree consumers |
| `docs/deslopify/apps/desktop/src/stores/{facts,plan}.md` | Closed the Low selector-churn follow-up, refreshed post-fix store metrics, and marked only optional `agent.ts` split work as deferred |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/stores/` healthy with all tracked items cleared |
| `apps/desktop/electron/{ipc/**,features/{apps/state/manager,workspace/watcher}.ts,__tests__/{ipc,features/workspace}/**}` | Repointed Electron IPC/test `IpcChannels` imports from `@/types/ipc` to the dedicated `@/types/ipc-channels` module boundary |
| `apps/desktop/src/types/ipc.ts` | Removed the `IpcChannels` re-export so the IPC compatibility barrel no longer owns channel constants (466 → 465 lines) |
| `docs/deslopify/apps/desktop/src/types/{facts,plan}.md` | Recorded the Medium channel-decoupling follow-up, refreshed type-folder metrics, and narrowed the remaining backlog to Low declaration/comment drift |
| `docs/deslopify/index.md` | Updated `apps/desktop/src/types/` status to in-progress with the Medium IpcChannels item cleared |
| `apps/desktop/src/types/electron-workspace.d.ts` | Replaced LSP `notification: any` with canonical `LspNotification` typing for stricter preload declaration contracts |
| `docs/deslopify/apps/desktop/src/types/{facts,plan}.md` | Recorded the Low declaration-hygiene follow-up closeout, refreshed metrics, and left only comment/default drift plus user-feedback revalidation pending |
| `docs/deslopify/index.md` | Updated `apps/desktop/src/types/` status to in-progress with Medium + Low declaration-hygiene items cleared |
| `apps/desktop/electron/features/auth/google/auth-manager.ts` | Reduced to a thin Google auth composition root over focused status, OAuth loopback, and credential modules (418 → 182 lines) |
| `apps/desktop/electron/features/auth/google/{config.ts,credentials.ts,oauth-loopback.ts,status.ts,types.ts}` | New — extracted Google auth config/constants, gog credential provisioning, loopback OAuth exchange, status+migration helpers, and shared auth types |
| `apps/desktop/electron/__tests__/features/auth/google/{credentials.test.ts,status.test.ts}` | New — focused coverage for extracted credential-import memoization and buggy-keyring migration/status helper behavior |
| `docs/deslopify/apps/desktop/electron/features/auth/{facts,plan}.md` | Recorded the GoogleAuthManager modularization closeout, refreshed auth-folder metrics, and narrowed remaining backlog to Low helper/guidance follow-ups |
| `docs/deslopify/index.md` | Updated `apps/desktop/electron/features/auth/` to reflect both Medium items cleared with only Low follow-ups pending |
| `apps/desktop/electron/features/auth/google/gog-runtime.ts` | New — canonical gog binary/PATH runtime helper reused by auth, IPC, and CLI execution surfaces |
| `apps/desktop/electron/features/auth/google/gog-keyring.ts` | Rebased keyring command execution on shared gog runtime helpers and removed local binary/PATH probing duplication |
| `apps/desktop/electron/{ipc/integrations/google-api.ts,cli/lib/gog-runner.ts}` | Reused shared gog runtime helpers so IPC and CLI Google command execution no longer maintain parallel path-resolution logic |
| `packages/common/src/{github-url.ts,index.ts}` | New — shared GitHub URL parsing/normalization helpers exported for electron + renderer consumers |
| `apps/desktop/electron/features/auth/github/repo-ops.ts` | Replaced local GitHub URL parsing/normalization helpers with canonical `@sero/common` helpers |
| `apps/desktop/src/components/layout/git-remote/workflow.ts` | Reused canonical GitHub URL parsing/web-url helpers to keep renderer publish/origin behavior aligned with repo-ops |
| `docs/deslopify/apps/desktop/electron/features/auth/{facts,plan}.md` | Recorded the Low helper-dedupe closeout, refreshed auth metrics, and narrowed remaining work to profile-scoped guidance text |
| `docs/deslopify/index.md` | Updated `apps/desktop/electron/features/auth/` status to reflect only the final Low guidance follow-up pending |
| `apps/desktop/electron/features/auth/google/config.ts` | Added profile-scoped Google OAuth setup guidance helpers derived from `SERO_AGENT_DIR` and shared by auth login errors |
| `apps/desktop/electron/features/auth/google/auth-manager.ts` | Replaced the hardcoded default-root OAuth guidance string with profile-scoped helper output |
| `apps/desktop/electron/__tests__/features/auth/google/config.test.ts` | New — verifies profile-scoped plugin-config path and guidance text generation from `SERO_AGENT_DIR` |
| `docs/deslopify/apps/desktop/electron/features/auth/{facts,plan}.md` | Closed the final Low profile-scoped guidance item, refreshed auth metrics, and marked the auth plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/features/auth/` healthy with all tracked items cleared |
| `apps/desktop/electron/features/collaboration/{agents.ts,debate.ts,prompt-budget.ts}` | Added bounded synthesis prompt budgets for standard/debate coordinator prompts and shared truncation helper to cap long specialist inputs |
| `apps/desktop/electron/__tests__/features/collaboration/prompt-budgeting.test.ts` | New — locks prompt-budget truncation behavior for standard and debate synthesis stages |
| `docs/deslopify/apps/desktop/electron/features/collaboration/{facts,plan}.md` | Recorded the first Medium collaboration item closeout, refreshed folder metrics, and narrowed outstanding work to degraded-mode plus Low follow-ups |
| `docs/deslopify/index.md` | Updated `apps/desktop/electron/features/collaboration/` status to in-progress with the first Medium item cleared |
| `apps/desktop/electron/features/collaboration/{index.ts,debate.ts,degraded-result.ts}` | Added explicit degraded-mode orchestration so missing required specialist outputs now skip coordinator synthesis and return truthful failure summaries |
| `apps/desktop/electron/__tests__/features/collaboration/degraded-mode.test.ts` | New — covers standard/debate failure paths to ensure required-role failures skip synthesis and surface degraded-mode details |
| `docs/deslopify/apps/desktop/electron/features/collaboration/{facts,plan}.md` | Recorded the degraded-mode Medium closeout, refreshed collaboration metrics, and narrowed remaining backlog to Low helper/preflight items |
| `docs/deslopify/index.md` | Updated `apps/desktop/electron/features/collaboration/` status with both Medium items cleared |

---

## 2026-04-14

### Files Changed

| File | Change |
|------|--------|
| `packages/common/src/model-selection/{types,lookup,validation,index}.ts` | New — split shared model contracts, lookup helpers, and formatter-backed validation into focused modules |
| `packages/common/src/model-selection.ts` | Reduced to a compatibility barrel over the focused model-selection modules (396 → 43 lines) |
| `packages/common/src/{plugins.ts,index.ts}` | Added canonical `sero.providers` manifest contracts and exported formatter-backed model warning helpers |
| `apps/desktop/electron/shared/providers/package-provider-manifests.ts` | Switched desktop provider scanning to the canonical shared provider-manifest contracts |
| `packages/ui/src/components/model-selection/model-warning-list.tsx` | Moved model-warning rendering onto `formatModelValidationWarning()` so UI copy stays outside `@sero/common` |
| `packages/app-runtime/src/sero-bridge.ts` | Rebased app-runtime model bridge types on `@sero/common` and made app-state bridge methods generic |
| `packages/app-runtime/src/use-app-state.ts` | Added optimistic write recovery, watch liveness guards, and explicit persistence-failure warnings |
| `packages/app-runtime/src/{use-widget-registration.ts,widget-registry.ts}` | Made runtime widget registration idempotent for stable inline definitions while preserving sticky widgets |
| `apps/desktop/src/lib/{model-selection.test.ts,app-runtime.test.tsx}` | New — focused coverage for shared model-selection semantics and app-runtime write/registry behavior |
| `apps/desktop/electron/cli/core/{batch-executor.ts,invocation-context.ts}` | New — extracted AD-020 batch execution and invocation/session-runtime helpers from `core/tool.ts` |
| `apps/desktop/electron/cli/core/tool.ts` | Reduced to a thin Sero CLI composition root (494 → 87 lines) |
| `apps/desktop/electron/cli/commands/integrations/{google.ts,google-auth.ts,google-gmail.ts,google-calendar.ts,google-helpers.ts}` | Split the Google CLI surface into focused auth/Gmail/Calendar modules (`google.ts` 441 → 96 lines) |
| `apps/desktop/electron/features/apps/app-control/host-service.ts` | New — canonical main-process app-control owner for CLI + IPC renderer automation |
| `apps/desktop/electron/cli/commands/apps/{app-control.ts,app-control-navigation.ts,app-control-screenshot.ts,app-control-interactions.ts,app-control-recording.ts,app-control-shared.ts}` | Split the app-control CLI router into focused modules (`app-control.ts` 436 → 87 lines) |
| `apps/desktop/electron/ipc/apps/app-control.ts` | Rebased IPC app-control handlers onto the shared host service |
| `apps/desktop/electron/features/kanban/workspace/container-path.ts` | New — canonical workspace→container path helper reused by Kanban runtime helpers |
| `apps/desktop/electron/features/kanban/core/cleanup-warnings.ts` | New — scoped cleanup warning formatting for best-effort review/worktree cleanup |
| `apps/desktop/electron/features/kanban/{implementation/dev-server-launch.ts,workspace/workspace-command-runner.ts,review/actions/review-artifacts.ts,review/state/review-cache.ts,worktree/worktree-git.ts,worktree/worktree-manager.ts}` | Centralized container-path ownership and replaced silent cleanup suppression with visible warnings |
| `apps/desktop/electron/features/kanban/prompts/{index.ts,planning.ts,plan-result.ts,review-types.ts,review-prompt.ts,review-result.ts}` | Split Kanban prompt construction/parsing into focused modules (`index.ts` 423 → 38 lines) |
| `apps/desktop/electron/features/kanban/core/{orchestrator.ts,orchestrator-phase-runners.ts,orchestrator-types.ts}` | Split the Kanban orchestrator into a thin coordinator plus focused phase runners (`orchestrator.ts` 491 → 220 lines) |
| `apps/desktop/electron/features/kanban/review/workflow/{review-executor.ts,review-executor-types.ts,review-pr-lifecycle.ts,review-verification.ts}` | Split review execution into focused cache/verification/PR helpers while preserving workflow behavior |
| `apps/desktop/electron/__tests__/features/apps/app-control-host-service.test.ts` | New — covers shared app-control host readiness and post-interaction screenshot behavior |
| `apps/desktop/electron/__tests__/features/kanban/container-path.test.ts` | New — covers the canonical Kanban workspace→container path helper |
| `packages/common/src/{skill-visibility.ts,user-feedback.ts,index.ts,admin-bridge.ts}` | New/updated — centralized admin skill-visibility helpers plus canonical user-feedback transport/bus contracts and bridge typing |
| `apps/desktop/{src/types/user-feedback.ts,src/types/electron.d.ts,electron/shared/lib/user-feedback-bus.ts,electron/ipc/platform/ui/user-feedback-questions.ts,electron/cli/lib/ask-confirm.ts,electron/__tests__/features/apps/skill-visibility.test.ts}` | Rebased desktop host/renderer user-feedback and skill-visibility seams on the new canonical shared contracts |
| `plugins/sero-admin-plugin/{package.json,extension/tsconfig.json,ui/hooks/useSkillVisibility.ts,ui/skill-visibility.test.ts}` | Moved admin skill-visibility ownership out of the plugin and added package-local extension-inclusive quality gates |
| `plugins/sero-user-feedback-plugin/{package.json,shared/types.ts,shared/emitter.ts,extension/ipc-bridge.ts,extension/__tests__/ipc-bridge.test.ts,ui/sero.d.ts}` | Canonicalized user-feedback transport/bus ownership and added package-local extension bridge coverage |
| `plugins/sero-web-plugin/{package.json,extension/tsconfig.json,extension/__tests__/paths.test.ts,extension/__tests__/state-sync.test.ts}` | Added focused extension compile/test coverage for profile-scoped path ownership plus persisted state/bookmark/download semantics |
| `plugins/sero-context-plugin/{package.json,extension/tsconfig.json,extension/__tests__/snapshot.test.ts}` | Added package-local extension typecheck coverage plus focused snapshot/projection tests |
| `plugins/sero-cron-plugin/{shared/reminder-mutations.ts,shared/__tests__/reminder-mutations.test.ts,extension/reminder-actions.ts,extension/index.ts,ui/CronApp.tsx,ui/components/{ReminderForm.tsx,ReminderCard.tsx},README.md}` | Centralized reminder mutation semantics, aligned the UI/tool channel contract on desktop notifications, and added shared coverage for the reminder owner layer |
| `plugins/sero-memory-plugin/extension/{phase1-migration-state.ts,index.ts,context-injector.ts,state-paths.ts,json-state.ts,log-writer.ts,logger.ts,prompt-debug.ts,memory-config.ts,automation-state.ts,transparency-state.ts,memory-tool-admin.ts}` | Removed duplicate phase-1 migration work and moved memory state/debug persistence onto shared async helpers |
| `plugins/sero-git-plugin/extension/{git-service.ts,__tests__/git-service.test.ts}` | Made `log` / `branches` repo-backed via the refresh path and added direct freshness coverage |
| `plugins/sero-context-plugin/extension/{context-projection.ts,index.ts,snapshot.ts}` | Extracted one shared projection owner for `context_log` and snapshot generation and removed the duplicate projection walkers |
| `plugins/sero-kanban-plugin/extension/{cleanup-warnings.ts,review-artifacts.ts,worktree-cleanup.ts,review-actions.ts,workflow-actions.ts,__tests__/{review-actions.test.ts,workflow-actions.test.ts}}` | Surfaced review/worktree cleanup failures in tool output and the Kanban error log instead of swallowing them |
| `plugins/sero-kanban-plugin/shared/settings-descriptor.ts` | New — canonical shared descriptor and update helpers for the truthful Kanban settings surface |
| `plugins/sero-kanban-plugin/extension/{index.ts,workflow-actions.ts,__tests__/workflow-actions.test.ts}` | Rebased tool help and settings mutation semantics on the shared settings descriptor, including runtime-backed `yoloAutoMergePrs` + read-only `autoAdvance` copy |
| `plugins/sero-kanban-plugin/ui/components/{CardDetail.tsx,CardDetailSections.tsx}` | Split the near-cap card detail panel into a thin shell plus focused content sections (466 → 196 lines) |
| `plugins/sero-kanban-plugin/ui/components/{DescriptionEditor.tsx,useDescriptionEditorState.ts}` | Extracted AI-enhance/edit state into a focused hook and slimmed the editor shell (405 → 304 lines) |
| `plugins/sero-kanban-plugin/ui/components/{ActivityPanel.tsx,ActivityPanelFeeds.tsx}` | Split the shared activity feed into a thin panel wrapper plus focused narrative/tool-feed renderers (393 → 189 lines) |
| `plugins/sero-kanban-plugin/ui/components/{SettingsPanel.tsx,SettingsPanel.test.tsx,CardDetailFooter.tsx}` | Aligned the human settings surface with the runtime descriptor, added direct UI coverage, and removed the stale priority callback API |
| `plugins/sero-kanban-plugin/ui/components/AddCardForm.tsx` | Deleted — dead duplicate add-card scaffold no longer shipped alongside `ColumnView` |
| `plugins/sero-kanban-plugin/vitest.config.ts` | Expanded package-local coverage to include direct UI tests |
| `plugins/sero-admin-plugin/ui/hooks/{host.ts,useProfiles.ts,useConfigFile.ts,useSessionFiles.ts,useBridgeRefresh.ts}` | New — split the admin host/config/profile/session/refresh seams into focused hooks and removed the near-cap `useSeroFiles.ts` hub |
| `plugins/sero-admin-plugin/ui/components/SessionDetail.tsx` | Reads the selected session file directly from cached metadata and surfaces malformed JSONL warnings instead of silently dropping corrupted lines (332 → 276 lines) |
| `plugins/sero-admin-plugin/ui/lib/{auth-refresh.ts,auth-refresh.test.ts,plugins.ts,plugins.test.ts,session-log.ts,session-log.test.ts}` | New — focused pure helpers/tests for auth refresh events, plugin-manager normalization, and truthful session-log parsing |
| `plugins/sero-admin-plugin/ui/components/{AgentEditor.tsx,ModelPanel.tsx}` | Reused one shared auth/focus/visibility refresh hook while preserving editor draft semantics |
| `plugins/sero-admin-plugin/ui/components/{ProviderCard.tsx,TierModelPicker.tsx}` | Deleted — dead provider-defaults scaffolding no longer ships alongside the global tier-based model panel |
| `plugins/sero-admin-plugin/shared/types.ts` | Removed stale session/log type leftovers from the pre-model-panel UI |
| `plugins/sero-git-plugin/extension/{git-service.ts,git-service-core.ts,git-service-query-actions.ts,git-service-mutation-actions.ts}` | Split the shared Git service into focused dispatcher/core/query/mutation modules while keeping the host entrypoints stable (`git-service.ts` 457 → 36 lines) |
| `plugins/sero-git-plugin/extension/{git-commands.ts,git-command-support.ts,git-log-queries.ts,git-status-queries.ts,git-diff-queries.ts}` | Split Git command parsing into focused query helpers and reduced the public barrel (`git-commands.ts` 457 → 24 lines) |
| `plugins/sero-git-plugin/ui/components/{BranchPanel.tsx,BranchPanelSections.tsx,BranchPanelRows.tsx}` | Split the near-cap branch/worktree/stash sidebar into focused UI modules (`BranchPanel.tsx` 421 → 190 lines) |
| `plugins/sero-git-plugin/{vitest.config.ts,shared/__tests__/bridge-contract.test.ts,ui/GitApp.test.tsx,ui/components/{BranchPanel.test.tsx,CommitDetail.test.tsx,StagingArea.test.tsx}}` | Expanded the Git package quality gate with direct UI interaction coverage plus a shared bridge-contract guard |
| `plugins/sero-web-plugin/extension/{gemini-web.ts,gemini-web-config.ts,gemini-web-email.ts,gemini-web-response.ts}` | Split Gemini Web config/email/response parsing into focused helpers and slimmed the entrypoint (`483 → 270 lines`) |
| `plugins/sero-web-plugin/extension/{gemini-search.ts,gemini-search-config.ts,gemini-search-format.ts}` | Split Gemini Search config/prompt formatting from provider orchestration (`361 → 271 lines`) |
| `plugins/sero-web-plugin/extension/{video-extract.ts,video-config.ts,video-gemini-files.ts}` | Split video file detection and Gemini Files API upload/polling helpers from the extractor shell (`394 → 193 lines`) |
| `plugins/sero-web-plugin/extension/{youtube-extract.ts,youtube-config.ts,youtube-media.ts}` | Split YouTube config/media helpers from fallback orchestration (`343 → 194 lines`) |
| `plugins/sero-web-plugin/extension/{rsc-extract.ts,rsc-chunks.ts,http-extract.ts,perplexity.ts,vendor.d.ts,tsconfig.json,__tests__/{gemini-web-email.test.ts,gemini-web-response.test.ts,gemini-search-format.test.ts,youtube-config.test.ts,rsc-extract.test.ts}}` | Split RSC chunk parsing, widened the package-local provider typecheck, and added direct helper coverage plus local vendor typings (`rsc-extract.ts` `338 → 279 lines`) |
| `plugins/sero-user-feedback-plugin/shared/{questionnaire-flow.ts,__tests__/questionnaire-flow.test.ts}` | New — centralized questionnaire answer/review/submit semantics and added focused parity coverage |
| `plugins/sero-user-feedback-plugin/extension/{tui-questionnaire.ts,tui-questionnaire-render.ts,interview-tool.ts,__tests__/{interview-tool.test.ts,permission-gate.test.ts}}` | Split TUI rendering from questionnaire state and added focused interview-result plus permission-gate coverage (`tui-questionnaire.ts` `416 → 303 lines`) |
| `plugins/sero-user-feedback-plugin/ui/{QuestionnaireForm.tsx,QuestionnaireForm.test.tsx,UserFeedbackApp.test.tsx,questionnaire/{QuestionnaireQuestionStep.tsx,QuestionnaireReviewStep.tsx},vitest.config.ts}` | Split the questionnaire UI into focused modules and added direct partial-submit + queue-hydration coverage (`QuestionnaireForm.tsx` `469 → 235 lines`) |
| `plugins/sero-cron-plugin/extension/{runtime.ts,tools.ts}` | New — extracted the cron singleton runtime/lifecycle owner plus tool registration surface from the entrypoint |
| `plugins/sero-cron-plugin/extension/index.ts` | Reduced to a thin cron composition root over the focused runtime/tool modules (485 → 48 lines) |
| `plugins/sero-cron-plugin/extension/{logger.ts,__tests__/logger.test.ts}` | Moved cron file logging onto a serialized async queue with visible failure warnings and added direct logger coverage |
| `plugins/sero-cron-plugin/ui/{CronApp.tsx,CronApp.test.tsx}` | Split the scheduler shell and added direct reminder-mutation/prompt coverage (`343 → 271 lines`) |
| `plugins/sero-cron-plugin/ui/components/{CronAppHeader.tsx,CronTabs.tsx,JobsTab.tsx}` | New — focused scheduler header/tab/jobs seams extracted from `CronApp` |
| `plugins/sero-cron-plugin/ui/widgets/{CronWidget.tsx,CronWidget.test.tsx}` | Hardened widget rendering for legacy state snapshots and added direct coverage |
| `plugins/sero-cron-plugin/vitest.config.ts` | Expanded the cron package test gate to include direct UI/widget tests |
| `plugins/sero-memory-plugin/{package.json,vitest.config.ts,extension/tsconfig.json}` | Added a package-local memory test harness while keeping runtime `tsc` focused on shipped extension sources |
| `plugins/sero-memory-plugin/extension/__tests__/{agent-dir,automation-state,context-injector,memory-tool,session-transcripts}.test.ts` | New — covers profile-scoped agent/QMD paths, malformed cron sync refusal, phase-1 migration state reuse, memory CRUD/capacity semantics, and transcript export stability |
| `docs/deslopify/apps/desktop/electron/types/{facts,plan}.md` | Recorded the confirmed no-op closeout for the narrow Pi SDK augmentation seam after re-validating the live source shape |
| `docs/deslopify/desktop-packages-plugins/{facts,plan}.md` | Advanced the Wave F tracker after the `apps/desktop/electron/types` no-op closeout; only `apps/desktop/electron/gateway` remains |
| `docs/deslopify/index.md` | Marked `apps/desktop/electron/types/` as a confirmed healthy closeout and narrowed the cross-cutting backlog to the final gateway no-op item |
| `docs/deslopify/apps/desktop/electron/gateway/{facts,plan}.md` | Recorded the confirmed generated-only no-op closeout for the `apps/desktop/electron/gateway/` tracker item after re-validating the live folder shape |
| `docs/deslopify/desktop-packages-plugins/{facts,plan}.md` | Closed the final tracked Wave F gateway no-op item and marked the cross-cutting execution map complete apart from deferred Low polish |
| `docs/deslopify/index.md` | Marked the cross-cutting baseline fully healthy and updated `apps/desktop/electron/gateway/` to its confirmed no-op closeout state |
| `apps/desktop/src/components/apps/explorer/{useExplorerRoots.ts,useExplorerEditorState.ts,useExplorerRuntimeEffects.ts}` | New — extracted root discovery, editor-state/bridge logic, and runtime wiring out of `ExplorerWorkspace` |
| `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` | Reduced to a thin explorer layout shell over the focused controller hooks (480 → 292 lines) |
| `apps/desktop/src/components/apps/explorer/useExplorerEditorState.test.tsx` | New — covers restored tabs, bridge-open requests, and path remap/delete behavior for the extracted editor-state owner |
| `docs/deslopify/apps/desktop/src/components/apps/explorer/{facts,plan}.md` | Recorded the ExplorerWorkspace controller split, post-fix metrics, and remaining explorer follow-up items |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/apps/explorer/` in progress with the first Medium item cleared |
| `apps/desktop/src/components/apps/explorer/editor/{editor-panel-shared.ts,useEditorDocumentState.ts,useEditorMonacoState.ts,useMonacoNavigation.ts,useEditorRuntimeSync.ts}` | New — split editor document ownership, Monaco/view-state wiring, cross-file navigation, and runtime refresh logic out of `EditorPanel` |
| `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx` | Reduced to a thin editor shell over the focused controller hooks (473 → 187 lines) |
| `apps/desktop/src/components/apps/explorer/editor/{useEditorDocumentState.test.tsx,useEditorRuntimeSync.test.tsx}` | New — covers editor save/navigation behavior plus filetree/VCS runtime reload semantics for the extracted hooks |
| `docs/deslopify/apps/desktop/src/components/apps/explorer/{facts,plan}.md` | Recorded the EditorPanel split, refreshed explorer metrics, and narrowed the remaining explorer backlog to FileTree/VCS follow-ups |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/apps/explorer/` in progress with the second Medium item cleared |
| `apps/desktop/src/components/apps/explorer/file-tree/{useFileTreeModel.ts,useFileTreeModel.test.tsx}` | New — extracted file-tree model ownership and focused coverage for lazy expansion plus expanded-directory refresh semantics |
| `apps/desktop/src/components/apps/explorer/file-tree/FileTree.tsx` | Reduced to a thin headless-tree render shell over `useFileTreeModel` (334 → 71 lines) |
| `apps/desktop/src/components/apps/explorer/{useTransientUiState.ts,useTransientUiState.test.tsx}` | New — shared transient notice/copy helper plus timer-reset coverage for explorer VCS/orchestration leaf feedback |
| `apps/desktop/src/components/apps/explorer/{orchestration/SubagentOutput.tsx,vcs/BookmarksSection.tsx,vcs/PullRequestSection.tsx,vcs/ChangeDetail.tsx,vcs/ChangeDetail.test.tsx}` | Reused shared transient feedback, moved PR preview onto `useDebouncedCallback`, and surfaced change-detail load failures with focused coverage |
| `docs/deslopify/apps/desktop/src/components/apps/explorer/{facts,plan}.md` | Recorded the FileTree + transient-UI closeout, refreshed explorer metrics, and left only the Low absorb-control follow-up |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/apps/explorer/` healthy with all Medium items cleared |
| `apps/desktop/src/components/apps/explorer/vcs/WorkingCopySection.tsx` | Removed the dead absorb control from the working-copy actions row (136 → 124 lines) |
| `apps/desktop/src/components/apps/explorer/vcs/WorkingCopySection.test.tsx` | New — focused coverage that checkpoint creation still works and the dead absorb affordance stays absent |
| `docs/deslopify/apps/desktop/src/components/apps/explorer/{facts,plan}.md` | Closed the final Low explorer follow-up, refreshed metrics, and marked the folder plan fully executed |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/apps/explorer/` fully executed |
| `apps/desktop/src/components/layout/git-remote/{workflow.ts,workflow.test.ts}` | New — shared Git remote runtime workflow plus focused fallback/origin-update/origin-parse coverage |
| `apps/desktop/src/components/layout/{RemoteOriginManager.tsx,remote-origin-views.tsx}` | Rebased the workspace remote-origin dialog on the shared Git remote workflow and unified repo-name/origin parsing behavior (`remote-origin-views.tsx` 438 → 392 lines) |
| `apps/desktop/src/components/layout/titlebar/GitRemotePublishSection.tsx` | Rebased the titlebar publish flow on the shared Git remote workflow while preserving ship-deck UI copy (323 → 293 lines) |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the shared Git remote workflow closeout, refreshed layout metrics, and narrowed the remaining layout backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the shared Git remote workflow item cleared |
| `apps/desktop/src/components/layout/WorkspaceTree.tsx` | Reduced to a thin workspace-tree shell over extracted runtime/node/dialog modules (445 → 77 lines) |
| `apps/desktop/src/components/layout/workspace-tree/{useWorkspaceTreeRuntime.ts,WorkspaceNode.tsx,WorkspaceBulkDeleteDialog.tsx}` | New — extracted workspace-tree runtime ownership, per-workspace actions/rendering, and bulk-delete confirmation UI |
| `apps/desktop/src/components/layout/workspace-tree/useWorkspaceTreeRuntime.test.tsx` | New — covers workspace refresh, Escape clear-selection, and federated `sero:open-session` wiring |
| `docs/deslopify/apps/desktop/src/components/layout/{facts,plan}.md` | Recorded the WorkspaceTree split, refreshed layout metrics, and narrowed the remaining near-cap backlog |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/components/layout/` in progress with the WorkspaceTree split cleared |
| `apps/desktop/src/types/collaboration.ts` | Aligned the debate `maxRounds` inline default comment with `DEFAULT_DEBATE_CONFIG.maxRounds = 1` to close the remaining Low comment/default drift follow-up |
| `docs/deslopify/apps/desktop/src/types/{facts,plan}.md` | Recorded the Low comment/default drift closeout, refreshed type-folder metrics, and left only user-feedback revalidation outstanding |
| `docs/deslopify/index.md` | Updated `apps/desktop/src/types/` progress text with the Low comment/default item cleared |
| `apps/desktop/src/types/user-feedback.ts` | Clarified ownership comments: desktop keeps response-feedback persistence types while user-feedback transport contracts remain canonical in `@sero/common` |
| `docs/deslopify/apps/desktop/src/types/{facts,plan}.md` | Recorded the user-feedback duplication revalidation closeout, refreshed type-folder metrics, and marked the follow-up backlog clear |
| `docs/deslopify/index.md` | Marked `apps/desktop/src/types/` healthy after the user-feedback revalidation follow-up |
| `apps/desktop/electron/features/auth/github/auth-manager.ts` | GitHub device-flow polling now fails fast on transport/non-JSON/unexpected non-2xx token responses while preserving retry for `authorization_pending` and `slow_down` |
| `apps/desktop/electron/__tests__/features/auth/github/auth-manager.test.ts` | Added focused polling regressions for terminal non-2xx failures, non-2xx `authorization_pending` retry, and transport-failure handling |
| `docs/deslopify/apps/desktop/electron/features/auth/{facts,plan}.md` | Recorded the GitHub polling Medium-item closeout, refreshed auth-folder post-fix metrics, and narrowed outstanding work to GoogleAuthManager + Low helper/guidance follow-ups |
| `docs/deslopify/index.md` | Updated `apps/desktop/electron/features/auth/` status to reflect the cleared GitHub polling Medium item |

---

## 2026-04-13

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/apps/useAppRuntimeMount.ts` | New — shared app/widget mount helper for session bootstrap, context assembly, and workspace mount-state gating |
| `apps/desktop/src/components/apps/SeroAppMount.tsx` | Replaced duplicated mount orchestration with the shared runtime helper (170 → 68 lines) |
| `apps/desktop/src/components/apps/dashboard/WidgetMount.tsx` | Replaced duplicated widget mount orchestration with the shared runtime helper and aligned workspace-loading semantics (161 → 81 lines) |
| `apps/desktop/src/components/apps/dashboard/Dashboard.test.tsx` | New — covers empty dashboard, mounted grid rendering, and persist-on-interaction-stop behavior |
| `apps/desktop/src/components/apps/dashboard/WidgetMount.test.tsx` | New — covers hydration, missing-workspace, runtime fallback, and missing-remote fallback states |
| `packages/app-runtime/src/{context.ts,widget-registry.ts,sero-bridge.ts}` | Replaced boundary `any`/cast patterns with typed globals and runtime-guarded bridge access |
| `apps/desktop/electron/cli/core/bridge-context.ts` | New — typed live/fallback ExtensionContext builders for bridged tools and slash commands |
| `apps/desktop/electron/cli/core/schema-bridge.ts` | Replaced schema/command-context `any` walking with typed helpers and extracted bridge-context support (403 → 427 lines) |
| `apps/desktop/electron/cli/core/tool.ts` | Replaced the bridged tool-update cast with a typed adapter (474 → 494 lines) |
| `apps/desktop/electron/cli/lib/gog-runner.ts` | Replaced `execFile` failure `any` casts with typed ENOENT/exit-code helpers |
| `packages/common/src/kanban.ts` | New — canonical shared Kanban card/state/validation contract for host + plugin |
| `packages/common/src/index.ts` | Exported the canonical Kanban contract from `@sero/common` |
| `apps/desktop/electron/features/kanban/core/types.ts` | Replaced duplicated host Kanban model with a thin `@sero/common` barrel (129 → 21 lines) |
| `apps/desktop/electron/features/kanban/{core/contracts.ts,core/state-helpers.ts,implementation/implementation-executor.ts}` | Switched host Kanban runtime to canonical shared validation/default-state helpers |
| `plugins/sero-kanban-plugin/shared/{types.ts,validation.ts}` | Replaced duplicated shared contract files with thin `@sero/common` re-exports (217 → 67 lines; 139 → 16 lines) |
| `plugins/sero-kanban-plugin/extension/{index.ts,state-io.ts,workflow-actions.ts}` | Narrowed the Kanban settings surface to runtime-backed fields and switched fallback state reads to the canonical factory |
| `apps/desktop/electron/__tests__/features/kanban/{auto-merge-monitor,contracts,implementation-executor,light-review-workflow,light-review,review-executor}.test.ts` | Updated Kanban settings fixtures to the narrowed shared contract |
| `plugins/sero-kanban-plugin/extension/__tests__/{review-actions,workflow-actions}.test.ts` | Updated Kanban extension tests and added coverage for the narrowed settings surface |
| `plugins/sero-kanban-plugin/extension/{state-io.ts,error-log.ts,index.ts}` | Hardened board/error-log reads to fail closed on malformed JSON and return recovery-oriented tool errors; added persisted-state tests |
| `plugins/sero-cron-plugin/extension/{state-io.ts,index.ts,runtime-helpers.ts}` | Hardened scheduler state reads, surfaced unreadable-state errors to tools/commands, and kept `extension/index.ts` at the 500-LOC cap by extracting runtime helpers |
| `plugins/sero-cron-plugin/extension/__tests__/state-io.test.ts` | Updated state-I/O coverage to assert fail-closed malformed-state behavior |
| `plugins/sero-memory-plugin/extension/{automation-state.ts,memory-tool-admin.ts}` | Stopped auto-consolidation from rewriting malformed cron state and surfaced a recovery-oriented admin/tool error instead |
| `plugins/sero-git-plugin/extension/{state-io.ts,__tests__/state-io.test.ts}` | Hardened Git app state reads to fail closed on malformed snapshots and added direct state-I/O coverage |
| `plugins/sero-web-plugin/extension/state-sync.ts` | Hardened workspace web state reads to fail closed on malformed JSON while preserving missing-file bootstrap behavior |
| `packages/common/src/{git-app.ts,cron-contract.ts,admin-bridge.ts,index.ts}` | New — neutral shared owners for Git app contracts, cross-plugin cron persistence types, and admin/web host bridge subsets |
| `packages/app-runtime/src/sero-bridge.ts` | Switched app-runtime’s Git bridge contract to the new canonical `@sero/common` types |
| `apps/desktop/{src/types/electron-apps.d.ts,electron/preload/apps/app-domain.ts,electron/ipc/apps/git-app.ts,electron/features/apps/git-app/manager.ts}` | Repointed the Git app bridge to one canonical shared contract across renderer, preload, IPC, and host manager |
| `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts` | Replaced the plugin-local `window.sero` contract copy with a canonical `@sero/common` admin bridge subset (473 → 259 lines) |
| `plugins/sero-cron-plugin/shared/types.ts` | Rebased the cron plugin’s persisted state contract on the new neutral shared cron contract |
| `plugins/sero-memory-plugin/extension/cron-types.ts` | Replaced the mirrored cron persisted types with canonical `@sero/common` imports |
| `plugins/sero-git-plugin/{shared/types.ts,ui/GitApp.tsx}` | Switched Git UI/shared types to the canonical shared bridge contract and removed the UI-side result cast |
| `plugins/sero-web-plugin/ui/lib/host.ts` | Replaced the local host bridge subset with canonical shared host-bridge typing |
| `{packages/app-runtime/tsconfig.json,packages/tsconfig.extension.json,plugins/sero-{kanban,context,cron,git,user-feedback,web}-plugin/ui/tsconfig.json}` | Added `@sero/common` path mappings so packages that compile against workspace source keep the new shared contracts type-safe |
| `packages/common/src/{web-app.ts,index.ts,admin-bridge.ts}` | New/updated — canonical web app action contract plus shared host-bridge exposure for deterministic web UI mutations |
| `packages/app-runtime/src/sero-bridge.ts` | Extended the typed preload bridge with the optional `webApp` action surface |
| `apps/desktop/{src/types/electron-apps.d.ts,src/types/electron.d.ts,src/types/ipc-channels.ts,electron/preload/apps/app-domain.ts,electron/preload/api.ts,electron/ipc/index.ts,electron/ipc/apps/web-app.ts,electron/features/apps/web-app/manager.ts}` | Added the canonical `webApp` bridge so Web UI history/bookmark/download mutations route through one host-owned action layer |
| `apps/desktop/electron/__tests__/features/apps/web-app-manager.test.ts` | New — covers clear-history, download deletion, and workspace-boundary validation for the new Web action bridge |
| `plugins/sero-web-plugin/ui/{lib/web-actions.ts,components/SearchHistory.tsx,components/BookmarkList.tsx,components/DownloadsList.tsx}` | Replaced direct `useAppState()` mutations with explicit host-backed Web app actions |
| `plugins/sero-context-plugin/{README.md,extension/index.ts,ui/ContextApp.tsx,ui/components/ContextTimeline.tsx}` | Reworded Context refresh/tag/checkout affordances as prompt-routed agent requests and removed the stale “real time” claim |
| `plugins/sero-memory-plugin/extension/{agent-dir.ts,qmd.ts,session-transcripts.ts}` | New/shared agent-dir resolver for profile-scoped transcript + QMD ownership; removed the `~/.pi/agent` fallback drift |
| `plugins/sero-web-plugin/extension/{paths.ts,exa.ts}` | Switched Web config/usage resolution to a Sero-first profile-scoped home with legacy read fallback |
| `plugins/sero-cron-plugin/extension/{index.ts,recovery-runtime.ts}` | Moved startup recovery ahead of scheduler ticking so missed jobs/reminders update state once before normal processing |
| `plugins/sero-cron-plugin/extension/__tests__/recovery-runtime.test.ts` | New — covers pre-start reminder recovery state updates and missed-job bootstrap planning |
| `plugins/sero-context-plugin/extension/{index.ts,snapshot.ts}` | Added automatic snapshot refresh on session entry + agent end and tightened extension typing around nullable context usage |
| `plugins/sero-user-feedback-plugin/{ui/UserFeedbackApp.tsx,ui/sero.d.ts,extension/tui-questionnaire.ts}` | Removed onboarding ownership from the plugin UI and aligned Pi TUI questionnaire submission with Sero’s partial-answer contract |
| `apps/desktop/src/user-feedback-app.test.tsx` | Added coverage that generic questionnaire submission no longer marks onboarding complete |

---

## 2026-04-12

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/electron/features/editor/lsp/lsp-manager.ts` | Added in-flight startup deduping so repeated `startServer()` calls share one workspace/language boot |
| `apps/desktop/electron/features/editor/lsp/lsp-process.ts` | Replaced protocol-boundary `any` reads with explicit initialize/configuration/error helpers |
| `apps/desktop/src/lsp/use-lsp.ts` | Replaced inline Monaco type import with a top-level namespace type import |
| `apps/desktop/electron/features/profile/manager.ts` | Hardened `profiles.json` parsing — malformed registries now fail closed instead of looking like first run |
| `apps/desktop/electron/features/auth/github/auth-manager.ts` | Removed base64-only GitHub token persistence fallback; secure storage is now required |
| `apps/desktop/electron/features/vcs/core/git-runner.ts` | Replaced `any`-typed exec failure handling with a shared typed normalizer |
| `apps/desktop/electron/features/subagent/core/tracker.ts` | Added parent-session bulk-abort tracker updates |
| `apps/desktop/electron/features/subagent/index.ts` | `abortAll()` now updates tracker state before aborting pool controllers |
| `apps/desktop/electron/features/subagent/runtime/runner.ts` | Removed `createAgentSession()` cast and `session!` assertion from the subagent runtime |
| `apps/desktop/electron/types/pi-coding-agent.d.ts` | New — local Pi SDK module augmentation for typed `systemPromptSuffix` support |
| `apps/desktop/electron/features/gateway/server/access-control.ts` | New — shared workspace/session/artifact authorization helpers for gateway requests |
| `apps/desktop/electron/features/gateway/bridge/web-tokens.ts` | Web tokens now support both explicit workspace scopes and unrestricted owner-wide scope (`workspaceIds: null`) while validating to token records instead of booleans |
| `apps/desktop/electron/features/gateway/security/auth.ts` | Gateway auth now returns master-vs-web auth results with optional unrestricted workspace access for owner web tokens |
| `apps/desktop/electron/features/gateway/index.ts` | Enforced scoped client access in connection state and filtered session-scoped push/broadcast events |
| `apps/desktop/electron/features/gateway/server/request-handler.ts` | Added workspace/session authorization checks for core gateway routes |
| `apps/desktop/electron/features/gateway/server/extended-handlers.ts` | Added workspace/session/artifact authorization checks for file/history/web-token routes |
| `apps/desktop/electron/features/gateway/server/protocol.ts` | Extended `create_web_token` request shape with explicit `workspaceIds` |
| `apps/desktop/electron/ipc/gateway/gateway-ops.ts` | `openSession()` now rejects workspace/session mismatches instead of silently reopening cross-workspace sessions |
| `apps/desktop/electron/ipc/gateway/gateway.ts` | QR/web-token IPC now supports unrestricted owner tokens and `Connect Device` mints profile-wide QR pairings |
| `apps/desktop/electron/preload/platform/host-services.ts` | Updated gateway bridge for owner-wide QR login generation (no workspace ID parameter) |
| `apps/desktop/src/types/electron-services.d.ts` | Updated renderer gateway API contract for profile-wide QR login generation |
| `apps/desktop/src/components/layout/ConnectDeviceDialog.tsx` | QR pairing now grants profile-wide remote access across current and future workspaces and explains that in the dialog |
| `apps/desktop/electron/__tests__/features/gateway/gateway-owner-token.test.ts` | New — focused owner-token regression coverage for all-workspaces access, future-workspace visibility, and master-only route separation |
| `apps/desktop/electron/features/gateway/channels/discord.ts` | Fixed `/sero abort` so it actually aborts the active session and reports failures |
| `apps/desktop/electron/preload/api.ts` | Split aggregate preload bridge into a thin composer (485 → 88 lines) |
| `apps/desktop/electron/preload/api/core.ts` | New — extracted shell/profile/workspace/session/agent/context-preset preload bridges |
| `apps/desktop/electron/preload/api/workbench.ts` | New — extracted VCS/terminal/editor/filetree preload bridges |
| `apps/desktop/electron/preload/agent/{local-models,models,prompts,skills,subagent}.ts` | Switched `IpcChannels` imports to `@/types/ipc-channels` |
| `apps/desktop/electron/preload/{apps/app-domain.ts,collaboration/index.ts,editor/debug-lsp.ts,integrations/google-imagegen.ts,integrations/plugins.ts,onboarding.ts,platform/host-services.ts,platform/user-feedback.ts}` | Switched `IpcChannels` imports to `@/types/ipc-channels` |
| `apps/desktop/src/hooks/useSessionAgent.ts` | Reduced to a thin composition wrapper over focused session-agent hooks (140 → 23 lines) |
| `apps/desktop/src/hooks/session-agent/useActiveSessionSync.ts` | New — owns active-session open/focus + collaboration hydration |
| `apps/desktop/src/hooks/session-agent/useContainerEnsureOnSessionFocus.ts` | New — owns container ensure flow for focused container-backed workspaces |
| `apps/desktop/src/hooks/session-agent/useSessionListRefreshOnAgentIdle.ts` | New — debounces bursty idle-triggered session-list refreshes |
| `apps/desktop/src/hooks/useWorkspaceFiles.ts` | Added bounded workspace-file cache eviction and stale-entry clearing on load failure (169 → 214 lines) |
| `apps/desktop/src/stores/agent.ts` | Deduplicated optimistic user-message enqueue and wired explicit buffer cleanup into open/close failure paths (495 → 461 lines) |
| `apps/desktop/src/stores/agent-utils.ts` | Added shared `appendOptimisticUserMessage()` + `clearAgentSessionBuffers()` helpers for renderer agent session cleanup (277 → 378 lines) |
| `apps/desktop/src/types/profile.ts` | New — canonical shared `ProfileInfo` contract for renderer + main-process profile flows |
| `apps/desktop/src/types/widget-manifest.ts` | New — shared widget manifest contract used by dashboard + app manifests |
| `apps/desktop/src/types/ipc.ts` | Switched profile contract ownership to `src/types/profile.ts`; kept `ipc.ts` as a thinner compatibility barrel (485 → 466 lines) |
| `apps/desktop/src/types/plugins.ts` | Broke the `ipc.ts` ↔ `plugins.ts` type-only cycle by importing `SeroAppManifest` directly from `sero-apps.ts` |
| `apps/desktop/src/types/sero-apps.ts` | Reused shared widget manifest contract instead of duplicating `SeroWidgetManifest` |
| `apps/desktop/src/types/dashboard.ts` | Reused shared widget manifest contract instead of maintaining a parallel `WidgetManifest` copy |
| `apps/desktop/electron/features/profile/types.ts` | Re-exported canonical `ProfileInfo` instead of maintaining a duplicated `KEEP IN SYNC` contract |
| `apps/desktop/electron/features/profile/manager.ts` | Added duplicate/overlap validation for custom profile roots while preserving managed `~/.sero-ui/profiles/*` child profiles (317 → 366 lines) |
| `apps/desktop/electron/ipc/workspace/profiles.ts` | Switched profile IPC handlers to the canonical shared `ProfileInfo` contract |
| `apps/desktop/electron/__tests__/features/profile/manager.test.ts` | New — covers allowed managed child profiles plus duplicate/overlap path rejection |
| `apps/desktop/electron/shared/infra/shared-infra.ts` | Added `refreshInfraModelSelection()` so cached default model selection updates after auth/model refreshes |
| `apps/desktop/electron/ipc/platform/auth/auth.ts` | Auth mutation paths now refresh both the model registry and cached shared default model |
| `apps/desktop/electron/features/workspace/manager.ts` | Centralized editor-state cleanup and now warn on non-ENOENT remove/close cleanup failures instead of swallowing them |

---

## 2026-04-06

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/layout/ToolCallState.tsx` | New — pure state helpers extracted from ToolCallHelpers (mapToolState, deriveGroupStatus, groupStatusIcon, groupStatusLabel, toolStatusDot, extractToolSummary, getCollapsedToolSummary) |
| `apps/desktop/src/components/layout/ToolCallHelpers.tsx` | Removed state helpers (now in ToolCallState); re-exports them for backward compat; only imports ChevronRight from lucide-react (477 → 310 lines) |
| `apps/desktop/src/components/layout/CollaborationFeedItems.tsx` | New — sub-components extracted from CollaborationActivityPanel (TypingDots, TypingBubble, MessageBubble, DebateRoundBubble, PhaseBanner, ElapsedTimer, OnlineRoster, useAutoScroll) |
| `apps/desktop/src/components/layout/CollaborationActivityPanel.tsx` | Now imports sub-components from CollaborationFeedItems; reduced from 470 → 120 lines |
| `apps/desktop/src/stores/workspace.ts` | Replaced hand-rolled `expandedSaveTimer + setTimeout` with `createDebouncedFn` from `useDebouncedCallback` |
| `apps/desktop/src/App.tsx` | Replaced shared `persistTimerRef + setTimeout` in two resize handlers with `useDebouncedCallback` (`persistMainSidebarSize`, `persistChatPanelSize`) |

---

## 2026-04-05

### Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/lsp/lsp-conversions.ts` | Removed `undefined as unknown as string` casts — `convertDocumentation` return type now includes `\| undefined` |
| `apps/desktop/src/components/layout/WorkspaceTree.tsx` | `handleNewSession`, `handleToggleContainer`, `handleClose` accept `React.MouseEvent \| React.KeyboardEvent` — 3 `as unknown as React.MouseEvent` casts removed |
| `apps/desktop/src/components/layout/AuthLoginDialog.tsx` | Replaced 3 `setTimeout(() => focus(), 50)` timing hacks with a single `useEffect` watching `phase` |
| `apps/desktop/src/components/layout/SessionBadge.tsx` | Replaced `setTimeout(fetchAll, 300/500)` pseudo-polling with direct `void fetchAll()` calls |
| `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` | Extracted duplicated `requestAnimationFrame` panel-sync pattern into `usePanelOpenSync` hook (494 → 451 lines) |
| `apps/desktop/src/components/apps/explorer/usePanelOpenSync.ts` | New hook — syncs a resizable panel's open/collapse state with a boolean flag via rAF |
| `packages/ui/src/components/ai-elements/prompt-input.tsx` | Split 1,341-line file into focused modules (see below). Now 410 lines (core component + barrel re-exports) |
| `packages/ui/src/components/ai-elements/prompt-input-context.tsx` | New — contexts, hooks, `PromptInputProvider`, `PromptInputActionAddAttachments` (252 lines) |
| `packages/ui/src/components/ai-elements/prompt-input-textarea.tsx` | New — `PromptInputTextarea` (117 lines) |
| `packages/ui/src/components/ai-elements/prompt-input-elements.tsx` | New — all thin wrapper components: Body, Header, Footer, Tools, Button, ActionMenu, Submit, Select, HoverCard, Tabs, Command (371 lines) |
