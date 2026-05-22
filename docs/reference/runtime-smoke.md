# Runtime smoke matrix

Use this checklist before shipping runtime changes. Sero covers local direct-host or bind-mounted runtimes only: Host, Docker/Podman, and Apple Container. Remote execution, cloud runtimes, and policy sandbox flows are out of scope.

## Coverage matrix

| Platform | Arch | Backend | Coverage |
| --- | --- | --- | --- |
| macOS | arm64 | Host | Required; default runtime |
| macOS | x64 | Host | Future/unsupported; do not use for release sign-off |
| Linux | x64/arm64 | Host | Required; default runtime |
| Windows | x64 | Host | Required; default runtime |
| Windows | arm64 | Host | Future/unsupported; not defaulted |
| macOS | arm64 | Apple Container | Required container fallback smoke |
| macOS | arm64/x64 | Docker Desktop or Podman | Required container fallback smoke |
| Linux | x64/arm64 | Docker Engine or Podman | Required container fallback smoke |
| Windows | x64 | Docker Desktop or Podman | Manual container fallback smoke |

Host is the default for new workspaces on supported platforms. Existing workspaces keep their persisted backend. `SERO_HOST_FIRST` was migration scaffolding and no longer changes defaults.

Browser automation on host requires the browser pack. The release target matrix is documented in [`host-mode-support.md`](./host-mode-support.md): macOS arm64, Linux x64/arm64, and Windows x64 are release-supported targets; macOS on Intel CPUs is explicitly unsupported; Windows arm64 remains a possible future target. Supported-platform install uses published GitHub Release browser-pack artifacts verified by `pnpm --filter @sero/desktop browser-pack:verify-published`. Until pending entries in `generated-artifacts.json` are published and the `host-mode-release` workflow passes, the release claim remains blocked. Docker/Podman and Apple Container provide browser automation from the image. Native build tools are not Sero-managed on host; use platform-installed compiler stacks or switch to a container runtime.

Required release gates:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
```

Then run the `host-mode-release` workflow.

## Core host checklist

Run on release-supported macOS Apple Silicon, Linux, and Windows x64 with backend ID `host`.

1. Start Sero normally:
   ```bash
   pnpm dev
   ```
2. Create a new non-global workspace and confirm runtime diagnostics show Host as selected/recommended.
3. Confirm a persisted Docker/Apple Container workspace remains on its persisted backend after restart.
4. Run file ops through the editor/API using `/workspace/...`; confirm the real host workspace file changes and no real host `/workspace` directory is required.
5. Run an agent/runtime command:
   ```bash
   pwd
   git status --short
   pnpm --version
   ```
   Expect execution in the real host cwd. UI/API aliases may still render `/workspace` for compatibility.
6. Open an interactive terminal and confirm it starts in the workspace. On Windows, confirm it launches through verified Bash/MSYS-compatible shell, not WSL/PowerShell/cmd defaulting.
7. Start LSP for a TypeScript/JavaScript file and confirm diagnostics/completions initialize.
8. Start a managed dev server, open the preview, stop, and restart it. Preview URL must be `http://127.0.0.1:<port>`.
9. Run two workspaces concurrently and confirm preview host ports do not collide.
10. Run Environment Doctor and confirm core tools, shell, Git/SSH, process management, browser pack, and native-build status are reported with install/fallback actions.

## Managed toolchain checks

1. Locate the fixed toolchain root: `~/.sero-ui/toolchains/<manifest-version>/`.
2. Confirm managed artifacts, if installed, are under `SERO_FIXED_ROOT` and not under profile-local `SERO_HOME`, `~/.sero`, or `~/.pi/agent`.
3. Confirm `.installed` is present for ready managed artifacts.
4. In Runtime settings, trigger core tool install/retry when status permits and verify progress/failure details are visible.
5. Confirm Sero does not run `corepack enable`, mutate shell profiles, or require global `npm install -g` for managed tools.

## Host browser pack checks

Run published install smoke on each release-supported host after its GitHub Release artifact exists and `browser-pack:verify-published` passes. Use the local artifact smoke below only as a developer diagnostic/rebuild path, not as supported release validation.

### Local host browser-pack artifact smoke

Build the current-platform pack, smoke the staged payload, serve the artifact from `apps/desktop/dist`, and point the desktop manifest at the local server:

```bash
pnpm --filter @sero/desktop browser-pack:build -- \
  --platform $(node -p "process.platform") \
  --arch $(node -p "process.arch") \
  --url-base http://127.0.0.1:8787/browser-pack/2026-05-16

pnpm --filter @sero/desktop browser-pack:smoke -- \
  --pack-root dist/browser-pack/work/browser-$(node -p "process.platform")-$(node -p "process.arch")/browser \
  --platform $(node -p "process.platform") \
  --arch $(node -p "process.arch")

python3 -m http.server 8787 --directory apps/desktop/dist
```

In a second terminal:

```bash
SERO_BROWSER_PACK_BASE_URL=http://127.0.0.1:8787/browser-pack/2026-05-16 \
pnpm dev
```

Artifact rules:

- Archives are written to `apps/desktop/dist/browser-pack/2026-05-16/<slug>.tar.gz` and must not be committed.
- Staging output is under `apps/desktop/dist/browser-pack/work/...` and must not be committed.
- Generated metadata/digests are committed in `apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json`.
- The pack unpacks directly into the installer `browser` root and includes Playwright Chromium, Playwright ffmpeg, and pack-local `agent-browser/bin/agent-browser`; no global `npm install -g agent-browser` is required.
- Production publishing uses GitHub Release assets at `https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16/<slug>.tar.gz`; update generated metadata to `available: true` with URL, SHA, and size only after the asset is uploaded.

### UI install and automation smoke

1. With browser pack absent on a release-supported platform whose artifact is published, confirm runtime diagnostics show browser automation as `installable`, not ready. If the platform's metadata is still pending, confirm diagnostics show the artifact as unavailable/non-installable with container fallback and treat this as release-blocking.
2. Trigger install from onboarding/settings or first browser tool use only when a published artifact is available. When testing a local diagnostic artifact, keep the static server running and start Sero with `SERO_BROWSER_PACK_BASE_URL` as shown above.
3. Confirm large-download copy, progress, retryable failure detail, and in-flight dedupe behavior.
4. After install, confirm status is `ready` only after Doctor launch checks pass.
5. Confirm installed files live under `~/.sero-ui/toolchains/<manifest-version>/browser/`, including Chromium, ffmpeg, pack-local `agent-browser`, `browser-manifest.json`, and `.installed`.
6. Run a host `automation_browser` smoke action such as launching `about:blank` or `https://example.com` and taking a screenshot. Confirm adapter-provided browser paths/env and pack-local PATH prefixes are used.
7. On Linux, simulate or test missing shared libraries and confirm Doctor shows actionable OS library instructions or container fallback. The artifact producer does not install compiler stacks or host shared libraries.
8. Uninstall the browser pack from Runtime settings and confirm status returns to `installable`.

## Container fallback checklist

Run with Docker/Podman and Apple Container where supported.

1. Select the container backend explicitly; Sero should not silently switch merely because a container engine is detected.
2. Run `pwd && uname -s` from agent `bash`; expect `/workspace` and `Linux`.
3. Create a file from the runtime; confirm the host editor can read, edit, and delete it without sync.
4. Create or edit a file on the host; confirm runtime `cat` sees the change immediately.
5. Open an interactive terminal and confirm it starts in `/workspace`.
6. Run Git status/diff/commit flow and confirm auth injection still works.
7. Run browser automation; expect it to work without host browser pack install.
8. Start a managed dev server, open the gateway preview, then stop and restart it.
9. Confirm preview URLs resolve through `http://127.0.0.1:<hostPort>` and not container bridge IPs.
10. Run Environment Doctor and confirm missing runtime, stopped daemon, image, mount, permission, and port failures are actionable.

## Native build fallback smoke

1. On host, run or simulate a Sero-owned install/build flow that fails with `node-gyp`, missing `make/gcc/clang`, missing Python for node-gyp, Xcode CLT, or MSVC Build Tools.
2. Confirm Sero returns `NATIVE_BUILD_TOOLS_REQUIRED` metadata, not an attempted compiler install.
3. Confirm UI offers platform install instructions plus “switch this workspace to container runtime” when a compatible container backend is available.
4. Switch to Docker/Podman or Apple Container and retry the flow.

## Notes to record

For each platform smoke, record:

- OS version and CPU architecture.
- Sero runtime backend and whether it was persisted or the platform default.
- Managed toolchain manifest version and browser pack state.
- Container engine/image tag when using containers.
- Workspace path, especially Windows paths with spaces or non-ASCII characters.
- Any file watcher, ACL, shared-library, shell, or preview-port anomalies.
