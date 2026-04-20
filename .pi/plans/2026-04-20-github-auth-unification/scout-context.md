# Context for: Unified GitHub authentication UX in Sero

## Relevant Files
- `apps/desktop/src/hooks/useGitHubAuthFlow.ts` — shared renderer hook for GitHub device-flow state, copy feedback, login/logout/cancel, and `window.sero.github.*` IPC calls. Used by both Explorer and onboarding.
- `apps/desktop/src/components/apps/explorer/vcs/GitHubAuthBanner.tsx` — inline GitHub login banner in the VCS panel; currently the main visible auth surface for the Explorer path.
- `apps/desktop/src/components/layout/workspace/RemoteOriginManager.tsx` — remote-origin dialog that now only loads origin state; auth failures are surfaced indirectly inside sub-views.
- `apps/desktop/src/components/layout/workspace/remote-origin-views.tsx` — origin create/connect views. `CreateGitHubView` is where GitHub-auth failure is shown (`reason === 'auth'`) and it tells users to connect “in the sidebar first.”
- `apps/desktop/src/components/layout/git-remote/workflow.ts` — shared workspace git workflow helpers. `createGitHubOrigin()` checks auth by calling `window.sero.github.status()` before creating a repo.
- `apps/desktop/src/components/layout/titlebar/git/GitRemotePublishSection.tsx` — second GitHub publish/create path. It also checks GitHub status and emits its own “connect in the sidebar” auth copy.
- `apps/desktop/src/components/profiles/onboarding/GitHubConnectCard.tsx` — onboarding GitHub step UI. It reimplements the same device-flow states/copy/cancel/success/error display as the Explorer banner.
- `apps/desktop/src/components/profiles/onboarding/useOnboardingGitHubStep.ts` — onboarding flow controller that calls `useGitHubAuthFlow()` and gates the onboarding step.
- `apps/desktop/src/components/profiles/OnboardingWizard.tsx` and `apps/desktop/src/components/profiles/onboarding/SetupScreen.tsx` — onboarding flow entry points that render `GitHubConnectCard`.
- `apps/desktop/src/components/layout/auth/AuthLoginDialog.tsx` — existing reusable “global dialog” pattern for auth, but it is for generic providers/API keys via `window.sero.auth.*`, not GitHub.
- `apps/desktop/electron/features/auth/github/auth-manager.ts` — Electron-side GitHub OAuth device-flow manager; owns token storage, login/open-browser/polling/logout, and GitHub API env injection.
- `apps/desktop/electron/ipc/integrations/github.ts` — IPC handler layer for GitHub status/login/logout/cancel/createRepo.
- `apps/desktop/electron/preload/apps/app-domain.ts` — preload bridge exposing `window.sero.github.status/login/logout/cancel/onEvent/createRepo`.
- `apps/desktop/src/types/electron-services.d.ts` — renderer-side bridge types for GitHub auth events/status.
- `apps/desktop/src/components/layout/workspace/RemoteOriginManager.test.tsx` and `apps/desktop/src/components/layout/git-remote/workflow.test.ts` — important existing tests covering auth/error behavior and repo creation fallback logic.

## Project Structure
- GitHub auth is implemented as a **single Electron main-process authority** (`GitHubAuthManager`) with renderer access through `window.sero.github.*`.
- Renderer UI is currently split across multiple surfaces:
  - Explorer VCS banner
  - onboarding card
  - remote-origin creation error text
  - titlebar publish section auth hint
- There is **no dedicated shared GitHub auth dialog/surface** yet; only the hook is shared, and the UI is duplicated.
- `AuthLoginDialog` shows the project already uses a reusable dialog pattern for auth-like flows; GitHub could follow a similar “shared dialog + entry points” model.

## Conventions
- Keep source files under 500 LOC. Relevant files are already close enough to care about:
  - `auth-manager.ts` 373 LOC
  - `AuthLoginDialog.tsx` 353 LOC
  - `remote-origin-views.tsx` 392 LOC
  - `GitRemotePublishSection.tsx` 293 LOC
- The repo favors small extracted subviews/helpers for dialogs and workflows (`remote-origin-views.tsx`, `AuthLoginViews.tsx`, etc.).
- `useEffect` is used sparingly, mostly for IPC/event subscriptions or open/close transitions triggered by external state; that pattern already exists in `useGitHubAuthFlow` and the dialog components.
- Cross-process data flow is expected to stay aligned across renderer ↔ preload ↔ main ↔ Pi SDK; GitHub auth changes should preserve that boundary.

## Current OAuth / Device-Flow Architecture
- Main process:
  - `GitHubAuthManager.login()` requests a device code, opens the GitHub verification URL, polls for token, verifies the token against `/user`, then stores the token encrypted with `safeStorage`.
  - Cached token is loaded from disk on startup and used to build `GH_TOKEN` plus git auth env vars for containers.
- IPC:
  - `status`, `login`, `logout`, `cancel`, and `createRepo` are exposed on `IpcChannels.github`.
  - Login progress is broadcast as `IpcChannels.github.event` and consumed in the renderer.
- Renderer hook:
  - `useGitHubAuthFlow()` subscribes to `window.sero.github.onEvent`, fetches status on mount, and exposes `startLogin/logout/cancel/copyCode`.
- Workspace git flow:
  - `createGitHubOrigin()` checks auth with `window.sero.github.status()` before invoking repo creation.
  - `RemoteOriginManager` itself only fetches current remotes; auth is not part of its open-state flow.

## How RemoteOriginManager Surfaces GitHub Auth Failures
- The actual auth failure path is not in `RemoteOriginManager.tsx`; it comes from `createGitHubOrigin()` in `workflow.ts`.
- When GitHub is unauthenticated, `createGitHubOrigin()` returns `{ ok: false, reason: 'auth', authStatus }`.
- `CreateGitHubView` maps that to a plain inline message: “Not authenticated with GitHub. Connect your GitHub account in the sidebar first.”
- `GitRemotePublishSection` maps the same auth failure to: “GitHub is not connected. Connect it in the sidebar first, then retry.”
- That means the same underlying failure is currently explained in at least two different places with different copy and no direct action to start login.

## Existing Shared GitHub Auth Surface / Reuse Potential
- **Shared hook exists:** `useGitHubAuthFlow()` is the only true reusable auth primitive in the renderer right now.
- **Shared UI does not exist:** both `GitHubAuthBanner` and `GitHubConnectCard` render the same flow states independently.
- `AuthLoginDialog` is a strong precedent for a centralized auth dialog pattern, but it cannot be reused directly for GitHub because it speaks to a different IPC domain (`window.sero.auth.*`).
- `RemoteOriginManager` and `GitRemotePublishSection` already rely on `workflow.ts`, so a reusable GitHub auth surface could be co-located there or in a new shared `components/layout/auth/github/` or `components/layout/git-remote/` area.

## Global Dialog / Modal / Action Patterns
- The app already opens dialogs from many entry points by hoisting `open` state in the parent and rendering the dialog near the relevant shell surface:
  - `AuthLoginDialog` from Chat/Onboarding
  - `ThemePanel`, `ModelManagerDialog`, `ConnectDeviceDialog` from the shell/command menu
  - `RemoteOriginManager` from workspace tree actions
- This suggests two viable patterns for GitHub auth:
  1. a globally mounted dialog/sheet controlled by shared state or a shell-level controller
  2. a shared GitHub auth component rendered inline in multiple places but sourced from one implementation
- There is no obvious existing app-wide modal registry/store for arbitrary dialogs; current patterns are prop-driven and local.

## Concrete Implementation Options
### Option A — Extract a reusable GitHub auth surface and use it inline wherever needed
- Create a shared component around `useGitHubAuthFlow()` that can render compact/expanded states (idle, code, polling, success, error, authenticated).
- Use it in Explorer, onboarding, remote-origin auth error state, and publish section.
- Pros: lowest architectural risk; easy to adopt incrementally; keeps context-specific copy possible.
- Cons: still multiple entry points; the “login from anywhere” experience depends on each caller rendering the shared component.

### Option B — Centralize GitHub auth into a shared dialog/sheet and trigger it from any area
- Add a shell-level GitHub auth dialog controller, similar in spirit to `AuthLoginDialog`, but for GitHub device flow.
- Expose a small imperative or store-backed “openGitHubAuth(reason/source)” API so any area can request login.
- Pros: best for a unified, obvious login path; no disconnected auth UX; can show one consistent flow.
- Cons: more plumbing; requires new global state/controller and deciding how callers subscribe to completion/error results.

### Option C — Hybrid: shared auth dialog plus inline summary card/banner
- Use one shared GitHub auth dialog for the actual login flow and keep lightweight inline status pills/banners in Explorer/onboarding/publish surfaces.
- Error states like `reason === 'auth'` can surface a button that opens the shared dialog instead of showing only text.
- Pros: good balance of discoverability and compactness; avoids duplicating the flow UI.
- Cons: still need some duplication of “connected/auth required” status display.

## Key Findings
- The current “sidebar first” message is the biggest UX smell: GitHub login is already globally available in the Electron host, but the renderer only advertises it in one main banner and in a few disconnected fallback messages.
- The device-flow implementation is already unified at the main-process level; the missing piece is a **unified renderer entry surface** and consistent “connect GitHub” action wiring.
- `RemoteOriginManager` itself is not the source of the auth failure; it only delegates to `workflow.ts`, which does the auth check before repo creation.
- There is no shared GitHub auth dialog/hook combo yet; extracting one is the likely path to a coherent UX.

## Gotchas
- `window.sero.github.status()` is the source of truth for auth state; callers should not infer auth from prior UI state alone.
- `GitHubAuthManager` stores tokens using `safeStorage`; auth is tied to OS keychain availability and can fail with a persistence-related error.
- The login flow uses a global IPC event channel; if multiple GitHub auth surfaces mount concurrently, they will all observe the same progress stream unless the UI architecture scopes the listener carefully.
- Because the codebase enforces the 500 LOC limit, any centralization should likely split into a small controller/hook plus smaller presentational subviews rather than a single mega-component.
