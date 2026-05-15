# PR #177 Review

**PR:** https://github.com/sero-labs/sero/pull/177
**Branch:** `feat/docker-runtime`
**Verdict:** Needs changes

This review was split across runtime seam, Host, Docker/Apple/browser, and renderer/docs because the PR is very large.

## Scope note

Windows host mode / WSL-backed host execution is intentionally deprecated for PR #177. Windows uses Docker exclusively. WSL path translation, `WSLENV`, mixed-distro handling, and WSL localhost-forwarding diagnostics are out of scope and should not be treated as required PR behavior.

## P1 findings

1. **Host coding `read`/`edit` tools use `/workspace/...` inside shell commands**
   - `apps/desktop/electron/features/container/tools/tools.ts:27-31`
   - `apps/desktop/electron/features/container/tools/tools-coding.ts:184-198,232,363`
   - `HostBackend.exec()` translates only `cwd`, not absolute paths embedded in command strings. A normal host-runtime `read("foo")` becomes `cat '/workspace/foo'` on the real host and can fail unless `/workspace` exists.
   - Fix: use `runtime.readFile/writeFile` for file tools or add a backend path-rendering API.

2. **Host symlink escape bypasses workspace-root containment**
   - `apps/desktop/electron/features/workspace/runtime/backends/host/host-backend.ts`
   - POSIX file ops use lexical path checks and do not canonicalize symlinks. `/workspace/outside -> /etc` can escape the workspace.
   - Fix: canonicalize existing targets/parents with `realpath` and re-check containment.

3. **`isolated` workspace command execution is ignored**
   - `apps/desktop/electron/features/workspace/runtime/run-workspace-command.ts:26`
   - `void options` drops `{ isolated: true }`, changing verification/smoke command isolation semantics.
   - Fix: preserve isolated config behavior through the runtime seam.

4. **Runtime resolution probes legacy `containerManager` for Docker state**
   - `apps/desktop/electron/features/workspace/runtime-resolution.ts`
   - Docker availability/status can be reported from Apple Container legacy inspection.
   - Fix: resolve via `RuntimeBackend`/`RuntimeManager` or backend-specific inspectors.

5. **IPC dev-server stop/restart cannot handle legacy registered servers**
   - `apps/desktop/electron/ipc/container/dev-server.ts:87-105`
   - IDs are workspace-prefixed, so handlers route to runtime first and never fall back when the server is legacy.
   - Fix: mirror CLI behavior: try runtime, fall back to `containerManager.devServers`.

6. **Apple `execFile` env keys are not shell-safe**
   - `apps/desktop/electron/features/workspace/runtime/backends/apple-container-backend.ts:160`
   - Env values/argv are quoted, but env keys are interpolated raw.
   - Fix: validate keys with `/^[A-Za-z_][A-Za-z0-9_]*$/` or use native `-e KEY=VALUE` args.

7. **Runtime picker click bubbles to workspace row**
   - `apps/desktop/src/components/layout/workspace/workspace-tree/RuntimePickerMenu.tsx:80`
   - Clicking runtime icon also toggles/selects the workspace row.
   - Fix: stop propagation on trigger click/keyboard interaction and add a regression test.

## P2 findings

- Linux Host terminal fallback uses `/bin/zsh` when `SHELL` is unset; doctor checks bash.
- Host dev-server stop unregisters before verifying process/descendants actually exited.
- Host LSP initializes with `/workspace` URI while process runs on host paths.
- Docker `--mount` formatting breaks for host paths containing commas.
- Docker/Apple dev-server `logPath` is embedded unquoted in redirects.
- Runtime picker offers Apple Container on all macOS, including Intel.
- Targeted `runtime-resolution.test.ts` is currently red / stale.

## Checks noted

Sub-reviewers ran targeted Vitest suites and desktop typecheck in parts. Typecheck passed in focused runs, but at least one targeted runtime test is failing and should be fixed before merge.
