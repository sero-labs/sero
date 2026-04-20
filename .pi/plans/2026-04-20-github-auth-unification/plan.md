# GitHub Auth Unification Implementation Plan

**Date:** 2026-04-20
**Status:** Draft
**Spec:** `.pi/plans/2026-04-20-github-auth-unification/spec.md`
**Scout:** `.pi/plans/2026-04-20-github-auth-unification/scout-context.md`
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

This work should unify Sero’s renderer-side GitHub authentication UX around **one shared connect path** while preserving contextual entry points.

The Electron/main-process foundation is already unified today:

- `apps/desktop/electron/features/auth/github/auth-manager.ts`
- `apps/desktop/electron/ipc/integrations/github.ts`
- `apps/desktop/electron/preload/apps/app-domain.ts`
- `apps/desktop/src/types/electron-services.d.ts`

What is fragmented is the renderer experience:

- Explorer has an inline device-flow banner.
- Onboarding has a separate inline device-flow card.
- Remote-origin creation and titlebar publish hit auth-required dead ends that tell users to go somewhere else.
- `useGitHubAuthFlow()` currently owns subscription state per mount, which is risky because the underlying GitHub device-flow event stream is global.

The cleanest implementation is a **hybrid architecture**:

1. a **single global GitHub auth dialog** that owns the actual device-flow UI and event subscription,
2. **lightweight inline launch/status surfaces** in Explorer, onboarding, and blocked git flows,
3. **local opt-in auto-resume** only for the blocked actions that are simple and safe to retry after success.

That gives Sero one recognizable GitHub auth experience without creating a third disconnected login path or bloating already-large files.

## Investigation Summary

### Current state

- `useGitHubAuthFlow.ts` already encapsulates GitHub status refresh, device-flow progress mapping, copy-code feedback, and login/logout/cancel actions.
- `GitHubAuthBanner.tsx` and `GitHubConnectCard.tsx` duplicate almost the same code/polling/success/error UI.
- `CreateGitHubView` in `remote-origin-views.tsx` handles `createGitHubOrigin(...).reason === 'auth'` by showing a dead-end message telling the user to connect in the sidebar.
- `GitRemotePublishSection.tsx` has a separate dead-end copy path and its own local GitHub status/hint logic.
- `workflow.ts` already correctly treats `window.sero.github.status()` as the auth source of truth and returns a structured auth failure from `createGitHubOrigin()`.
- `AuthLoginDialog.tsx` is a strong precedent for a shell-mounted reusable auth dialog with extracted subviews.

### Architectural constraints that matter

- The GitHub device-flow event stream is global, so multiple mounted flow UIs would all receive the same events unless renderer orchestration is centralized.
- `window.sero.github.status()` must remain the source of truth for connection status.
- The feature is renderer-heavy; the Electron/device-flow implementation should stay unchanged unless a small gap appears during implementation.
- File size limits are real: `remote-origin-views.tsx`, `GitRemotePublishSection.tsx`, and `AuthLoginDialog.tsx` are already big enough that auth-related additions should be split into new helpers/subviews.

## Approaches Considered

### 1. Shared inline reusable GitHub auth component only

Build one reusable inline auth surface and render it in Explorer, onboarding, remote-origin, and publish.

**Pros**
- Smallest conceptual change.
- Easy to reuse existing `useGitHubAuthFlow()` logic.
- Minimal shell plumbing.

**Cons**
- Still leaves the actual device flow mounted in multiple places.
- Conflicts with the global event-stream gotcha.
- Makes “one auth path” feel weaker because the login flow is still visually embedded in several contexts.
- Harder to prevent multiple simultaneous subscribers and inconsistent cancellation behavior.

**Verdict:** better than today, but not strong enough for the spec or the event-stream constraint.

### 2. Shared global GitHub auth dialog only

Move all GitHub auth UX into a shell-level dialog and make every surface open it.

**Pros**
- Truly one visible login path.
- Naturally centralizes the event subscription.
- Cleanest protection against duplicate device-flow UIs.

**Cons**
- Explorer/onboarding lose their lightweight inline guidance unless replaced with summary-only UI.
- Blocked git flows still need local context and retry affordances after the dialog closes.
- Feels slightly too modal-only for onboarding and Explorer, where contextual status is still useful.

**Verdict:** viable, but slightly too rigid for the spec’s “lightweight inline UI may remain” guidance.

### 3. Hybrid: global GitHub auth dialog for the actual flow plus inline launcher/status components (**recommended**)

Use one shared dialog for the real device flow, then keep small contextual surfaces that launch it and show connected / disconnected / retryable states.

**Pros**
- Satisfies “one shared auth path” without losing contextual guidance.
- Centralizes the event stream in exactly one place.
- Lets blocked flows keep local retry UX and safe auto-resume behavior.
- Keeps Explorer and onboarding lightweight while pointing into the same experience.

**Cons**
- Requires a small controller/store plus a globally mounted dialog host.
- Needs careful ownership of dialog outcomes so auto-resume stays local and unsurprising.

**Decision:** use the hybrid approach.

## Recommended Approach

Implement a **renderer-side GitHub auth controller + globally mounted dialog** under `apps/desktop/src/components/layout/auth/github/` and a small store/controller under `apps/desktop/src/stores/`.

All GitHub entry points should call the same launcher API instead of calling `window.sero.github.login()` directly.

### Key Decisions

- **Keep Electron/preload/IPC unchanged** unless a true gap appears. This is primarily a renderer consolidation task.
- **Create one active GitHub auth controller** in the renderer so there is only one `window.sero.github.onEvent(...)` subscription.
- **Mount the dialog once in `App.tsx`**, alongside other shell-level surfaces such as `CommandMenu` and `OnboardingWizard`.
- **Make the shared launcher promise-based** so callers can `await` the result and decide locally whether to auto-resume.
- **Use `window.sero.github.status()` as the source of truth** on dialog open, on success, on logout, and before any auto-resume decision.
- **Keep auto-resume local and conservative**:
  - auto-resume remote-origin creation and titlebar publish only when the user was explicitly blocked while creating a GitHub repo,
  - do not auto-advance onboarding,
  - do not trigger repo creation just because someone opened the dialog proactively.
- **Do not add a new manual “Connect GitHub” entry point** in menus/sidebar/command palette; only contextual launchers should open the dialog.
- **Remove all copy that says “connect in Explorer” or “connect in the sidebar first.”**

## Architecture

### 1. Renderer GitHub auth controller

Add a small global store/controller, likely at:

- `apps/desktop/src/stores/github-auth.ts`

Recommended responsibilities:

- hold current `authStatus` + `statusReady`,
- hold current dialog open state + active request metadata,
- map GitHub device-flow IPC events into renderer flow state,
- manage copy-code transient state,
- expose a promise-returning `openGitHubAuthDialog()` action,
- expose `refreshStatus()`, `startLogin()`, `cancel()`, and `logout()`.

Recommended contract shape:

```ts
export type GitHubAuthSource = 'explorer' | 'onboarding' | 'remote-origin' | 'publish';

export type GitHubAuthDialogResult =
  | { outcome: 'success'; status: GitHubAuthStatus }
  | { outcome: 'cancelled'; status: GitHubAuthStatus }
  | { outcome: 'error'; status: GitHubAuthStatus; message: string };

export interface GitHubAuthDialogRequest {
  source: GitHubAuthSource;
}

export interface GitHubAuthState {
  openGitHubAuthDialog: (request: GitHubAuthDialogRequest) => Promise<GitHubAuthDialogResult>;
  refreshStatus: () => Promise<GitHubAuthStatus>;
  startLogin: () => void;
  cancel: () => void;
  logout: () => Promise<void>;
}
```

Implementation note: the controller should enforce a **single active dialog request**. If a second surface tries to open the GitHub dialog while it is already open, reuse the current session/result rather than starting another login.

### 2. Global GitHub auth dialog host

Add a shell-mounted dialog, likely split into:

- `apps/desktop/src/components/layout/auth/github/GitHubAuthDialog.tsx`
- `apps/desktop/src/components/layout/auth/github/GitHubAuthDialogViews.tsx`

Mount it once in `apps/desktop/src/App.tsx`.

The dialog should own the actual device-flow presentation:

- disconnected / ready-to-connect state,
- device code state,
- polling state,
- connected state,
- generic error state with retry,
- close/cancel behavior.

It should follow the extracted-view pattern already used by:

- `apps/desktop/src/components/layout/auth/AuthLoginDialog.tsx`
- `apps/desktop/src/components/layout/auth/AuthLoginViews.tsx`

This dialog is the only place that should render the GitHub device-flow progress UI.

### 3. Inline launcher / status primitives

Create small reusable inline pieces for contextual surfaces, for example:

- `apps/desktop/src/components/layout/auth/github/GitHubAuthSummary.tsx`
- `apps/desktop/src/components/layout/auth/github/GitHubAuthRequiredNotice.tsx`

These should be **summary/launcher UI only**, not full device-flow UIs.

Recommended responsibilities:

- show connected vs disconnected state,
- provide a `Connect GitHub` button that opens the shared dialog,
- optionally show a small retryable note after `cancelled` / `error` outcomes,
- allow slight copy/layout variation per surface while reusing the same action wiring.

This keeps the product consistent without forcing Explorer, onboarding, remote-origin, and publish into one identical card layout.

### 4. Surface integrations

#### Explorer

`GitHubAuthBanner.tsx` should become a compact summary surface:

- disconnected → concise explanation + `Connect GitHub` button,
- connected → username + optional disconnect action,
- no inline code/polling UI.

Explorer should now launch the global dialog and immediately benefit from the same shared flow as every other area.

#### Onboarding

`GitHubConnectCard.tsx` and `useOnboardingGitHubStep.ts` should stop driving the device flow inline.

Recommended behavior:

- onboarding still checks GitHub status before entering the optional GitHub step,
- the GitHub step shows a lightweight summary/CTA that launches the global dialog,
- after successful auth, the step shows a clearly connected state and the existing continue action,
- onboarding does **not** auto-advance after auth success.

This preserves context and keeps the next step obvious without surprising the user.

#### Remote origin create flow

`CreateGitHubView` should replace the current dead-end auth message with a direct auth-required callout.

Recommended behavior:

- when GitHub is required, show a visible `Connect GitHub` action in the current view,
- preserve form state (`name`, `description`, `visibility`) while the dialog is open,
- if the user connects successfully **after being blocked by create**, rerun the same create action automatically,
- if the user cancels, remain in the same view with the same form values and a visible retry path,
- keep the existing `createGitHubOrigin(...).reason === 'auth'` branch as a fallback safety net.

#### Titlebar publish flow

`GitRemotePublishSection.tsx` should follow the same pattern:

- disconnected GitHub mode should offer a direct `Connect GitHub` action,
- explicit create/publish attempts blocked by auth should be resumable after successful auth,
- if the user opened auth proactively from the hint state, do **not** auto-create a repo on success,
- the “existing remote” mode remains unchanged.

### 5. Safe auto-resume policy

Auto-resume should be intentionally narrow.

**Auto-resume:**
- remote-origin “Create repository” after auth blocked the exact action,
- titlebar “Create repo + publish” after auth blocked the exact action.

**Do not auto-resume:**
- Explorer auth banner,
- onboarding GitHub step,
- generic proactive “Connect GitHub” clicks that were not triggered by a blocked repo-creation action.

Recommended launcher-side pattern:

```ts
const result = await openGitHubAuthDialog({ source: 'publish' });
if (result.outcome !== 'success') return;
if (!mountedRef.current) return;
await retryCreateGitHubRepo();
```

That keeps resume ownership in the launching component, where the form state and safety context already exist.

### 6. Data flow

```text
Launcher surface
  → openGitHubAuthDialog({ source })
  → global GitHub dialog opens
  → controller refreshes window.sero.github.status()
  → user starts login
  → window.sero.github.onEvent(...) streams code/polling/success/error
  → controller updates flow state
  → dialog resolves with success/cancelled/error
  → launcher refreshes local state and optionally auto-resumes
```

Rules:

- no launcher should call `window.sero.github.login()` directly,
- no launcher should infer auth from stale local state alone,
- launcher-side resume logic should always re-check mounted/open state before mutating local UI.

## Premortem

### Riskiest assumptions

| Assumption | If wrong |
|---|---|
| A single renderer controller can own the GitHub event stream cleanly | Multiple surfaces may still subscribe and reintroduce the duplicate-flow bug |
| A promise-returning dialog launcher is ergonomic in this codebase | Resume wiring may get awkward and spread hidden callback state across components |
| `refreshStatus()` before resume is enough to avoid stale-auth mistakes | Callers may still rerun create flows after auth has been lost or invalidated |
| Remote-origin/publish auto-resume is actually “simple and safe” | Users could be surprised by repo creation if we trigger it after a connect-only intent |
| Existing current touchpoints are limited to the known four surfaces | A forgotten surface may keep old Explorer/sidebar-first copy and break ISC-A-1 |

### Failure modes

- **Built the wrong thing:** workers keep inline device-flow UI in Explorer/onboarding and add a dialog on top, creating a second/third auth path instead of replacing it.
- **Race conditions:** two surfaces try to launch auth at once, causing duplicate promise resolution or inconsistent UI.
- **Unsafe resume:** a blocked action auto-runs after auth even though the user only intended to connect, not create a repo.
- **Status drift:** UI trusts cached state instead of `window.sero.github.status()`, so it shows connected when it is not.
- **File-size regression:** auth logic is appended directly into `remote-origin-views.tsx` or `GitRemotePublishSection.tsx` until they exceed the monorepo’s 500 LOC limit.

### Accepted mitigations

- One controller, one mounted dialog, one active request at a time.
- Resume only from the local blocked-action handlers that explicitly await dialog success.
- Keep `createGitHubOrigin()` auth fallback intact even if surfaces preflight status.
- Extract new auth subviews/helpers rather than expanding already-large files.
- Add dedicated tests for cancel, failure, and resume behavior in the blocked flows.

## Dependencies

No new library dependencies are required.

Use existing patterns and modules:

- `apps/desktop/src/components/layout/auth/AuthLoginDialog.tsx`
- `apps/desktop/src/components/layout/auth/AuthLoginViews.tsx`
- `apps/desktop/src/stores/context-editor.ts`
- `apps/desktop/src/hooks/useGitHubAuthFlow.ts`
- `apps/desktop/src/components/layout/git-remote/workflow.ts`
- `apps/desktop/src/components/layout/workspace/remote-origin-views.tsx`
- `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishSection.tsx`
- `apps/desktop/src/components/profiles/onboarding/useOnboardingGitHubStep.ts`
- `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`

## Testing Strategy

Cover both the controller/dialog and the contextual integrations.

### Automated

- controller/store test for single active request + shared result resolution,
- dialog test for idle → code → polling → success/error state rendering,
- onboarding test confirming shared dialog launch path and no Explorer/sidebar copy,
- remote-origin test confirming auth-required CTA + cancel retry path + safe resume,
- publish test confirming auth-required CTA + safe resume only after blocked publish,
- keep `workflow.test.ts` coverage for auth fallback behavior.

### Manual smoke checks

- Explorer disconnected → Connect GitHub → success → banner shows connected state.
- Onboarding GitHub step → cancel → remain on onboarding step with retry path.
- Remote origin create → blocked by auth → connect → automatic create resumes.
- Titlebar publish → blocked by auth → cancel → remain in publish section with retry path.
- Any auth failure → obvious retry path, no instruction to go to Explorer/sidebar.

## Risks & Open Questions

- **Result persistence:** the spec requires visible retry paths after cancel/failure, but does not require long-lived per-surface “last attempt” history. V1 should use lightweight local retry messaging only where it adds clarity.
- **Disconnect UX:** the spec is about connect/recovery, not disconnect. Preserve disconnect where it already exists (Explorer-style connected summary) and avoid broad redesign.
- **Multiple concurrent launch attempts:** plan assumes a single active dialog request policy is acceptable for v1.

## Implementation Todos

> The structured todo tool is not available in this planner session, so the worker backlog is embedded here as executable markdown todos.
>
> **Rule for every todo:** do not add a new manual/global GitHub connect entry point; keep `window.sero.github.status()` as the source of truth; keep all touched source files under 500 LOC.

### [x] GHA-01 — Build the shared renderer GitHub auth controller/store
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - new `apps/desktop/src/stores/github-auth.ts`
  - `apps/desktop/src/hooks/useGitHubAuthFlow.ts`
- **Reference code:**
  - store structure and extracted actions: `apps/desktop/src/stores/context-editor.ts`
  - event/status/copy-code mapping: `apps/desktop/src/hooks/useGitHubAuthFlow.ts`
- **Expected shape:**
  ```ts
  export type GitHubAuthSource = 'explorer' | 'onboarding' | 'remote-origin' | 'publish';

  export type GitHubAuthDialogResult =
    | { outcome: 'success'; status: GitHubAuthStatus }
    | { outcome: 'cancelled'; status: GitHubAuthStatus }
    | { outcome: 'error'; status: GitHubAuthStatus; message: string };

  export const useGitHubAuthStore = create<GitHubAuthStore>((set, get) => ({
    open: false,
    authStatus: null,
    statusReady: false,
    flow: { step: 'idle' },
    openGitHubAuthDialog: async (request) => { /* shared deferred result */ },
    refreshStatus: async () => await window.sero.github.status(),
  }));
  ```
- **Constraints:**
  - there must be exactly one `window.sero.github.onEvent(...)` subscription path,
  - `refreshStatus()` must be used on open/success/logout and before auto-resume decisions,
  - no surface should call `window.sero.github.login()` directly once this controller exists,
  - if `useGitHubAuthFlow.ts` remains, convert it into a thin adapter over the shared store rather than keeping per-mount state.
- **Do NOT:**
  - **Anti-pattern: Per-Surface Device Flow Ownership** — do not keep separate event subscriptions in Explorer/onboarding/publish.
  - **Anti-pattern: Stale UI Truth** — do not infer auth from cached flow success without rechecking `window.sero.github.status()`.
- **Acceptance:** supports ISC-2, ISC-3, ISC-6, ISC-12, ISC-A-2.
- **Status:** completed 2026-04-20.

### [x] GHA-02 — Add the globally mounted GitHub auth dialog host and extracted views
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - new `apps/desktop/src/components/layout/auth/github/GitHubAuthDialog.tsx`
  - new `apps/desktop/src/components/layout/auth/github/GitHubAuthDialogViews.tsx`
  - `apps/desktop/src/App.tsx`
- **Reference code:**
  - dialog shell pattern: `apps/desktop/src/components/layout/auth/AuthLoginDialog.tsx`
  - extracted view pattern: `apps/desktop/src/components/layout/auth/AuthLoginViews.tsx`
  - shell-level mounted surfaces: `apps/desktop/src/App.tsx`
- **Expected shape:**
  ```tsx
  export function GitHubAuthDialog() {
    const { open, flow, authStatus, startLogin, cancel, logout } = useGitHubAuthStore();
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          {/* idle / code / polling / success / error views */}
        </DialogContent>
      </Dialog>
    );
  }

  // App.tsx
  <CommandMenu />
  <GitHubAuthDialog />
  <NewAppBanner />
  <OnboardingWizard />
  ```
- **Constraints:**
  - mount the dialog once at the app shell level,
  - the actual device-flow UI lives only here,
  - the dialog must clearly cover disconnected, in-progress, connected, and generic failure states,
  - cancel/close must resolve back to the launching area rather than opening a second in-place flow.
- **Do NOT:**
  - **Anti-pattern: Local Dialog Clones** — do not render separate GitHub auth dialogs inside Explorer/onboarding/publish.
  - **Anti-pattern: New Global Entry Point** — do not add a command/menu/sidebar button that opens GitHub auth outside contextual launchers.
- **Acceptance:** supports ISC-2, ISC-3, ISC-6, ISC-9, ISC-11, ISC-A-2.
- **Status:** completed 2026-04-20.

### [x] GHA-03 — Create reusable inline launcher/status primitives and migrate Explorer to them
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - new `apps/desktop/src/components/layout/auth/github/GitHubAuthSummary.tsx`
  - optionally new `apps/desktop/src/components/layout/auth/github/GitHubAuthOutcomeNote.tsx`
  - `apps/desktop/src/components/apps/explorer/vcs/GitHubAuthBanner.tsx`
  - `apps/desktop/src/components/apps/explorer/vcs/VcsPanel.tsx` (only if imports change)
- **Reference code:**
  - current compact connected/disconnected copy/layout: `apps/desktop/src/components/apps/explorer/vcs/GitHubAuthBanner.tsx`
  - store-backed global overlay pattern: `apps/desktop/src/components/layout/ImageLightbox.tsx`
- **Expected shape:**
  ```tsx
  <GitHubAuthSummary
    variant="compact"
    authStatus={authStatus}
    onConnect={() => void openGitHubAuthDialog({ source: 'explorer' })}
    onDisconnect={() => void logout()}
    disconnectedCopy="Connect GitHub to push, fetch, and create PRs."
  />
  ```
- **Constraints:**
  - Explorer should become a launcher/status surface only,
  - keep a connected summary and disconnect affordance if still useful,
  - remove inline code/polling/success/error device-flow rendering from Explorer.
- **Do NOT:**
  - **Anti-pattern: Hidden Second Flow** — do not leave the old inline device-flow UI in Explorer while also adding the dialog.
  - **Anti-pattern: Surface-Specific Login Logic** — do not wire the Explorer button straight to `window.sero.github.login()`.
- **Acceptance:** supports ISC-1, ISC-2, ISC-6, ISC-12, ISC-A-2.
- **Status:** completed 2026-04-20.

### [x] GHA-04 — Refactor onboarding to launch the shared dialog and return to a connected step
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - `apps/desktop/src/components/profiles/onboarding/useOnboardingGitHubStep.ts`
  - `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx`
  - `apps/desktop/src/components/profiles/onboarding/GitHubConnectCard.tsx`
- **Reference code:**
  - current step gating/status refresh: `apps/desktop/src/components/profiles/onboarding/useOnboardingGitHubStep.ts`
  - current onboarding GitHub layout: `apps/desktop/src/components/profiles/onboarding/GitHubConnectCard.tsx`
- **Expected shape:**
  ```ts
  const handleConnectGitHub = async () => {
    const result = await openGitHubAuthDialog({ source: 'onboarding' });
    if (result.outcome === 'success') {
      await refreshStatus();
    }
  };
  
  // keep explicit Continue button; do not auto-advance after auth success
  ```
- **Constraints:**
  - onboarding still checks `refreshStatus()` before deciding whether to show the GitHub step,
  - the GitHub step must launch the shared dialog instead of rendering the flow inline,
  - after success, return users to a clearly connected onboarding state with an obvious Continue button,
  - remove copy that says users can connect later “from Explorer.”
- **Do NOT:**
  - **Anti-pattern: Surprise Advance** — do not auto-continue onboarding immediately after successful auth.
  - **Anti-pattern: Explorer Dependency Copy** — do not retain any copy that tells users to go to Explorer later.
- **Acceptance:** supports ISC-3, ISC-8, ISC-9, ISC-10, ISC-A-1, ISC-A-2.
- **Status:** completed 2026-04-20.

### [x] GHA-05 — Replace remote-origin auth dead ends with a direct connect path and safe auto-resume
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - `apps/desktop/src/components/layout/workspace/remote-origin-views.tsx`
  - optionally new `apps/desktop/src/components/layout/workspace/RemoteOriginGitHubAuthNotice.tsx`
  - `apps/desktop/src/components/layout/git-remote/workflow.ts` (fallback handling only if needed)
- **Reference code:**
  - existing blocked create path: `apps/desktop/src/components/layout/workspace/remote-origin-views.tsx`
  - structured auth failure contract: `apps/desktop/src/components/layout/git-remote/workflow.ts`
- **Expected shape:**
  ```ts
  const handleConnectGitHub = async () => {
    const result = await openGitHubAuthDialog({ source: 'remote-origin' });
    if (result.outcome !== 'success') return;
    if (!mountedRef.current) return;
    await handleCreate();
  };
  
  if (result.reason === 'auth') {
    setAuthRequired(true);
    return;
  }
  ```
- **Constraints:**
  - preserve repository form values while auth is pending,
  - when auth blocks the explicit create action, offer `Connect GitHub` in the same view,
  - after successful auth, resume create only if the component is still mounted and the blocked action was the GitHub create path,
  - keep `createGitHubOrigin()` auth fallback intact even if the view preflights status,
  - if `remote-origin-views.tsx` approaches the 500 LOC limit, extract the auth callout into a new file.
- **Do NOT:**
  - **Anti-pattern: Sidebar First** — do not leave or reintroduce “connect in the sidebar first” copy.
  - **Anti-pattern: Lost Form Context** — do not reset name/description/visibility when the dialog opens or closes.
  - **Anti-pattern: Blind Resume** — do not auto-create a repo after a generic proactive connect click.
- **Acceptance:** supports ISC-1, ISC-4, ISC-7, ISC-9, ISC-10, ISC-A-1, ISC-A-3.
- **Status:** completed 2026-04-20.

### [x] GHA-06 — Replace titlebar publish dead ends with a direct connect path and safe auto-resume
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishSection.tsx`
  - optionally new `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishGitHubPane.tsx`
  - optionally new `apps/desktop/src/components/layout/titlebar/git/useGitRemotePublishGitHub.ts`
- **Reference code:**
  - current publish auth handling: `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishSection.tsx`
  - remote-origin resume pattern from GHA-05 should be reused rather than re-invented.
- **Expected shape:**
  ```ts
  const handleConnectForPublish = async () => {
    const result = await openGitHubAuthDialog({ source: 'publish' });
    if (result.outcome !== 'success') return;
    if (!shouldResumeBlockedPublish || !mountedRef.current) return;
    await handleCreateGitHub();
  };
  ```
- **Constraints:**
  - GitHub publish mode must offer a direct `Connect GitHub` action when disconnected,
  - when the user was explicitly blocked during `Create repo + publish`, resume that exact action after successful auth if still mounted,
  - proactive connect clicks should only refresh the UI, not auto-create a repo,
  - keep the “existing remote” mode unchanged,
  - extract helpers if this file nears/exceeds 500 LOC.
- **Do NOT:**
  - **Anti-pattern: Dead-End Feedback** — do not leave auth errors as plain text with no direct action.
  - **Anti-pattern: Shared-State Guessing** — do not trust old `githubStatus` without a fresh `refreshStatus()` before retry/resume.
  - **Anti-pattern: Copy Drift** — do not ship any “connect in the sidebar” or “go to Explorer” instruction here.
- **Acceptance:** supports ISC-1, ISC-5, ISC-7, ISC-8, ISC-12, ISC-A-1, ISC-A-3.
- **Status:** completed 2026-04-20.

### GHA-07 — Add/update tests for controller, dialog, onboarding, remote-origin, and publish flows
- **Plan artifact:** `.pi/plans/2026-04-20-github-auth-unification/plan.md`
- **Files:**
  - new `apps/desktop/src/stores/github-auth.test.ts` or `apps/desktop/src/components/layout/auth/github/GitHubAuthDialog.test.tsx`
  - update `apps/desktop/src/hooks/useGitHubAuthFlow.test.tsx`
  - update `apps/desktop/src/components/profiles/onboarding/useOnboardingGitHubStep.test.tsx`
  - new `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishSection.test.tsx`
  - new targeted test for remote-origin auth-required behavior (either new view test or expanded `RemoteOriginManager.test.tsx`)
  - keep `apps/desktop/src/components/layout/git-remote/workflow.test.ts` aligned if fallback behavior changes
- **Reference code:**
  - dialog failure test pattern: `apps/desktop/src/components/layout/auth/AuthLoginDialog.test.tsx`
  - auth hook timer/status pattern: `apps/desktop/src/hooks/useGitHubAuthFlow.test.tsx`
  - remote-origin error-surface pattern: `apps/desktop/src/components/layout/workspace/RemoteOriginManager.test.tsx`
  - workflow contract coverage: `apps/desktop/src/components/layout/git-remote/workflow.test.ts`
- **Expected shape:**
  ```ts
  it('resolves one shared dialog request and resumes publish only after success', async () => {
    // open dialog from publish surface
    // cancel => retry path remains visible
    // success => reruns handleCreateGitHub exactly once
  });
  ```
- **Constraints:**
  - cover cancel, generic failure, connected success, and safe auto-resume,
  - include at least one assertion that no UI tells users to go to Explorer/sidebar first,
  - verify that blocked create/publish flows still offer a visible retry path after cancel.
- **Do NOT:**
  - **Anti-pattern: Manual-Only Verification** — do not rely on smoke tests alone for the new controller/dialog behavior.
  - **Anti-pattern: Implementation-Coupled Assertions** — prefer user-visible outcomes and action counts over brittle internal-state snapshots.
- **Acceptance:** provides thorough regression coverage for ISC-1 through ISC-12 and ISC-A-1 through ISC-A-3.
