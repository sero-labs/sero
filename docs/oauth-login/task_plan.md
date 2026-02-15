# Task: OAuth Login Support in Sero

## Goal
Support `/login` and `/logout` for Pi OAuth providers in Sero's desktop app, 
bridging the same `AuthStorage.login()` flow that Pi's interactive TUI mode uses,
but over Electron IPC with a React dialog UI.

## Context
- Pi CLI's `/login` only works in interactive TUI mode (not SDK/headless mode)
- Sero decoupled from Pi CLI and uses its own `~/.sero-ui/agent/auth.json`
- `AuthStorage.login(providerId, callbacks)` from `@mariozechner/pi-coding-agent` drives the OAuth flow
- The callbacks (`onAuth`, `onPrompt`, `onProgress`, `onManualCodeInput`) are what need UI
- `getOAuthProviders()` from `@mariozechner/pi-ai` lists available providers
- Sero uses the standard 4-layer IPC pattern: React → Store → Preload → Main → SDK

## Architecture Decision
**Bridge `AuthStorage.login()` callbacks over IPC** — the main process drives the 
OAuth flow; the renderer shows a dialog. This reuses all Pi SDK OAuth logic.

Key design choices:
- Main process holds the login flow + pending Promise resolvers for prompts
- Renderer subscribes to `sero:auth:event` push channel for UI state changes  
- Renderer sends responses back via `sero:auth:respond-prompt` / `sero:auth:cancel`
- Browser opens via Electron's `shell.openExternal()` (better than exec)
- Dialog uses existing shadcn Dialog + Input components

## Phases

### Phase 1: IPC Types — `src/types/ipc.ts` ✅
Add auth-related types and channels:
- `OAuthProviderInfo` — id, name, isLoggedIn, usesCallbackServer
- `OAuthEvent` — discriminated union for auth flow events
- `IpcChannels.auth.*` — channel constants

### Phase 2: Main Process Handler — `electron/ipc/auth.ts` ✅
New file with:
- `getProviders()` — lists providers with login status
- `login(providerId)` — starts OAuth flow, bridges callbacks to IPC events
- `logout(providerId)` — removes credentials
- `respondPrompt(value)` / `respondManualCode(value)` — resolves pending promises
- `cancel()` — aborts current login
- Register in `electron/ipc/index.ts`

### Phase 3: Preload Bridge — `electron/preload.ts` ✅
Expose `window.sero.auth`:
- `getProviders()`, `login()`, `logout()`
- `respondPrompt()`, `respondManualCode()`, `cancel()`
- `onEvent(callback)` — subscribe to auth events

### Phase 4: Type Declarations — `src/types/electron.d.ts` ✅
Add `SeroAuthAPI` interface and include in `SeroAPI`.

### Phase 5: React Dialog — `src/components/layout/AuthLoginDialog.tsx` + `AuthLoginViews.tsx` ✅
Self-contained dialog component (split into orchestrator + sub-views):
- Provider list with login status badges
- Auth URL display (clickable) + progress states
- Prompt/manual-code input handling
- API key entry with show/hide toggle
- Success/error states
- Triggered from ChatPanel slash command

### Phase 6: Integration — Wire dialog into app ✅
- Add auth store or local state in dialog
- Trigger from slash command menu (`/login`, `/logout`)
- Refresh model state after login/logout

## Files to Create/Modify
- `src/types/ipc.ts` — add auth types + channels
- `electron/ipc/auth.ts` — new file
- `electron/ipc/index.ts` — register auth handlers
- `electron/preload.ts` — add auth bridge
- `src/types/electron.d.ts` — add auth API types
- `src/components/layout/AuthLoginDialog.tsx` — new file (dialog orchestrator)
- `src/components/layout/AuthLoginViews.tsx` — new file (sub-views)
- `src/components/layout/ChatPanel.tsx` — integration (/login, /logout interception)
