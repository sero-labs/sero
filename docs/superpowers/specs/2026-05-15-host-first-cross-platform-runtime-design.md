# Host-first cross-platform runtime — design

Status: Draft (updated). Authored 2026-05-15; revised for host-first managed/on-demand tooling.

## Summary

Make **host mode the default workspace runtime** on macOS Apple Silicon, Linux, and Windows x64, while keeping container runtimes as an optional compatibility/sandbox upgrade. Host mode should feel close to container mode for day-to-day Sero functionality — file ops, Git, terminals, language servers, dev servers, previews, package installs, and browser automation — but without promising container-grade sandboxing or full Linux/native-build parity.

The product rule is:

> Use compatible host tools when available. If a required tool is missing or too old, Sero installs a managed copy automatically on first use with clear progress UX, then retries the original action where possible.

Containers remain supported and useful for:

- secure isolation / sandboxing
- Linux environment parity
- browser automation preinstalled out of the box
- native build toolchains / compiler-heavy projects
- cases where a host feature fails Doctor checks

Browser automation is a major Sero feature. In host mode it is a **recommended large add-on**, not a hidden optional feature: Sero should offer it during onboarding/first workspace setup, auto-trigger installation on first browser tool use, and expose status/install/uninstall in Runtime settings.

## Goals

- Host mode is the default for new workspaces on macOS Apple Silicon, Linux, and Windows x64.
- Users should not manually install complex toolchains before Sero is useful.
- Sero prefers compatible system tools to avoid unnecessary downloads.
- Sero auto-installs required managed tools on first use when system tools are missing/incompatible.
- Tool installation has clear, resumable UX with progress, failure details, and retry.
- Browser automation works in host mode after one-click/first-use browser pack installation.
- Container runtimes are optional, never silently auto-selected just because detected.
- Container runtimes remain the recommended fallback for native build failures and sandboxing.
- Source contributors can still be expected to have Node/pnpm/git installed to run Sero from source.

## Non-goals

- Bundling OS native build toolchains by default.
  - No automatic Xcode Command Line Tools install.
  - No automatic Visual Studio/MSVC Build Tools install.
  - No automatic Linux `build-essential` install.
- Providing a secure sandbox in host mode.
- Making `/workspace` a universal host-mode shell path. `/workspace` remains a container mount path and legacy/API compatibility alias, not a host execution contract.
- WSL2 integration as the default Windows host strategy.
- Remote/cloud runtime providers or profile-based sandbox policy controls.
- Reimplementing user-facing ecosystem tools such as Git or Node in TypeScript.

## Runtime model

| Runtime | Default? | Best for | Browser automation | Native build tools | Sandbox |
| --- | --- | --- | --- | --- | --- |
| Host | Yes | Low-friction local work | Installed add-on | User-installed or container fallback | No |
| Docker / Podman | Optional | Linux parity, fallback, isolation | Built-in | Built-in image deps | Yes-ish container isolation |
| Apple Container | Optional macOS arm64 | Apple-native container backend | Built-in | Built-in image deps | Yes-ish container isolation |

## Path policy

Do not add complexity by pretending every backend has the same absolute filesystem path.

`/workspace` exists because containers need a stable in-container mount point. In host mode it is not a real portable path: macOS/Linux/Windows workspaces live at their actual host paths. Host-first support should therefore stop treating `/workspace` as a universal agent/user-facing path.

Rules:

- Container execution uses `/workspace` because that is the actual container mount.
- Host execution uses the real workspace path as cwd.
- Sero file APIs may continue accepting `/workspace/...` as a compatibility alias and translate it internally.
- New tools, prompts, browser flows, and plugin APIs should prefer relative paths or backend-provided cwd/temp helpers.
- Do not create a real host `/workspace` symlink, mount, or global directory.
- Do not add more path abstraction layers unless a specific call site genuinely needs them; prefer removing hard-coded absolute paths.

Keep three path categories explicit:

1. **Execution paths** — real host paths in host mode; `/workspace` inside containers.
2. **Virtual/editor paths** — UI/file API aliases such as `/workspace/...`, `/sero-source/...`, or plugin virtual roots.
3. **Prompt/tool paths** — preferably relative paths rooted at the command cwd, avoiding backend-specific absolute paths.

Portable command examples should look like:

```bash
pnpm install
git status
cat package.json
```

not:

```bash
cat /workspace/package.json
```

This reduces divergence: host looks like the host, containers look like containers, and shared code avoids absolute workspace paths where possible.

## Dependency policy

### Source/dev mode

Running Sero from source may require the developer to install:

- Node matching the repo requirement
- pnpm matching `packageManager`
- Git
- a shell suitable for the platform

This is acceptable because source development already requires these tools.

### Packaged app host mode

The packaged Electron app must not assume the user has workspace tools installed just because Electron embeds Node internally. Agents, terminals, package scripts, plugin dev sessions, and LSP installers need real CLI tools available in the workspace environment.

Sero therefore resolves tools through a `HostToolResolver` / `ToolchainManager` using this order:

1. Compatible verified system tool.
2. Existing Sero-managed tool.
3. First-use managed install with visible progress.
4. Actionable failure with retry or container fallback.

Install triggers are scoped:

- **Sero-owned operations** declare required tools and call `ensure()` before execution.
- **Agent/user shell commands** are not parsed aggressively. If a command fails with a missing-tool signature, Sero may offer an install-and-retry flow, but command parsing must remain best-effort.
- Skills/plugins that rely on non-core CLIs should declare dependencies or call resolver-backed APIs rather than assuming ambient host `PATH`.

### Tool tiers

#### Core required tools — auto-install on first use

These are required for normal host-mode functionality:

- `node`
- `npm`
- `pnpm` as a Sero-managed standalone executable when a compatible system `pnpm` is unavailable
- `git`
- `ssh`
- shell command runner
  - POSIX shell on macOS/Linux
  - Git Bash / MSYS-compatible bash on Windows, preferably managed if no compatible system install exists
  - Windows managed shell artifact must include the basic Unix userland agents expect (`coreutils`, `findutils`, `grep`/`sed`/`awk` or equivalents) while still treating Windows host mode as native Windows execution, not Linux parity

Behavior:

- Use a compatible system install when present.
- If missing/incompatible, auto-install Sero-managed tools.
- Show progress and retry the original operation when possible.

#### Small convenience tools — auto-install on first use

These are small enough to keep as binaries rather than reimplementing everywhere:

- `rg`
- `fd`
- `jq`
- `gh`
- `curl`
- `zip` / `unzip`

Behavior:

- Use compatible system tools when present.
- Install managed versions when a Sero feature, skill, or agent command first needs them.
- Do not block initial app launch for these unless a startup feature requires them.

Rationale: these binaries are small compared with Electron, Git-for-Windows, Node, or browser assets. Replacing them solely to reduce binary count is not worth the compatibility cost.

#### Large/optional tools — install with explicit UX

- Browser automation pack: Chromium + Playwright browser assets + ffmpeg + required runtime glue.
- Python/uv, if a feature or skill requires Python.

Behavior:

- Browser automation is prominently offered during onboarding/first workspace setup.
- Browser automation auto-triggers on first browser tool use if not installed.
- Python installs only when a Python-dependent feature/skill is used.

#### Never bundled by default

Native build tools / compiler stacks:

- macOS Xcode Command Line Tools (`clang`, `make`, SDK headers)
- Linux `build-essential`, `gcc/g++`, `make`, system headers
- Windows Visual Studio/MSVC Build Tools, Windows SDK, node-gyp compiler stack

If `npm install`, `pnpm install`, plugin dev repair, or LSP setup fails with native-build signatures (`node-gyp`, missing `make`, missing compiler, MSVC/Xcode errors), Sero should show:

- detected cause
- platform-specific install instructions
- one-click “Switch this workspace to container runtime” when a container runtime is available
- container setup instructions when no compatible Docker/Podman/Apple Container runtime is installed

Native compilation is a **container advantage / optional host capability**, not a host-mode prerequisite.

## Storage layout

Do not use `~/.sero` or `~/.pi/agent`.

Managed host tooling should live under Sero’s fixed root so multiple profiles do not redownload the same tools:

```txt
~/.sero-ui/toolchains/<manifest-version>/
├── manifest.json
├── .installed
├── node/
├── git/
├── shell/
├── bin/
└── browser/                 # large add-on, installed explicitly/first-use
```

Implementation should use exported Sero env/root helpers, not hard-coded paths. If profile-specific isolation is later required, add an explicit setting rather than changing the default silently.

Lifecycle and security requirements:

- Install into a temporary staging directory, verify checksums, then atomically rename into place.
- Write `.installed` last; absence of `.installed` means the artifact is incomplete and must not be used.
- Allow only one in-flight install per artifact/version; concurrent `ensure()` calls await the same operation.
- Failed or digest-mismatched installs delete partial artifacts before retry.
- Keep the current manifest version plus one previous version; garbage-collect older toolchain directories on app start after no running workspace uses them.
- Managed artifacts must come from app-bundled/pinned manifest URLs with SHA-256 verification. Do not activate unsigned or unpinned executable downloads.
- Handle platform trust systems explicitly: notarized/signed upstream artifacts where possible, deliberate macOS quarantine handling, and clear SmartScreen/Gatekeeper failure remediation.

## Architecture overview

New/changed units:

- `ToolchainManager`
  - Resolves tool paths.
  - Verifies system tools.
  - Installs managed artifacts on first use.
  - Emits progress/status events for renderer UX.
- `HostToolResolver`
  - Thin API consumed by host substrates, Doctor, plugin dev sessions, browser tooling, and Sero-owned internals.
  - Prevents scattered `command -v` / `execFile('foo')` checks.
- `WindowsHostSubstrate`
  - Adds Windows host runtime support using a verified shell and native path handling.
- `BrowserToolchainInstaller`
  - Installs/removes/verifies the host browser automation pack.
- `HostProcessInspector` / `HostPortInspector` / `HostProcessKiller`
  - Replaces host-mode dependence on Unix-specific command assumptions (`pgrep`, Linux `ss`, Unix `kill`) for Sero-owned dev-server management.
  - “Native adapter” means platform-correct behavior with Node APIs or OS-bundled tools where appropriate; it does not require pure-JS process/port discovery on every OS.
- Runtime capability install-state resolver
  - Separates static backend support from currently installed/verified host add-ons.

Modified units include:

- `platform-default.ts` — defaults new workspaces to `host` after rollout flag.
- `host-substrate-factory.ts` — no Windows throw; returns Windows substrate.
- `posix-substrate.ts` / `windows-substrate.ts` — use `ToolchainManager` for env/PATH preparation.
- `host-doctor.ts` — toolchain-aware checks and browser pack checks.
- `capabilities.ts` / `runtime-resolution.ts` — capability availability reflects install state; browser automation is no longer hard-coded container-only.
- `RuntimePickerMenu` and workspace creation — host preselected; containers shown as optional upgrades with capability diff.
- Browser automation tool implementation — remove Linux/container-only assumptions before enabling host browser support.

## Toolchain resolution

### Manifest

The manifest is shipped with the Electron app and pins managed artifacts by platform/arch.

```ts
type ToolchainManifest = {
  version: string;
  artifacts: Record<ArtifactKey, ArtifactSpec>;
};

type ToolName =
  | 'node'
  | 'npm'
  | 'pnpm'
  | 'git'
  | 'ssh'
  | 'bash'
  | 'rg'
  | 'fd'
  | 'jq'
  | 'gh'
  | 'curl'
  | 'zip'
  | 'unzip';

type ArtifactSpec = {
  tool: ToolName;
  platform: 'darwin' | 'linux' | 'win32';
  arch: 'x64' | 'arm64';
  url: string;
  sha256: string;
  unpackTo: string;
  binPaths: Record<string, string>;
  minVersion?: string;
  installPolicy: 'core' | 'on-demand' | 'large-explicit';
};
```

System tools are not trusted solely because they appear on `PATH`. Each tool has a verifier, for example:

- `node --version` satisfies Sero’s global host-runtime floor. Workspace `engines` constraints are advisory diagnostics and should not trigger managed Node version thrash by default.
- `pnpm --version` satisfies Sero’s package-manager floor. Prefer standalone managed `pnpm`; avoid mutating user/global Corepack state for host isolation.
- `git --version` works and `ssh` probe can run.
- shell can execute `echo ok` in the target workspace cwd.
- Windows bash handles native cwd/env correctly.

### API

```ts
class ToolchainManager {
  resolve(tool: ToolName): Promise<ToolResolution>;
  ensure(tool: ToolName, reason: ToolInstallReason): Promise<ToolResolution>;
  ensureCore(reason: ToolInstallReason): Promise<CoreEnsureResult>;
  status(tool: ToolName): Promise<ToolStatus>;
  binDirs(): Promise<string[]>;
  browserStatus(): Promise<BrowserPackStatus>;
  ensureBrowser(reason: BrowserInstallReason): Promise<BrowserPackStatus>;
}

type ToolResolution =
  | { source: 'system'; path: string; version?: string }
  | { source: 'managed'; path: string; version?: string };
```

Important behavior:

- Resolution is lazy.
- First-use install is allowed for required tools.
- Renderer receives structured progress events.
- Concurrent installs for the same artifact are deduplicated; callers share the same promise/status stream.
- Installs are atomic: download/unpack to staging, verify, rename, then mark installed.
- Failed installs are resumable/retryable.
- Digest mismatches delete the partial artifact and retry only with explicit managed artifact URLs.
- Managed binaries prepend to runtime `PATH` only when selected by resolver.

## Host substrate changes

### Shared behavior

Both POSIX and Windows substrates should prepare a runtime env that includes resolved managed/system tool paths.

```ts
async shellCommand(opts): Promise<HostSubstrateRendered> {
  const shell = await this.tools.ensure('bash', { reason: 'workspace-shell' });
  return {
    program: shell.path,
    args: opts.loginShell ? ['--login', '-c', opts.command] : ['-c', opts.command],
    nativeCwd: this.toNativeHostPath(opts.cwd),
    env: await this.prepareEnv(opts.env),
  };
}
```

The current command-rendering substrate methods (`shellCommand`, `execFileCommand`, `terminalCommand`) are synchronous even though many substrate file operations are already async. Either make command rendering async or ensure tool resolution/env preparation happens before these methods are called.

### POSIX host

- Prefer verified system shell/tools when compatible.
- Managed tools are prepended for Sero-run commands when installed/selected.
- Interactive terminals can still honor the user’s `SHELL` if it passes basic verification.

### Windows host

Windows host mode should not depend on pretending every Unix tool behaves identically under Git Bash.

Required support:

- shell exec through verified Git Bash/MSYS bash or managed equivalent
- native Node path handling for file ops
- PATH handling that respects Windows `Path`/`PATH` casing
- terminal via `node-pty` launching the verified shell
- Git/Node/pnpm commands through resolver
- dev-server process/port management through native adapters, not Unix-only commands

`HostRuntimeSubstrate.kind` should become `'posix' | 'windows'`. Drop the stale `'wsl'` kind unless a real WSL substrate is deliberately added later.

## Sero-owned TypeScript replacements

Use TypeScript/Node implementations where the binary is only an implementation detail of Sero itself.

Replace or avoid new usage of:

- `pgrep`
- cross-platform assumptions around `lsof`
- `ss`
- `netstat`
- shell `kill`
- `curl` for Sero-owned HTTP downloads
- `jq` for Sero-owned JSON handling
- `zip`/`unzip` for Sero-owned archive handling when a JS library is simpler
- `gh` for Sero-owned GitHub API calls where feasible

Do **not** reimplement user-facing tools whose CLI compatibility matters:

- Git
- SSH
- Node/npm/pnpm
- shell command execution
- browser binaries

## Browser automation pack

Browser automation is a first-class Sero capability.

Host-mode behavior:

1. During onboarding or first workspace creation, offer:
   - “Install browser automation pack now? Required for automation browser/computer-use tools. Large download.”
2. If skipped, first browser tool use returns a typed installable requirement.
3. Renderer shows install dialog/progress.
4. Installer downloads/verifies Chromium, Playwright browser assets, ffmpeg, and required runtime glue.
5. Original browser action retries after install when possible.

Browser tooling must become platform-aware before enabling host support. Current container assumptions to remove/refactor include:

- hard-coded `/ms-playwright`
- Linux-only Chromium paths like `chrome-linux/chrome`
- hard-coded `/tmp` screenshot paths where Windows support is required
- hard-coded `/workspace` output paths; use relative paths or adapter-provided workspace/temp paths
- `sh -lc` assumptions
- auto `npm install -g agent-browser` into arbitrary host global npm without resolver control; this must be removed before host browser support is enabled
- Linux-only ffmpeg lookup/linking

The browser pack manifest must pin the Playwright package/driver version, browser revision, ffmpeg revision/path, expected `PLAYWRIGHT_BROWSERS_PATH`, and platform executable candidates. Browser pack installation follows the same atomic staging/verify/rename rules as other large artifacts.

If a browser tool call arrives while installation is already in flight, it should attach to the existing install progress and retry after success when the original action is safe to retry. If the user cancels or installation fails, the tool call returns a typed failure with retry metadata.

Introduce a browser runtime adapter:

```ts
type BrowserRuntimeAdapter = {
  browsersPath: string;
  chromiumExecutableCandidates: string[];
  ffmpegCandidates: string[];
  tempDir: string;
  env: Record<string, string>;
};
```

Linux host caveat: Playwright Chromium may require system shared libraries. Doctor must verify launchability. If launch fails due to missing OS libraries, offer platform instructions or container mode.

Container runtimes continue to include browser automation by default.

## Native build failure flow

Do not preinstall or auto-install native build tools.

Add failure classifiers for commands Sero commonly runs:

- dependency install
- plugin dev repair
- plugin package build
- LSP/tool setup

Patterns include:

- `node-gyp` / `gyp ERR!`
- missing executable names such as `make`, `gcc`, `g++`, `clang`, `cl.exe`, `msbuild`, or Python for node-gyp
- MSVC / Visual Studio Build Tools missing
- Xcode Command Line Tools missing

Classifiers should prefer structured signals and executable/tool names where possible. Localized human text such as “command not found” is a hint, not the only source of truth.

UX:

> This project needs native build tools. Host mode does not install compiler stacks automatically. Install platform build tools or switch this workspace to container mode.

Actions:

- “Show install instructions”
- “Switch workspace to container runtime” when available
- “Set up a container runtime” when no compatible container backend is installed
- “Retry”

## Capability model

Current runtime capabilities are mostly static. Host-first needs static support plus per-host/per-workspace availability state. Static support answers “can this backend ever do this?”; availability answers “can this workspace do this right now after installed tools and Doctor checks?”

Add a resolver such as:

```ts
type RuntimeCapabilityState = {
  support: RuntimeCapabilities;
  available: RuntimeCapabilities;
  installState: {
    coreTools: 'ready' | 'installing' | 'missing' | 'failed';
    browserAutomation: 'ready' | 'installable' | 'installing' | 'failed';
    nativeBuildTools: 'available' | 'missing' | 'unknown';
  };
};
```

Important changes:

- `browserAutomation` availability is not container-only.
- Host browser automation is available when browser pack is installed and Doctor launch check passes.
- Native build tools are reported separately from normal package manager availability.
- Runtime audit/detail copy should distinguish:
  - unsupported
  - installable
  - installing
  - failed Doctor check
  - available through container runtime

## RuntimePicker and workspace creation

New workspace default:

- Host is preselected on all supported platforms.
- Containers are shown as optional upgrades when detected or installable.
- Existing workspaces keep their persisted backend.
- Deprecated `mac-host` normalization remains read-only compatibility.

Picker copy:

- **Host (recommended)** — “Fast local runtime. Uses your system tools where compatible and installs missing Sero-managed tools automatically. No sandbox.”
- **Docker / Podman** — “Containerized Linux runtime. Adds isolation, preinstalled browser automation, and common native build dependencies.”
- **Apple Container** — “Apple-native container runtime on supported Macs. Adds isolation and preinstalled runtime dependencies.”

Capability diff examples:

- Container adds: sandbox isolation, Linux parity, native build tools, browser preinstalled.
- Host add-on available: browser automation pack.

## Doctor checks

Host Doctor should no longer simply fail on Windows.

Checks:

- `runtime.host.core-tools` — core tool resolver status.
- `runtime.host.shell` — shell can execute in workspace cwd.
- `runtime.host.git` — Git version and basic repo command work.
- `runtime.host.ssh` — SSH probe can run; GitHub auth fallback available if SSH unavailable.
- `runtime.host.node` — Node/npm/pnpm status.
- `runtime.host.small-tools` — optional/on-demand tools status.
- `runtime.host.browser` — browser pack installed and launchable, or installable.
- `runtime.host.process-management` — native process/port inspector works.
- `runtime.host.native-build-tools` — informational only; never blocks host mode.

Doctor remediations should call managed install handlers where applicable instead of telling users to manually install small/core tools.

## Error handling

Typed errors:

- `TOOL_REQUIRED`
  - includes tool name, install policy, reason, and installable flag.
- `TOOL_INSTALL_FAILED`
  - includes artifact, URL host, digest status, and retryable flag.
- `TOOL_VERSION_INCOMPATIBLE`
  - includes found version and required version.
- `BROWSER_PACK_REQUIRED`
  - installable typed error for browser tool calls.
- `BROWSER_PACK_INSTALL_FAILED`
  - retryable with detail.
- `BROWSER_LAUNCH_FAILED`
  - can suggest OS libs or container mode.
- `NATIVE_BUILD_TOOLS_REQUIRED`
  - non-installable by Sero; suggests OS install or container.

Renderer behavior:

- Installable errors show a clear progress dialog/toast.
- Original action retries after successful install when safe.
- Failed install has retry and “use container instead” where relevant.
- In-flight installable requirements attach to the existing install operation instead of starting duplicate downloads.

## Testing

Automated:

- `ToolchainManager` resolver tests:
  - compatible system tool
  - incompatible system tool
  - missing tool first-use install
  - digest mismatch
  - offline failure
  - retry/resume
  - concurrent ensure deduplication
  - atomic install activation and stale partial cleanup
  - platform trust/quarantine failure handling
- Windows substrate rendering/env/path tests.
- Host process/port adapter tests per platform with mocked OS output/APIs.
- Host Doctor install-state tests.
- Capability resolver tests for browser pack installed/missing/failed.
- Browser adapter tests for macOS/Linux/Windows candidate paths/env.
- Native build failure classifier tests.

Manual smoke:

- macOS host: file ops, Git, terminal, pnpm install/dev, LSP, preview, browser pack install/use.
- Linux host: same plus browser launch Doctor shared-library check.
- Windows x64 host: file ops, Git, terminal, Node/pnpm, dev server, preview, browser pack install/use.
- Container fallback: switch workspace to Docker/Apple Container after host native-build failure.

Docs to update:

- `docs/features/runtime-provider-architecture.md`
- `docs/features/host-toolchain.md` (new)
- `docs/reference/runtime-smoke.md`
- `docs/reference/runtime-manual-test.md`
- `docs/plans/cross-platform-host-runtime.md`

## Rollout

1. Ship tool resolver and install UX without changing defaults.
2. Replace Sero-owned Unix process/port dependencies with native adapters.
3. Add Windows host substrate and host Doctor support; replace stale `HostRuntimeSubstrate.kind = 'wsl'` typing with explicit `'windows'` support.
4. Add browser pack install flow and platform-aware browser adapter.
5. Add native-build failure classifier and container fallback UX, including the branch where no container runtime is installed.
6. Flip new workspace default to host behind `SERO_HOST_FIRST=1` for one release, with per-platform kill switches if Windows/macOS/Linux readiness diverges.
7. Remove flag once smoke matrix is stable.

Existing workspaces are unaffected. Persisted `runtime.backend` remains authoritative.
