# Refactoring Plan — plugins/sero-user-feedback-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-user-feedback-plugin/` is strategically small but load-bearing: it is Sero’s primary user-interaction primitive for questions, questionnaires, interviews, and dangerous-command approvals. Pi CLI compatibility is still useful, but it is explicitly secondary to getting the Sero path correct. The current debt is not aesthetic — it is truthfulness and boundary ownership. The same questionnaire behaves differently in Sero vs Pi CLI, the remote UI reaches into profile onboarding state that it should not own, and the core transport/bus contracts are still mirrored across plugin and host layers. The right outcome is one Sero-first feedback contract, one canonical questionnaire state model, and a plugin UI that is generic again instead of owning shell/profile workflow decisions.

## Issues Found (prioritized)
- **High** — `questionnaire` semantics diverge between the Sero UI and Pi CLI TUI — `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx:243-263` gives the user an explicit `Skip` path and `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx:439-441` allows submission whenever there is at least one answer, but `plugins/sero-user-feedback-plugin/extension/tui-questionnaire.ts:97-109`, `plugins/sero-user-feedback-plugin/extension/tui-questionnaire.ts:230-233`, and `plugins/sero-user-feedback-plugin/extension/tui-questionnaire.ts:410-414` only submit when **all** questions are answered. Sero is the priority product path here: the fix should optimize for a truthful, polished Sero experience first, and only preserve Pi CLI compatibility where it does not fight that goal. Effort: **M**.
- **High** — The generic feedback plugin owns profile onboarding lifecycle that belongs to the host — `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:84-91` calls `window.sero.profiles.markOnboardingDone()` after every successful submission, `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:119-183` polls `needsOnboarding()` and renders product-specific onboarding copy, and `plugins/sero-user-feedback-plugin/ui/sero.d.ts:20-30` bakes the profiles bridge into the remote type surface. That violates the shell/plugin ownership split in AD-001 and means ordinary questionnaires can mutate profile setup state. Effort: **M**.
- **Medium** — User-feedback transport and bridge contracts are still mirrored across plugin and host layers — `plugins/sero-user-feedback-plugin/shared/types.ts:10-80` duplicates the desktop contract in `apps/desktop/src/types/user-feedback.ts:27-57`, `plugins/sero-user-feedback-plugin/ui/sero.d.ts:13-30` narrows a local subset of the host bridge instead of importing a canonical declaration, and `plugins/sero-user-feedback-plugin/shared/emitter.ts:9-20` mirrors `apps/desktop/electron/shared/lib/user-feedback-bus.ts:11-20`. This keeps a core runtime primitive on manual “keep in sync” discipline and matches the drift already flagged in the desktop type/shared reviews. Effort: **M**.
- **Medium** — The package-local quality gate misses the extension/TUI risk surface — `plugins/sero-user-feedback-plugin/package.json:8-11` runs `tsc --noEmit -p ui/tsconfig.json` only, the package has no local `*.test.*` files, and the current host-side coverage only exercises queue ordering plus questionnaire submission in `apps/desktop/src/user-feedback-app.test.tsx:193-246`. Interview flow, permission-gate approval behavior, questionnaire parity, and onboarding coupling can all regress without a package-level signal. Effort: **M**.
- **Medium** — Questionnaire flow logic is duplicated across two large state machines that are already near the size cap — `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx:27-469` and `plugins/sero-user-feedback-plugin/extension/tui-questionnaire.ts:21-416` both implement answer storage, custom-answer editing, exclusive multi-select rules, review handling, and navigation independently. The Sero-vs-TUI semantic drift is already one visible consequence. Effort: **L**.
- **Low** — The remote UI swallows bridge/profile failures instead of surfacing them — `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:49-52`, `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:90`, and `plugins/sero-user-feedback-plugin/ui/UserFeedbackApp.tsx:126-128` turn preload/profile failures into silent fallbacks. That keeps the UI calm, but it also removes the debugging signal when the bridge or onboarding flow breaks. Effort: **S**.

## Proposed Refactoring
1. **~~Pick one truthful questionnaire completion contract with Sero as the source of truth.~~ ✅ 2026-04-14 (`aa301f95`)**
   - Decide explicitly whether skipped questions are allowed.
   - Based on the current Sero UI (`Skip`, `Review`, `Skipped` labels), the likely canonical rule is: *partial answers are valid, unanswered questions remain omitted, and the result still returns the answered subset*.
   - If Pi CLI cannot match that contract cleanly without harming the Sero UX or overcomplicating the implementation, Sero should still win; Pi CLI compatibility is a nice-to-have, not a hard backwards-compatibility requirement.
   - If product instead wants “all questions required,” then the Sero UI must stop implying otherwise.
   - Extract the core decision logic into a shared pure module (for example `shared/questionnaire-flow.ts`) covering:
     - answer insertion/removal
     - exclusive-option handling
     - custom-answer merging
     - submit eligibility
     - review summary formatting inputs
   - Have both `ui/QuestionnaireForm.tsx` and `extension/tui-questionnaire.ts` consume that shared model where practical while keeping renderer/TUI presentation separate.
   - The main goal is to remove hand-maintained behavioral drift from the Sero path; matching Pi CLI behavior remains desirable but secondary.

2. **~~Remove onboarding ownership from the plugin UI and push it back to the host/profile layer.~~ ✅ 2026-04-14 (`aa301f95`)**
   - Strip `needsOnboarding()` / `markOnboardingDone()` usage out of `UserFeedbackApp` so the remote depends only on user-feedback APIs.
   - Move any onboarding wait-state or completion side effect into the host code that already owns onboarding orchestration (`OnboardingWizard`, profile setup flows, or the renderer store layer), not the generic plugin remote.
   - Delete the `profiles` surface from `ui/sero.d.ts` once the remote no longer needs it.
   - Aligns with AD-001: the shell/profile system owns product workflow; the plugin should remain a reusable communication surface.

3. **~~Canonicalize user-feedback transport and bus contracts.~~ ✅ 2026-04-14 (`56ff5e59`)**
   - Promote the question/answer payload types and the event-bus singleton key/factory into one neutral shared contract module (prefer a renderer-safe shared package such as `@sero/common`, or a dedicated shared desktop/plugin contract module if package boundaries make that safer).
   - Update these consumers together:
     - plugin `shared/types.ts` / `ui/types.ts`
     - `apps/desktop/src/types/user-feedback.ts`
     - preload `platform/user-feedback.ts`
     - Electron `shared/lib/user-feedback-bus.ts`
     - plugin `shared/emitter.ts`
   - Replace local “subset bridge” declarations with canonical typed aliases so host drift becomes a typecheck failure.
   - This also closes the Medium drift already documented in `docs/deslopify/apps/desktop/src/types/plan.md` and `docs/deslopify/apps/desktop/electron/shared/plan.md`.

4. **~~Add package-local typecheck and focused tests for the real risk surfaces.~~ ✅ 2026-04-14 (`f4da24f0`)** _(2026-04-14 partial: package-local UI+extension typecheck plus focused IPC-bridge tests landed in `56ff5e59`; this E5 pass added shared questionnaire-flow parity coverage, interview-result tests, permission-gate timeout/exemption tests, direct `QuestionnaireForm` coverage, and `UserFeedbackApp` queue-hydration coverage.)_
   - Expand `package.json` scripts so the package locally typechecks both `ui/` and `extension/` (and shared types transitively).
   - Add focused tests for:
     - questionnaire parity between Sero UI rules and TUI rules
     - partial-answer vs all-required submission behavior
     - interview answer aggregation/cancel behavior
     - permission-gate timeout + workspace-scoped delete exemptions
     - `UserFeedbackApp` queue hydration without onboarding/profile side effects
   - Keep these mostly pure/unit-level; do not require a heavy browser/Electron harness just to protect the core flow logic.

5. **~~Split the large questionnaire modules after behavior is canonical.~~ ✅ 2026-04-14 (`f4da24f0`)**
   - Target structure example:
     - `shared/questionnaire-flow.ts` — pure state/update helpers
     - `ui/questionnaire/QuestionnaireForm.tsx` — thin container
     - `ui/questionnaire/QuestionnaireReview.tsx`
     - `ui/questionnaire/QuestionnaireQuestionStep.tsx`
     - `extension/tui-questionnaire-state.ts` or `extension/questionnaire-render.ts`
   - Keep public entry points stable while reducing the cognitive load in the 469-line and 416-line hubs.
   - Do this after Step 1 so the extraction does not just centralize already-divergent behavior.

6. **Make bridge failures visible once the host coupling is removed.**
   - Replace the current silent catches with explicit behavior:
     - user-feedback bridge load failure → empty state plus visible error text/log
     - onboarding/profile failure → removed from plugin entirely in Step 2
   - The goal is not noisy UX; it is preserving diagnosability for a foundational interactive flow.

## Benefits & Trade-offs
- Benefits:
  - Restores one truthful questionnaire contract across Sero and Pi CLI.
  - Removes product-specific onboarding side effects from a reusable plugin boundary.
  - Eliminates manual keep-in-sync drift for the feedback transport and bus contracts.
  - Makes future changes safer with package-local type/test coverage.
  - Relieves line-count pressure in the two questionnaire hubs before they cross the hard cap.
- Trade-offs:
  - The onboarding cleanup touches host/profile code outside the plugin folder.
  - Canonicalizing types/bus ownership causes some import churn across plugin, preload, and Electron layers.
  - If the team decides to change questionnaire semantics rather than preserve the current Sero behavior, that is a real runtime behavior change and must be verified deliberately.

## Dependencies & Risks
- The questionnaire-parity fix is a runtime-sensitive behavioral decision. The team must explicitly choose whether unanswered questions are allowed, and that decision should be made from the Sero UX outward rather than from Pi CLI backwards-compatibility assumptions.
- Moving onboarding out of the plugin depends on the existing host/profile orchestration surface. If the host still needs a “waiting for onboarding questions” state, that should be implemented at the shell/store level rather than left in the remote.
- Canonicalizing types may overlap with the already-open desktop cleanup around user-feedback contract ownership (`apps/desktop/src/types`) and bus deduplication (`apps/desktop/electron/shared`). Coordinate those moves so ownership changes happen once.
- Package-local tests must not hard-code the wrong contract. Write the contract decision first, then encode it in tests.
- No container rebuild is required for this plan.

## Next Steps
1. If we do a follow-up polish pass, clear the remaining Low bridge-failure visibility item in `ui/UserFeedbackApp.tsx` so preload failures are diagnosable instead of silently flattening into an empty queue.
2. Otherwise treat this plugin as Medium-complete and move to the next queued E5 target in the desktop/packages/plugins backlog.

Verification checklist:
- The Sero remote UI produces the intended submit/cancel behavior for questionnaires with unanswered steps.
- Pi CLI behavior is either aligned with that contract or explicitly documented as a secondary compatibility path, not accidental drift.
- A normal questionnaire or interview no longer toggles onboarding/profile completion state.
- `UserFeedbackApp` still hydrates pending questionnaires/interviews and clears promptly when `window.sero.userFeedback.answer()` fires the synchronous answered event.
- Permission prompts still auto-time out after 30 seconds and still auto-allow only workspace-scoped recursive deletes.
- Desktop host, preload, and plugin all compile against one canonical feedback contract without local mirrored type or bus definitions.

## Execution log
- `aa301f95` — `fix(plugins): make lifecycle semantics sero-first`
- `56ff5e59` — `refactor(plugins): harden E3 bridge ownership and quality gates` *(user-feedback: canonicalized shared transport/bus ownership and added package-local extension-inclusive checks)*
- `f4da24f0` — `refactor(user-feedback): split questionnaire flow and add direct coverage`
