# PR #177 Review — `feat(desktop): add provider-aware workspace runtimes`

**PR:** https://github.com/sero-labs/sero/pull/177
**Branch:** `feat/docker-runtime` → `main`
**Head SHA at review time:** `76289c4b186449bfbcadb571e669b02841f43c96`
**Reviewer:** Claude (Opus 4.7), 2026-05-15

---

## Pass 1–4 summary

271 files, +24,080/−3,484, ~80 commits including ~10 visible self-review iteration rounds (P1.1 through P3.4, plus "final review matrix"). This is a runtime architecture migration that introduces `RuntimeBackend` as a seam over Apple Container / Docker / POSIX Host, migrates legacy `container?: boolean` / `mac-host` config, and re-routes editor terminal, GitRunner, LSP, dev servers, IPC, file ops, and Doctor through the seam. Hot spots reviewed: Docker CLI shelling, host path containment, preview bridge/port pool, dev-server lifecycle, IPC migration, browser session split.

The code is in better shape than the diff size suggests — most of the obvious sharp edges (shell quoting, env-key validation, mount comma rejection, port assertion, workspace-id safety) have already been hardened in the P1–P3 passes. Findings below are what survived.

---

## 🟡 Important

### `apps/desktop/electron/features/container/tools/tools-browser-agent.ts:96-106` — Python single-quote interpolation of a shell-escaped path

**What:** `readImageAsBase64` builds `python3 -c "...open('${shellEscape(imagePath)}','rb')..."`. `shellEscape` produces shell-safe output, but it's then dropped inside a Python single-quoted literal. The two escape syntaxes don't compose.

**Why it matters:** Any imagePath containing a single quote (or other Python-string-special char) corrupts the Python literal and the command fails — or worse, the shell-escape sequence `'\''` ends up inside the Python source where it parses as `'` + bareword + `'`. Screenshot paths today are agent-controlled, so realistic exposure is low, but this is a foot-gun whenever any caller threads a less-controlled path through.

**Suggestion:** pass the path via env var (`PATH=... python3 -c '...open(os.environ["PATH"]...)'`), or base64-encode the path and decode inside Python. Either removes both escape layers.

### `apps/desktop/electron/features/workspace/runtime/runtime-manager.ts:195-212` — `destroy` / `destroyAll` leak entries on partial failure

**What:** Both methods `await Promise.all(...destroy())` and then unconditionally `backends.delete(key)`. If one backend's `destroy()` rejects, `Promise.all` rejects and the subsequent `delete` loop never runs — the failed (and successful!) backends stay cached in `this.backends`.

**Why it matters:** Next `getRuntime(workspaceId)` returns the stale backend whose container has already been `docker rm -f`'d. Subsequent ops fail with confusing "container not found" errors. The `destroy()` of `DockerBackend` calls `docker rm -f` which is best-effort but can plausibly time out under load (it has a 30s timeout).

**Suggestion:** wrap in `try { await Promise.allSettled(...) } finally { for (const [key] of runtimes) { unsubscribe; delete } }`.

### `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts:115-137` — `exec` honors `isolated`, `execFile` doesn't

**What:** `exec(input)` branches on `input.isolated` to call `ensureWithOptions({ isolated })`. `execFile(input)` only calls `this.ensure()` (which is `ensureWithOptions()` with undefined isolation).

**Why it matters:** Callers that migrated to argv-form (`execFile`) silently lose the isolation toggle. If any internal command path was migrated from `exec` to `execFile` as part of the GitRunner/internal-commands refactor and relied on `isolated`, that semantics changed. Since `RuntimeExecFileInput` may not even have an `isolated` field, this is "invisible by type" but still a regression vector to verify intent on.

**Suggestion:** either extend `RuntimeExecFileInput` with `isolated` and branch the same way `exec` does, or document explicitly that `execFile` is non-isolated by design.

### `apps/desktop/electron/features/workspace/runtime/backends/docker/docker-backend.ts:227` — dev-server log path collision

**What:** `const command = ...> ${input.logPath ?? '/tmp/sero-dev-server.log'} 2>&1 &`. Default log path is the same string for every dev server in the workspace.

**Why it matters:** Two concurrent dev servers in the same workspace interleave writes to one file. The framework field on `RuntimeDevServer` suggests multi-server-per-workspace is in scope. Also: `input.logPath` is interpolated unquoted — if any caller passes a logPath with a space or `;`, the command breaks.

**Suggestion:** default to `/tmp/sero-dev-server-${input.scope}-${input.cardId ?? 'root'}-${port?}.log` or similar, and `shellQuote` the value before interpolation.

### `apps/desktop/electron/features/workspace/runtime/backends/preview-bridge.ts:24` — workspaceId interpolated into shell redirect without local assertion

**What:** `>/tmp/${marker}.log` where `marker` contains `${workspaceId}`. `workspaceId` is *not* validated locally — the function relies entirely on the upstream `assertSafeWorkspaceId` guarantee enforced at registry load / ID creation.

**Why it matters:** This is a defense-in-depth gap. The current registry path enforces the regex, but anything that constructs a `DockerPortManager` outside that path (tests, future code paths, a workspace recovered from a corrupted registry file in a way that bypasses the L77 check) escapes the guarantee. Same pattern repeats in `dockerContainerName`/labels — the cost of a one-line `assertSafeWorkspaceId(workspaceId)` at the top of the bridge command builder is negligible.

**Suggestion:** add `assertSafeWorkspaceId(workspaceId)` at the top of `previewBridgeMarker` (and consider a unit test that passes `"foo; rm -rf /"` and expects throw).

### `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts:434-454` — host SAFE_INHERITED_ENV_KEYS allow-list is narrow

**What:** Inherited env restricted to `PATH, HOME, USER, LOGNAME, LANG, TERM, SHELL, TMPDIR, TMP, TEMP, LC_*`. Spawned processes do not see `NVM_DIR`, `FNM_DIR`, `NODE_OPTIONS`, `GIT_SSH_COMMAND`, `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `npm_config_*`, corporate auth vars, etc.

**Why it matters:** Host runtime is now the primary local dev surface on macOS/Linux. A user in a corporate env (custom certs, proxies, nvm/fnm-managed Node) will silently get a different runtime environment than their shell — symptoms will be "git over ssh works in my terminal but not in Sero", "npm install hits the wrong registry", "node can't find the version manager's binary". Login shell (`bash --login` / `--login -c`) recovers *some* of this via dotfiles, but only what dotfiles re-export.

**Suggestion:** at minimum add `NVM_DIR`, `FNM_DIR`, `GIT_*`, `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`, `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS`, `npm_config_*` prefix. Or invert: deny-list known-dangerous keys (e.g., `LD_PRELOAD`, `DYLD_*`) instead of strict allow-list.

### `apps/desktop/electron/features/workspace/runtime/backends/host/host-dev-server-manager.ts:75-77` — default cwd `/workspace` is a container-namespace path on host

**What:** `const cwd = input.cwd || '/workspace';` then passed to `this.spawn({ cwd })`. The injected spawn is `HostBackend.spawn`, which calls `resolveHostPath` and treats `/workspace` as a runtime-workspace path (translates to `hostWorkspacePath`). So it happens to work — but only because of the runtime-paths special case.

**Why it matters:** This is a hidden coupling — the *manager* hardcodes a container-namespace string that is only meaningful because the *backend* translates it. If a future caller passes a translated path here or the runtime-paths convention changes, the fallback silently points to the wrong place. Reading the file in isolation the line is misleading.

**Suggestion:** take cwd default from the runtime backend (pass it in via options), or document the coupling explicitly. Same pattern in `register` at L141.

---

## 🟢 Nit

- **`apps/desktop/electron/features/workspace/runtime/backends/docker/docker-ports.ts:72-74`** — `dockerPreviewPublishArgs` is duplicated. The one in `docker-lifecycle.ts:125` is the live one; this one isn't imported. Delete.
- **`apps/desktop/electron/features/workspace/runtime/backends/host/posix-substrate.ts:73`** — terminal fallback `process.env.SHELL ?? '/bin/zsh'`. On Linux the default shell isn't zsh — `/bin/bash` or `/bin/sh` are safer fallbacks.
- **`apps/desktop/electron/features/workspace/runtime-resolution.ts:206`** — `containerEnabled = validatedBackend !== 'host'`. Naming reads as boolean-for-Docker-presence but is really "non-host". Renaming to `usesContainerRuntime` (or just deleting in favour of `actualRuntime === 'container'`) would prevent future misreads.

---

## 💡 Discussion

**Trust boundary for workspace IDs.** The team chose registry-load + `ensureUniqueId` as the single chokepoint enforcing `isSafeWorkspaceId`. That's defensible, but the chokepoint pattern only works if *every* path that constructs a `RuntimeBackend` or interpolates a workspaceId into a shell command flows through it. Have you considered an explicit `WorkspaceId` branded type (`type WorkspaceId = string & { __brand: 'WorkspaceId' }`) returned only by sanitizing constructors, so TS prevents raw strings from sneaking past?

**PR scope.** 24k lines, 271 files in a single PR is hard to bisect later when a regression surfaces. The commit log shows the team already did substantial review work — but a future incident in (say) preview-bridge will git-blame to a commit inside this monster PR with limited context. Worth at minimum tagging the commit boundary between phases (e.g., `runtime-seam: complete`, `docker-backend: complete`) so future readers can navigate.

**Apple Container live-mount semantics.** `AppleContainerBackend.destroy` (L143) now mirrors Docker's `rm -f` instead of just stopping (P2.6). This means workspace runtime resets discard any in-container state — fine for the live-mount model where `/workspace` is the source of truth, but anything outside `/workspace` (apt-installed packages, `~` files written during a session, LSP server caches at `$HOME/.local`) is lost. Is that the intent for Apple Container, or is there a state-preserving path users should know about?

---

## Summary

The runtime seam is well-shaped and the obvious shell/quoting/escape hazards are mostly handled. Important findings cluster around (1) lifecycle/cleanup robustness under partial failure (`runtime-manager.destroy`), (2) defense-in-depth gaps where invariants are enforced once at a chokepoint rather than locally (preview-bridge workspaceId, container cwd defaults), and (3) the new host runtime's env propagation, which will likely surface as user-visible breakage on corp-managed machines. None I'd block on independently, but I'd want `runtime-manager.destroy` cleanup and the env allow-list addressed before broad release — both are small fixes.

## Out of scope but worth a ticket

- Host `HostBackend.collectEntries` (L380) has no depth limit and `realpath`s every child; large repos will produce O(n) syscalls per directory listing.
- `HostBackend.spawn` (L177) attaches data/exit listeners with no removal path — minor leak if callers don't `signal()`.
- `runtime-manager.ts` legacy `containerManager.devServers` fallback runs in parallel with new backend dev-server registration; double-listing is possible during the transition window when both paths emit for the same server.

## What I couldn't verify

- Runtime smoke tests on each platform (the PR points to manual smoke docs — those are the source of truth I can't exercise).
- Behaviour with concurrent workspaces (multiple runtimes racing on shared resources: preview-bridge nodes inside the container, host port discovery via `lsof`/`ss`).
- Whether any IPC contract change is observed by an older renderer build during dev/upgrade — the legacy fallbacks in `runtime-manager` suggest yes, but exhaustive coverage of the boundary would need a full IPC channel inventory diff.
- That the `agent-browser` CLI install path inside the container is idempotent across runtime image upgrades (the image-id check in `isExpectedContainer` should re-create on tag drift, but I didn't trace the npm-install flow end-to-end).
- The pi-coding-agent / pi-agent-core surface (`@mariozechner/*`) used by the browser/coding tools — I didn't check whether the runtime seam changes affect Pi session lifecycle assumptions.
