# Facts — plugins/sero-user-feedback-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-user-feedback-plugin/` is Sero’s foundational agent↔user interaction plugin. The extension registers the `question`, `questionnaire`, and `interview` tools plus a bash permission gate, choosing between a Sero IPC bridge and Pi CLI TUI renderers at runtime. The federated `UserFeedbackApp` remote is the dedicated Sero surface for queued questionnaires and interviews, while the same shared payload types also feed the host-side chat-panel/store flow.

## Shape & metrics
- Total files: 20 source/config files (generated `dist/`, `node_modules/`, `.turbo/`, and `.__mf__temp/` excluded)
- Largest file: `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx` (469 LOC)
- Files over 500 LOC: none
- Near-cap / hotspot files: `ui/QuestionnaireForm.tsx` (469), `extension/tui-questionnaire.ts` (416), `extension/index.ts` (339)
- External dependencies of note: Pi SDK + `@earendil-works/pi-tui`, `@sinclair/typebox`, React, `@sero-ai/app-runtime`, `@sero-ai/ui`, `lucide-react`
- Upstream callers: Pi session resource loading loads `extension/index.ts`; Sero app/plugin discovery loads `UserFeedbackApp` via the manifest remote; desktop tests import the plugin UI/types directly
- Downstream dependencies: `window.sero.userFeedback` + `window.sero.profiles` preload bridges, `apps/desktop/electron/ipc/platform/ui/user-feedback-questions.ts`, `apps/desktop/electron/shared/lib/user-feedback-bus.ts`, `apps/desktop/src/types/user-feedback.ts`, renderer user-feedback store/notice flows

## Architectural notes
- This plugin is not just another optional app; the plugin-system technical guide treats it as a core communication primitive, so cross-front-end behavior drift matters more here than in a purely local utility plugin.
- Runtime ownership is split across three surfaces: the extension owns tool semantics, Electron owns the bus + IPC bridge, and the remote UI owns only the Sero presentation layer. When any of those layers diverge, the same `questionnaire` or `interview` call behaves differently depending on where it lands.
- The package still mirrors shared transport contracts and bridge plumbing with the desktop host instead of importing one canonical source. Related drift has already been documented in `docs/deslopify/apps/desktop/src/types/plan.md` and `docs/deslopify/apps/desktop/electron/shared/plan.md`.
- Production remote config is correct: `vite.config.ts` uses `base: './'` in production, and the package intentionally keeps `bridgeTools: false` because these interactive tools should remain standalone rather than be routed through `sero-cli`.
- The package-local `typecheck` script only checks the UI tsconfig; extension and shared modules currently rely on broader repo checks rather than package-local enforcement.

## Runtime-sensitive surfaces
- Questionnaire semantics must stay aligned between Pi CLI TUI and the Sero remote UI: skip behavior, submit requirements, exclusive multi-select handling, and custom-answer rules all change what the agent learns from the user.
- The answer-clearing path depends on the preload bridge firing a synchronous `sero:user-feedback:answered` DOM event before the IPC round-trip completes.
- The permission gate is a runtime safety seam: dangerous bash prompts auto-time out after 30 seconds, while workspace-scoped recursive deletes are intentionally auto-allowed.
- The shared event-bus singleton key must stay aligned with the Electron host bridge until the duplication is removed.
- Profile/onboarding state is currently entangled with the plugin UI, so seemingly local cleanup in the remote can alter first-run profile behavior.

## Surprising discoveries
- The generic `UserFeedbackApp` remote reaches directly into `window.sero.profiles` to decide whether onboarding is in progress and to mark onboarding complete after any successful submission.
- The Sero questionnaire UI allows partial submissions (`Skip` + `Submit All Answers`), while the Pi CLI TUI blocks submission until every question is answered.
- There are no package-local tests. The only coverage touching this plugin today lives in host-side app tests and only exercises queue ordering plus a small slice of questionnaire submission behavior.
- The package-local quality gate misses the extension entirely even though the extension owns the permission gate, the IPC bridge, and all Pi CLI behavior.

## Post-fix snapshot — 2026-04-14 (D4)

### Metrics after fixes
- Largest file: `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx` (469 LOC)
- Files over 500 LOC: none
- Targeted validation: UI typecheck, extension tsconfig compile, desktop app tests, and monorepo `pnpm typecheck` all pass

### What changed
- Removed profile/onboarding ownership from `UserFeedbackApp`; the remote now depends only on `window.sero.userFeedback` again.
- Deleted the plugin-local `profiles` bridge subset from `ui/sero.d.ts`.
- Aligned Pi CLI questionnaire submission with Sero’s partial-answer contract by allowing submit once at least one answer exists.
- Added desktop test coverage asserting that generic questionnaire submission no longer marks onboarding complete.

### Still outstanding
- High items are cleared for this plan.
- Medium canonical transport/bus ownership, package-local test expansion, and questionnaire file-splitting work remain pending.

## Post-fix snapshot — 2026-04-14 (E3)

### Metrics after fixes
- Total files: 21 source/config files in the current scan
- Largest file: `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx` (469 LOC)
- Files over 500 LOC: none
- Targeted validation: package-local UI + extension typecheck, package-local IPC-bridge tests, targeted desktop user-feedback tests, and monorepo `pnpm typecheck` all pass

### What changed
- Promoted the shared user-feedback question/answer payloads, bus key, and event names into `@sero-ai/common` so plugin + host contract drift becomes a typecheck failure.
- Rebased the plugin’s shared transport aliases, bus singleton wrappers, desktop host types, and Electron bus bridge on those canonical shared contracts.
- Replaced the plugin-local `window.sero.userFeedback` subset with the canonical shared bridge type and added a package-local extension test for the IPC bridge handshake/cancel flow.
- Expanded the package-local quality gate so both `ui/` and `extension/` compile inside the plugin package.

### Still outstanding
- Broader package-local regression coverage for questionnaire/interview state machines and permission-gate behavior is still pending.
- The larger questionnaire/TUI file split and shared questionnaire-flow extraction are still pending.

## Post-fix snapshot — 2026-04-14 (E5)

### Metrics after fixes
- Total files: 31 source/config files in the current scan
- Largest file: `plugins/sero-user-feedback-plugin/extension/index.ts` (339 LOC)
- Files over 500 LOC: none
- Type escape hatches remaining: none found via `rg "@ts-ignore|@ts-expect-error|as any|as unknown as" plugins/sero-user-feedback-plugin`
- Targeted validation: package-local `typecheck` + `test`, monorepo `pnpm typecheck`, and `cd apps/desktop && pnpm test` all pass

### What changed
- Extracted one shared questionnaire-flow owner for answer insertion/removal, exclusive-option handling, custom-answer merging, review formatting, and submit eligibility so the Sero UI and Pi TUI consume the same core rules.
- Split the questionnaire UI into a thin container plus focused review/question-step modules and split the Pi TUI renderer into state + render helpers, pulling both previous hotspot files well below the cap.
- Added package-local regression coverage for questionnaire flow parity, interview result aggregation/cancel behavior, permission-gate timeout plus workspace-delete exemptions, direct `QuestionnaireForm` partial-submit behavior, and `UserFeedbackApp` queue hydration/clear behavior.

### Still outstanding
- Only the Low bridge-failure visibility item remains for this plugin.
