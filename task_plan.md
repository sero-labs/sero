# Task: Fix all PR #22 review issues

## Goal
Fix all 12 issues found in the user-feedback PR review — blockers, should-fix, and nits.

## Phases

### Phase 1: Checkout & read current files [in_progress]
- Read all files that need changes

### Phase 2: Fix blockers [pending]
1. ChatPanel.tsx > 500 LOC → extract user-feedback hook + questionnaire rendering
2. preload.ts > 500 LOC → extract API namespaces into separate modules
3. sessionId hardcoded to '' → remove from type & usage
4. Phantom pi-ai peer dep → remove from package.json

### Phase 3: Fix should-fix issues [pending]
5. Duplicated getEmitter/EMITTER_KEY → extract shared emitter module
6. Duplicated types between package and host → host imports from shared package
7. pendingQuestions Map leak → add session-end cleanup
8. QuestionnaireNotice unvalidated input → add type guard

### Phase 4: Fix nits [pending]
9. Inline import() types in tui-questionnaire.ts → top-level import
10. QuestionnaireForm auto-advance on last step → don't auto-advance on last
11. Missing aria-label → add to icon-only buttons + role="button"
12. PR description mentions /ask command → fix comments

### Phase 5: Verify [pending]
- Typecheck all
- Check all files under 500 LOC
- Commit

## Files to touch
- apps/desktop/src/components/layout/ChatPanel.tsx
- apps/desktop/electron/preload.ts
- apps/desktop/electron/ipc/user-feedback-questions.ts
- apps/desktop/src/types/ipc.ts
- apps/desktop/src/types/electron.d.ts
- apps/desktop/src/components/layout/QuestionnaireNotice.tsx
- apps/desktop/src/components/layout/PendingQuestionCard.tsx
- packages/pi-user-feedback/extension/index.ts
- packages/pi-user-feedback/extension/ipc-bridge.ts
- packages/pi-user-feedback/extension/tui-questionnaire.ts
- packages/pi-user-feedback/shared/types.ts
- packages/pi-user-feedback/ui/QuestionnaireForm.tsx
- packages/pi-user-feedback/ui/UserFeedbackApp.tsx
- packages/pi-user-feedback/package.json
