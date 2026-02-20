# Unified GitHub OAuth Authentication

## Status
- State: In Progress
- Updated: 2026-02-20

## Goal
Replace the split authentication model (SSH for jj/git push, separate `gh auth login` for GitHub CLI) with a single GitHub OAuth Device Flow login from the Electron host. Login once, authenticated everywhere — host and containers, for both git operations and `gh` CLI.

## Problem
Currently:
1. `jj git push/fetch` over SSH requires SSH keys + `StrictHostKeyChecking=accept-new` TOFU hack
2. `gh pr create` requires its own `gh auth login` inside each container runtime
3. Users see errors like: "To get started with GitHub CLI, please run: gh auth login"
4. Two unrelated auth mechanisms, neither automatically provisioned

## Solution
Use GitHub's **OAuth Device Flow** from the Electron app:
1. User clicks "Login with GitHub" once in Sero settings
2. Sero obtains an OAuth token via device flow (code displayed → user authorizes in browser)
3. Token is stored securely on host (encrypted in `~/.sero-ui/agent/github-auth.json`)
4. For all command execution (host + container), inject:
   - `GH_TOKEN=<token>` — authenticates `gh` CLI automatically
   - Git credential config — rewrites URLs to use HTTPS + token instead of SSH
5. SSH workarounds are removed; all git traffic goes over HTTPS with token auth

## Architecture

### Token Injection Points

```
Electron main process
├── GitHubAuthManager (new)
│   ├── Device Flow OAuth
│   ├── Token storage (safeStorage + file)
│   └── Token refresh (if using GitHub App)
│
├── ContainerManager.exec()
│   └── Injects GH_TOKEN + git credential env vars into env prefix
│
├── JjRunner.runCommand()
│   ├── Container path: token injected via ContainerManager.exec()
│   └── Host path: token injected via execFileAsync env option
│
└── IPC handlers
    ├── sero:github:login   — trigger device flow
    ├── sero:github:logout  — clear token
    └── sero:github:status  — check auth state
```

### Git HTTPS Token Auth (no SSH needed)

Instead of SSH, configure git to use the OAuth token over HTTPS via environment variables:

```bash
# Injected into every container exec and host execFileAsync:
export GH_TOKEN="<token>"
export GIT_ASKPASS="/usr/bin/gh"       # gh acts as credential helper when GH_TOKEN is set
export GIT_TERMINAL_PROMPT=0           # never prompt for credentials interactively
```

When `GH_TOKEN` is set and `GIT_ASKPASS` points to `gh`, the GitHub CLI transparently provides credentials for any `git push/fetch/clone` to github.com. This works for both direct git commands and jj's internal git operations.

For SSH-format remotes (`git@github.com:...`), we also add a URL rewrite:
```bash
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="url.https://github.com/.insteadOf"
export GIT_CONFIG_VALUE_0="git@github.com:"
```

This transparently converts SSH remotes to HTTPS so the token auth works regardless of how the remote was originally configured.

## Phases

### Phase 1: GitHub Auth Manager (backend)
- [x] Create `electron/github/auth-manager.ts`
  - [x] Device Flow implementation (POST to github.com/login/device/code, poll for token)
  - [x] Token storage using Electron safeStorage + file
  - [x] Token retrieval, status check, logout
  - [x] `getAuthEnvVars()` returns GH_TOKEN + GIT_ASKPASS + URL rewrites
  - [x] Singleton export in shared-infra.ts
- [x] Register a GitHub OAuth App (client_id for device flow)

### Phase 2: Token Injection into Command Execution
- [x] Update `ContainerManager.exec()` to inject GitHub env vars via `getExtraEnvVars` callback
- [x] Update `JjRunner.runCommand()` host path to inject env vars into `execFileAsync`
- [x] Remove SSH `StrictHostKeyChecking=accept-new` workaround from JjRunner
- [x] Add `GH_TOKEN`, `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT`, and URL rewrite env vars

### Phase 3: IPC + Preload Bridge
- [x] Add IPC channels: `sero:github:login`, `sero:github:logout`, `sero:github:status`, `sero:github:cancel`
- [x] Add preload bridge methods
- [x] Add types to `electron.d.ts` (`SeroGitHubAPI`, `GitHubAuthStatus`, `GitHubDeviceFlowEvent`)
- [x] Register handlers in `ipc/index.ts`
- [x] Update error messages in pr-ops.ts to reference Sero GitHub login instead of `gh auth login`

### Phase 4: Settings UI
- [ ] Add GitHub auth status + login/logout button to Settings panel
- [ ] Show auth state in Source Control panel header

### Phase 5: Cleanup
- [ ] Remove `openssh-client` from Dockerfile (no longer needed for git auth)
- [ ] Update docs (version-control-user-flow.md, global AGENTS.md)

## Risks
- **GitHub rate limits**: OAuth tokens have higher limits than unauthenticated, but heavy `gh pr list` polling could hit them. Consider caching PR lookups.
- **Token expiry**: Device flow tokens don't expire unless revoked. If using GitHub App tokens, need refresh logic.
- **Non-GitHub remotes**: GitLab, Bitbucket etc. won't work with this flow. Keep SSH as fallback for non-github.com remotes.
- **Private org repos**: Token scopes must include `repo` for full access. Device flow supports requesting scopes.

## Progress Log
- 2026-02-20: Plan created.
- 2026-02-20: Implemented Phases 1–3. GitHub OAuth Device Flow auth manager, token injection into ContainerManager.exec() and JjRunner host path, IPC/preload bridge, types. Removed SSH TOFU workaround from JjRunner. Updated PR error messages.
