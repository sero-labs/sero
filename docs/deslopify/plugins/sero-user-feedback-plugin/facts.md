# Facts — plugins/sero-user-feedback-plugin

_Last reviewed: 2026-04-13_

## What this code does
`plugins/sero-user-feedback-plugin/` is Sero’s foundational agent↔user interaction plugin. The extension registers the `question`, `questionnaire`, and `interview` tools plus a bash permission gate, choosing between a Sero IPC bridge and Pi CLI TUI renderers at runtime. The federated `UserFeedbackApp` remote is the dedicated Sero surface for queued questionnaires and interviews, while the same shared payload types also feed the host-side chat-panel/store flow.

## Shape & metrics
- Total files: 20 source/config files (generated `dist/`, `node_modules/`, `.turbo/`, and `.__mf__temp/` excluded)
- Largest file: `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx` (469 LOC)
- Files over 500 LOC: none
- Near-cap / hotspot files: `ui/QuestionnaireForm.tsx` (469), `extension/tui-questionnaire.ts` (416), `extension/index.ts` (339)
- External dependencies of note: Pi SDK + `@mariozechner/pi-tui`, `@sinclair/typebox`, React, `@sero-ai/app-runtime`, `@sero-ai/ui`, `lucide-react`
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
