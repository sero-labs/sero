# Facts — apps/desktop/src/components/profiles

_Last reviewed: 2026-04-15_

## What this code does
This folder owns the renderer-side profile UX for `apps/desktop`: first-run profile creation, title-bar profile switching, and the recommendation-first onboarding flow that creates a temporary bootstrap session, seeds memory, then opens the user’s first real welcome chat.

## Shape & metrics
- Total files: 8
- Largest file: `apps/desktop/src/components/profiles/OnboardingWizard.tsx` (486 LOC)
- Files over 500 LOC: none
- Near-cap files (≥400 LOC): `apps/desktop/src/components/profiles/OnboardingWizard.tsx` (486)
- External dependencies of note: Zustand `profiles` / `app` / `agent` / `sessions` / `user-feedback-store`, `window.sero.{profiles,onboarding,modelConfig,agent,github}`, `AuthLoginDialog`, `useGitHubAuthFlow`
- Upstream callers: `apps/desktop/src/App.tsx` gates first-run + onboarding here; `apps/desktop/src/components/layout/TitleBar.tsx` mounts `ProfileSwitcher`
- Downstream dependencies: `apps/desktop/electron/ipc/workspace/profiles.ts`, onboarding IPC, agent session lifecycle, model-config persistence, GitHub device-flow auth

## Architectural notes
- This folder is not purely presentational. `OnboardingWizard` currently owns temporary-session creation/teardown, model fallback logic, onboarding completion, and shell-side chat/session focus changes.
- Profile UX sits on the shell critical path: `App.tsx` short-circuits to `ProfileSetup` when no active profile exists, then keeps `OnboardingWizard` mounted as a global overlay once the shell is live.
- AD-022 matters throughout: profile creation and switching rely on restart semantics, and onboarding completion is persisted through the fixed registry via IPC rather than renderer storage.
- The optional GitHub step during onboarding reuses the global GitHub device-flow hook instead of a profile-specific auth store.

## Runtime-sensitive surfaces
- First-run gating: `ProfileSetup` must remain the only screen when there is no active profile.
- Onboarding launch is multi-stage and order-sensitive: create temp session → run memory bootstrap → verify completion → tear temp session down → create Welcome session → mark profile onboarded.
- Launch-dialog visibility currently depends on pending user-feedback state, so ref/mount timing changes can alter whether the blocking dialog disappears at the correct moment.
- Profile switch/create flows intentionally assume an app relaunch on success; any cleanup that changes that contract would be a behavior change.

## Surprising discoveries
- Memory bootstrap is intentionally performed in a disposable session, not the eventual Welcome conversation.
- The renderer only offers “copy credentials/model preferences from the current profile,” even though the IPC/store contract is shaped for a more general `copyAuthFromId` flow.
- Several failure paths currently rely on silent fallback or restart semantics, so observability is scattered across small UI components instead of one controller surface.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 11 (was 8)
- Largest file: `apps/desktop/src/components/profiles/onboarding/onboarding-launch-runtime.ts` (371 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): none (was `apps/desktop/src/components/profiles/OnboardingWizard.tsx` at 486 LOC)
- Type escape hatches remaining: none introduced in this pass

### What changed
- Extracted onboarding session creation, model fallback, failure extraction, temp-session cleanup, and welcome-session sequencing into `onboarding/onboarding-launch-runtime.ts`.
- Added `onboarding/useOnboardingLaunch.ts` so `OnboardingWizard.tsx` now focuses on phase selection and dialog composition instead of store/runtime orchestration.
- Added focused onboarding runtime coverage for the temp-session → bootstrap → welcome flow and auth-recovery fallback behavior.

### Still outstanding
- `OnboardingWizard.tsx` still hides the launching dialog via a render-phase ref mutation when pending user feedback appears.
- Profile create/switch surfaces still swallow restart-sensitive operational failures instead of showing actionable UI feedback.
- GitHub onboarding step control still lives across `SetupScreen`, `GitHubConnectCard`, and `useGitHubAuthFlow`.

## Post-fix snapshot — 2026-04-15

### Metrics after fixes
- Total files: 13 (was 11)
- Largest file: `apps/desktop/src/components/profiles/onboarding/onboarding-launch-runtime.ts` (371 LOC)
- Files over 500 LOC: none (was none)
- Near-cap files (≥400 LOC): none (was none)
- Type escape hatches remaining: none introduced in this pass

### What changed
- Replaced the render-phase `hideLaunchingDialogRef` mutation in `OnboardingWizard.tsx` with an effect-backed lifecycle hook that keeps pending-input dismissal behavior explicit.
- Added `onboarding/useLaunchingDialogVisibility.ts` so launch-dialog hiding now resets cleanly when onboarding leaves the launching phase.
- Added focused hook coverage for initial launch visibility, pending-input dismissal, and the next-launch reset behavior.

### Still outstanding
- Profile create/switch surfaces still swallow restart-sensitive operational failures instead of showing actionable UI feedback.
- GitHub onboarding step control still lives across `SetupScreen`, `GitHubConnectCard`, and `useGitHubAuthFlow`.
