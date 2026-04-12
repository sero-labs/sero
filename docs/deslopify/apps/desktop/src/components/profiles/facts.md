# Facts — apps/desktop/src/components/profiles

_Last reviewed: 2026-04-12_

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
