# Refactoring Plan — apps/desktop/src/components/profiles

_Plan drafted: 2026-04-12_

## Executive Summary
`src/components/profiles` is doing real product work, but too much of that work is concentrated in renderer components instead of a focused onboarding/profile controller layer. The main issue is `OnboardingWizard.tsx`: it is nearly at the 500-LOC cap and currently owns cross-store orchestration, temp-session lifecycle, model fallback, and shell side effects in one component. The right outcome is a thinner UI surface with explicit onboarding/profile controllers, clearer error handling, and fewer render-time lifecycle hacks.

## Issues Found (prioritized)
- **Medium** — `OnboardingWizard.tsx` is a near-cap renderer orchestration hub instead of a focused UI shell — `apps/desktop/src/components/profiles/OnboardingWizard.tsx:66`, `apps/desktop/src/components/profiles/OnboardingWizard.tsx:97`, `apps/desktop/src/components/profiles/OnboardingWizard.tsx:136`, `apps/desktop/src/components/profiles/OnboardingWizard.tsx:167`, and `apps/desktop/src/components/profiles/OnboardingWizard.tsx:180` together show one component owning failure parsing, model-selection fallback, temp-session creation/teardown, onboarding completion, and dialog rendering. This fights the store/controller ownership direction already established in the Wave A renderer reviews. Effort: **M**.

- **Medium** — Launch-dialog visibility is controlled by a render-phase ref mutation — `apps/desktop/src/components/profiles/OnboardingWizard.tsx:188-193` mutates `hideLaunchingDialogRef.current` during render when pending user input appears, and that ref immediately drives dialog openness at `apps/desktop/src/components/profiles/OnboardingWizard.tsx:415`. This is the same class of render-time side-effect drift already found in `components/layout`, just on a first-run path. Effort: **S**.

- **Medium** — Profile creation/switch flows swallow failures or reduce them to local loading resets — `apps/desktop/src/components/profiles/CreateProfileDialog.tsx:43-46`, `apps/desktop/src/components/profiles/ProfileSwitcher.tsx:42-45`, and `apps/desktop/src/components/profiles/ProfileForm.tsx:39-62` all catch operational failures without surfacing actionable UI state. On a restart-based profile system (AD-022), silent failure is especially confusing because the expected success path is “the app restarts now.” Effort: **S**.

- **Low** — GitHub onboarding ownership is split across too many small renderer surfaces — `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx:91-172` makes its own GitHub status/cancel decisions while `apps/desktop/src/components/profiles/onboarding/GitHubConnectCard.tsx:5-119` and `apps/desktop/src/hooks/useGitHubAuthFlow.ts:20-92` own overlapping pieces of the same flow. The code works, but it invites drift in optional-step behavior and connected-state messaging. Effort: **S**.

## Proposed Refactoring
1. ~~**Extract onboarding runtime out of `OnboardingWizard.tsx`.**~~ ✅ 2026-04-15 (`2b94571a`)
   - Moved temp-session lifecycle, model fallback, failure extraction, and onboarding-completion sequencing into `src/components/profiles/onboarding/{onboarding-launch-runtime.ts,useOnboardingLaunch.ts}`.
   - `OnboardingWizard.tsx` now stays responsible for phase selection and dialog composition only.
   - Keeps the AD-022 restart/onboarding semantics explicit while matching the store/controller ownership direction from the `src/stores` review.

2. ~~**Replace render-phase dialog-hiding mutations with derived lifecycle state.**~~ ✅ 2026-04-15 (`fc36ab2b`)
   - Track “launch dialog should hide because user input is pending” as explicit component state or a small effect keyed on `uiPhase` + `hasPendingUserInput`.
   - Keep the behavior identical (dialog disappears once the memory bootstrap is waiting on user input), but stop mutating refs during render.

3. ~~**Centralize profile operation error handling.**~~ ✅ 2026-04-15 (`0cddfe24`)
   - Moved restart-aware error semantics into one helper/store-facing contract so `CreateProfileDialog`, `ProfileSwitcher`, and `ProfileForm` no longer invent their own catch/reset behavior.
   - Surfaced explicit error text in the dialog/popover instead of silently staying on the current profile.
   - Preserved the success-path assumption that a successful switch/create may never resolve in the current process because the app relaunches.

4. **Collapse GitHub onboarding flow control into one controller primitive.**
   - Keep `GitHubConnectCard` as the presenter.
   - Move “check status first / decide whether to show the GitHub step / cancel when leaving the step” into a small `useOnboardingGitHubStep` hook or onboarding-controller helper used only by `SetupScreen`.
   - That makes the optional GitHub step easy to reason about without duplicating state transitions.

## Benefits & Trade-offs
- Benefits: clearer ownership, smaller and easier-to-review onboarding code, better error visibility on restart-sensitive profile actions, and fewer lifecycle surprises in a first-run path.
- Trade-offs: some churn across UI helpers/hooks, plus targeted retesting of onboarding launch behavior because the extracted controller touches real runtime sequencing.

## Dependencies & Risks
- This work depends on keeping the existing store contracts intact (`profiles`, `app`, `agent`, `sessions`, `user-feedback-store`) rather than inventing a new renderer-side persistence path.
- Extracting onboarding runtime is behavior-sensitive: temp-session cleanup, welcome-session creation, and onboarding completion ordering must stay identical.
- Centralizing profile-action errors must preserve the current “success means relaunch” semantics from AD-022.

## Next Steps
1. ~~Extract onboarding session runtime helpers out of `OnboardingWizard.tsx` and reduce the component to phase/dialog composition.~~ ✅ 2026-04-15 (`2b94571a`)
2. ~~Remove the render-phase `hideLaunchingDialogRef` mutation and replace it with explicit derived state.~~ ✅ 2026-04-15 (`fc36ab2b`)
3. ~~Introduce one restart-aware error helper for profile create/switch flows and surface errors in the UI.~~ ✅ 2026-04-15 (`0cddfe24`)
4. Consolidate GitHub onboarding step control into a single hook/helper.
5. Verification checklist:
   - Fresh install with no active profile shows only `ProfileSetup`.
   - Creating the first profile still triggers activation/relaunch correctly.
   - Onboarding temp session bootstraps memory, disappears if user feedback is requested, then opens the Welcome session.
   - GitHub optional step still supports connect, cancel, skip, and already-connected flows.
   - Failed profile switch/create paths show actionable UI feedback instead of silently doing nothing.

## Execution log
- 2026-04-15 — `2b94571a` — `refactor(profiles): extract onboarding launch runtime`
- 2026-04-15 — `fc36ab2b` — `refactor(profiles): derive onboarding launch dialog visibility`
- 2026-04-15 — `0cddfe24` — `refactor(profiles): surface restart-aware profile errors`
