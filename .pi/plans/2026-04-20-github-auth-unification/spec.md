# Unified GitHub Authentication UX in Sero

**Date:** 2026-04-20
**Status:** Draft
**Directory:** /Users/danielcarter/Documents/Dev/projects/sero/sero

## Intent
Sero should present one clear, reusable GitHub authentication path instead of treating Explorer as the de facto place to connect GitHub. Any area that depends on GitHub should be able to guide the user directly into the same connect flow so users do not hit dead ends or have to discover Explorer on their own.

## User Story
As a Sero user trying to perform a GitHub-related action, I want a clear way to connect GitHub from the place where I need it, so that I can recover from auth issues without hunting through the app.

## Behavior
GitHub authentication should feel like one product experience across Sero, even when it is launched from different parts of the app. When a user reaches a GitHub-dependent action while not connected, the current area should clearly explain that GitHub is required and offer a direct **Connect GitHub** action.

Explorer and onboarding may continue to show lightweight inline GitHub UI, but they should point into the same shared authentication path used everywhere else. The purpose is for users to learn one obvious GitHub connect experience, not separate flows per feature.

When a user completes GitHub authentication successfully, Sero should help them continue from where they were. If the interrupted action can be resumed simply and safely, the app should resume it. If automatic continuation would add complexity or risk surprising behavior, the app should instead return the user to a clearly connected state with an obvious path to proceed.

When a user cancels authentication, they should land back in the area that launched the flow and still see that GitHub is not connected, along with a visible retry path. When authentication fails, the app should show a generic failure state for v1 and make retrying obvious.

### Happy Path
1. A user starts a GitHub-dependent action from any current GitHub touchpoint in Sero.
2. If GitHub is not connected, the current area shows that authentication is required and offers a direct **Connect GitHub** action.
3. The user launches the shared GitHub connect flow.
4. The shared flow shows the current GitHub auth state consistently, including progress during device login.
5. The user completes GitHub login successfully.
6. Sero resumes the interrupted flow when doing so is simple and safe.
7. If the action is not auto-resumed, Sero returns the user to a clearly connected state where the next step is obvious.

### Edge Cases & Error Handling
- **User cancels login:** Return the user to the launching area and keep a clear **GitHub not connected** state with a visible **Connect GitHub** retry path.
- **Generic login failure:** Show a generic GitHub authentication failure state and provide an obvious way to retry.
- **Auth required outside Explorer:** The user can initiate GitHub connection directly from the current area instead of being told to go to Explorer or the sidebar.
- **Auto-resume not appropriate:** If continuing automatically would require complex logic or could surprise the user, return them to a connected state and let them proceed manually.
- **Multiple current touchpoints:** All existing GitHub entry points should feel consistent and clearly part of the same authentication experience.

## Scope
### In Scope
- Unifying the GitHub authentication path across current Sero GitHub touchpoints.
- Providing a direct **Connect GitHub** action wherever a GitHub-dependent action is blocked by missing auth.
- Reusing one shared GitHub connect experience so Explorer, onboarding, and other GitHub-required areas feel consistent.
- Ensuring blocked flows do not end in dead ends after auth errors or cancellation.
- Supporting simple, safe recovery after successful authentication.
- Replacing copy that instructs users to go connect GitHub somewhere else in the app.

### Out of Scope
- Creating a new globally discoverable manual GitHub connect entry point outside contextual GitHub flows.
- Redesigning GitHub features beyond what is needed to unify authentication entry and recovery.
- Reworking the underlying Electron GitHub device-flow implementation or changing token-storage behavior.
- Introducing detailed provider-specific failure handling for v1 beyond a generic retryable failure state.
- Expanding the work into a broader git workflow redesign.

## Effort & Quality
- **Level:** production
- **Tests:** thorough
- **Docs:** inline

## Constraints
- The unified GitHub auth experience should build on the existing shared GitHub auth foundation rather than creating a third disconnected path.
- Explorer should no longer be treated as the required place to connect GitHub.
- Onboarding may remain lightweight and inline, but it should launch the same shared GitHub connect flow as the rest of the app.
- The product should prioritize convenience and clarity without introducing overly complex auto-resume logic.
- The v1 failure experience can remain generic as long as the retry path is clear.
- The experience should preserve user context so GitHub auth failures do not create dead ends.

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: Any blocked GitHub action offers a direct **Connect GitHub** action.
- [ ] ISC-2: Explorer launches the same shared GitHub connect flow as other areas.
- [ ] ISC-3: Onboarding launches the same shared GitHub connect flow as other areas.
- [ ] ISC-4: Remote-origin GitHub auth failures include a direct **Connect GitHub** action.
- [ ] ISC-5: Publish GitHub auth failures include a direct **Connect GitHub** action.
- [ ] ISC-6: The shared GitHub flow clearly shows in-progress, connected, cancelled, and failed states.
- [ ] ISC-7: Successful login resumes the interrupted flow when that recovery is simple and safe.
- [ ] ISC-8: Successful login returns users to a clearly connected state when auto-resume is not appropriate.

### Edge Cases
- [ ] ISC-9: Cancelling login returns users to the area that launched it.
- [ ] ISC-10: After cancellation, the launching area still shows a visible retry path.
- [ ] ISC-11: Generic GitHub login failures show a clear retry path.
- [ ] ISC-12: Users can connect GitHub from every current GitHub touchpoint, not just Explorer.

### Anti-Criteria
- [ ] ISC-A-1: No GitHub-required area tells users to go connect “in Explorer” or “in the sidebar first.”
- [ ] ISC-A-2: No new third disconnected GitHub login experience is introduced.
- [ ] ISC-A-3: No GitHub auth failure leaves the user at a dead end with only an error.
