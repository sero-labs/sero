# Sero Runtime Strategy Plan

## Executive summary

Sero should provide one coherent feature set across supported platforms while allowing different runtime backends to provide different execution guarantees.

The recommended product model is:

> Sero works through managed workspace runtimes. Features should be available consistently across supported runtimes. Runtime choice should affect isolation, reproducibility, platform parity, and host integration, not whether core Sero features exist.

Recommended supported runtime policy:

| Platform | Supported runtime backends |
|---|---|
| macOS Apple Silicon | Mac Host Runtime, Apple Container Runtime, Docker/OpenShell Runtime |
| macOS Intel, if supported | Mac Host Runtime, Docker/OpenShell Runtime |
| Windows | Docker/OpenShell Runtime only |
| Linux | Docker/OpenShell Runtime only |

Making Docker/OpenShell a hard requirement for Windows and Linux is the right trade-off. It avoids building and supporting native host-runtime implementations for Windows and Linux while still giving users feature parity through a managed Linux runtime image.

For macOS, Sero should remain flexible. Mac users should be able to choose Host, Apple Containers, or Docker/OpenShell depending on whether they care most about low-friction local integration, native macOS container isolation, or portable Docker-based parity.

## Goals

The desired user experience is:

1. Install Sero.
2. Open or create a workspace.
3. Sero automatically selects the best available runtime.
4. Core features work without users manually installing dozens of dependencies.
5. Advanced users can change the runtime per workspace.
6. Runtime differences are explained as guarantees, not as confusing feature gaps.

Avoid this framing:

> Containers enabled = full Sero. Host mode = reduced Sero.

Use this framing instead:

> Same Sero features. Different runtime guarantees.

## Runtime model

Define runtime backends explicitly:

```ts
type RuntimeBackendKind =
  | 'mac-host'
  | 'apple-container'
  | 'docker-openshell';
```

Use a platform-aware support policy:

```ts
function supportedBackends(platform: NodeJS.Platform): RuntimeBackendKind[] {
  if (platform === 'darwin') {
    return ['mac-host', 'apple-container', 'docker-openshell'];
  }

  return ['docker-openshell'];
}
```

### User-facing runtime names

#### Mac Host Runtime

Runs directly on the Mac. Best for direct access to local tools, SDKs, keychains, simulators, local services, and existing host development environments. Lowest setup. Least isolated and least reproducible.

#### Apple Container Runtime

Runs each workspace in a macOS-native Linux container. Best for Apple Silicon users who want isolated, reproducible workspace execution with a managed Linux-like toolchain.

#### Docker/OpenShell Runtime

Runs each workspace in a Docker-backed OpenShell runtime. Best for cross-platform parity and consistent managed execution on macOS, Windows, and Linux.

## Platform policy

### macOS

macOS should support all available runtime styles:

- Mac Host Runtime
- Apple Container Runtime, where available
- Docker/OpenShell Runtime, where available

Recommended default order on macOS Apple Silicon:

1. Apple Container Runtime
2. Docker/OpenShell Runtime
3. Mac Host Runtime

Recommended default order on macOS Intel, if supported:

1. Docker/OpenShell Runtime
2. Mac Host Runtime

Mac Host Runtime should not be described as a broken fallback. It is a legitimate runtime for users who want direct local development.

### Windows

Windows should require Docker/OpenShell.

Do not try to support native Windows host execution as a first-class runtime unless Sero is ready to build and maintain Windows-specific implementations for shell execution, LSP, browser automation, process management, path handling, and dev-server control.

User-facing message:

> Sero uses Docker/OpenShell on Windows to provide a consistent managed Linux workspace runtime with the same Sero features available on other platforms.

### Linux

Linux should also require Docker/OpenShell.

Although Linux host execution is technically easier than Windows host execution, supporting arbitrary host distributions and package managers would still create a large support matrix. Docker/OpenShell gives Sero a controlled runtime image and reduces dependency drift.

User-facing message:

> Sero uses Docker/OpenShell on Linux to provide a consistent managed workspace runtime and avoid requiring users to manually install Sero's toolchain dependencies.

## Feature parity policy

All supported runtime backends should expose the same core Sero feature set:

| Feature | Mac Host | Apple Containers | Docker/OpenShell |
|---|---:|---:|---:|
| Chat and agent sessions | Yes | Yes | Yes |
| File browsing and editing | Yes | Yes | Yes |
| Shell / terminal | Yes | Yes | Yes |
| Agent coding tools | Yes | Yes | Yes |
| LSP / editor intelligence | Yes | Yes | Yes |
| Browser/app automation | Yes | Yes | Yes |
| Screenshots / recording | Yes | Yes | Yes |
| Managed dev servers | Yes | Yes | Yes |
| Dev-server previews | Yes | Yes | Yes |
| Plugin tools | Yes | Yes | Yes |
| Persistent memory | Yes | Yes | Yes |
| Runtime isolation | No | Yes | Yes |
| Linux-like runtime on macOS/Windows | No | Yes | Yes |
| Managed image toolchain | Partial or Sero-managed | Yes | Yes |
| Same-port multi-workspace behaviour | No, unless Sero adds host proxying | Yes | Yes |
| Container mount/network semantics | No | Yes | Yes |

The important distinction is that features should be available consistently, but runtime guarantees will differ.

## Actual technical limitations that are not easy to solve

### 1. Host runtime cannot provide container isolation

Mac Host Runtime runs directly on the user's machine. It cannot provide the same isolation boundary as a container runtime.

This affects:

- Agent shell commands
- File writes
- Network access
- Process cleanup
- Access to host secrets or unrelated files
- Accidental host mutation

Sero can add guardrails, permissions, protected paths, review flows, and confirmation prompts, but host execution will never be equivalent to container isolation.

### 2. Host runtime cannot guarantee Linux parity

Mac Host Runtime uses macOS semantics, not Linux semantics.

Differences include:

- Paths
- Shell behaviour
- Process signals
- File permissions
- Symlink behaviour
- Case sensitivity
- Available binaries
- Package manager behaviour
- Browser and tool installation paths

Container runtimes can provide a stable Linux-like environment. Mac Host Runtime cannot provide this without becoming a separate managed compatibility layer.

### 3. Host runtime cannot naturally provide port isolation

In container runtimes, multiple workspaces can often run servers on the same internal port because each workspace has an isolated runtime/network context.

In host runtime, two workspaces cannot both bind `localhost:3000` at the same time unless Sero adds extra indirection such as:

- Automatic port allocation
- A local reverse proxy
- Per-workspace proxy URLs
- Port rewriting

This is solvable, but not equivalent to native container network isolation.

### 4. Host dependency management is inherently messier

The Sero container image can preinstall a known baseline toolchain. Host machines may not have those tools, may have incompatible versions, or may behave differently.

Sero should not ask users to manually install a long list of dependencies. Instead, Sero should provide a managed toolchain for Sero-owned features.

### 5. Native Windows host execution is a large project

Native Windows host support would require separate handling for:

- Shells: PowerShell, CMD, Git Bash, MSYS2, WSL
- Path formats
- File URI handling
- Process trees
- Signals and termination
- Port discovery
- Tool installation
- LSP server binaries
- Browser automation dependencies
- Filesystem permissions and symlinks

This is why requiring Docker/OpenShell on Windows is recommended.

### 6. Docker/OpenShell has real constraints

Docker/OpenShell simplifies cross-platform parity, but it introduces real operational constraints:

- Docker/OpenShell must be installed and running.
- Runtime images consume disk space.
- First-run image pull/build can be slow.
- Bind mounts may be slower on macOS and Windows.
- Port mapping and localhost behaviour vary by platform.
- Windows file sharing can introduce permissions, line-ending, path, symlink, and performance issues.
- Corporate environments may restrict Docker.

These are acceptable trade-offs for Windows and Linux because they dramatically reduce Sero's native host support burden.

## Dependency strategy

### Do not require manual dependency installation

Users should not have to manually install dozens of dependencies to make Sero work.

Instead, divide dependencies into two classes.

### Sero-owned tools

Sero should manage tools required for Sero features, such as:

- Browser automation runtime
- Playwright browser assets
- ffmpeg
- LSP infrastructure and selected LSP servers
- Search helpers such as `ripgrep` and `fd`
- JSON helpers such as `jq`, if required
- Dev-server management helpers
- Process/port helper binaries
- Baseline Node/pnpm where needed for Sero operations

For container runtimes, these belong in the Sero runtime image.

For Mac Host Runtime, these should be installed into a Sero-managed toolchain directory rather than requiring users to install them globally.

Example:

```text
<SERO_HOME>/toolchains/
  darwin-arm64/
  darwin-x64/
```

### Project-owned tools

Project-specific dependencies should remain part of the project/runtime environment:

- Framework CLIs
- Project package managers
- Project SDKs
- Databases
- Language toolchains where project-specific
- Build systems

Sero should detect missing project tools and provide clear guidance, but it should not silently mutate the user's host machine.

## Architecture recommendations

### Replace the host/container boolean with runtime backends

Current terminology should move away from a binary container/host model.

Replace capability names such as:

```ts
'browserAutomation'
'containerizedLanguageServers'
'managedDevServers'
'containerMounts'
```

with backend-neutral capability names:

```ts
type RuntimeCapability =
  | 'shell'
  | 'filesystem'
  | 'lsp'
  | 'browserAutomation'
  | 'managedDevServers'
  | 'screenshots'
  | 'recording'
  | 'managedToolchain'
  | 'isolatedExecution'
  | 'linuxEnvironment'
  | 'portIsolation'
  | 'runtimeMounts';
```

### Introduce a runtime backend interface

Create a runtime interface that all execution backends implement:

```ts
interface RuntimeBackend {
  kind: 'mac-host' | 'apple-container' | 'docker-openshell';
  platform: 'darwin' | 'linux' | 'win32';

  workspaceHostPath: string;
  workspaceRuntimePath: string;

  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  spawn(command: string, args: string[], options?: SpawnOptions): RuntimeProcess;

  resolveRuntimePath(hostPath: string): string;
  resolveHostPath(runtimePath: string): string;

  ensureTool(tool: RuntimeTool): Promise<ToolAvailability>;
  resolvePreviewUrl(port: number): Promise<string>;

  capabilities(): RuntimeCapabilityReport;
}
```

### Move feature implementations onto runtime providers

Features should call runtime abstractions rather than `containerManager` directly.

For example:

```ts
await runtime.lsp.start(languageId);
await runtime.browser.launch(url);
await runtime.devServers.register(params);
await runtime.exec(command, options);
```

Not:

```ts
await containerManager.exec(workspaceId, command);
```

### Suggested backend-specific implementations

#### MacHostBackend

- Uses real workspace paths.
- Uses host shell and process APIs.
- Uses Sero-managed host toolchain for Sero-owned dependencies.
- Uses `localhost` for previews.
- Does not provide isolation, Linux parity, or port isolation.

#### AppleContainerBackend

- Uses Apple container runtime.
- Uses `/workspace` inside the runtime.
- Uses Sero container image.
- Uses container execution, container networking, and container mounts.
- Best default for Apple Silicon macOS where available.

#### DockerOpenShellBackend

- Uses Docker/OpenShell runtime.
- Uses `/workspace` inside the runtime.
- Uses Sero Docker/OpenShell image.
- Uses Docker/OpenShell port mapping or a Sero preview proxy.
- Required runtime for Windows and Linux.

## Browser automation recommendation

Browser automation should be available in every supported runtime.

Implementation options:

- Apple Container Runtime: use image-installed `agent-browser`, Playwright Chromium, and ffmpeg.
- Docker/OpenShell Runtime: use image-installed `agent-browser`, Playwright Chromium, and ffmpeg.
- Mac Host Runtime: use Sero-managed Playwright/Chromium/ffmpeg under Sero's toolchain directory.

The user should not have to install Playwright, Chromium, or ffmpeg manually.

## LSP recommendation

LSP should be available in every supported runtime.

Implementation model:

- Container runtimes: LSP servers run inside the runtime, rooted at `/workspace`.
- Mac Host Runtime: LSP servers run on the Mac, rooted at the actual workspace path.
- Windows/Linux: LSP runs inside Docker/OpenShell only.

This avoids native Windows/Linux LSP complexity while preserving feature parity for users.

## Managed dev-server recommendation

Managed dev servers should be available in every supported runtime.

Implementation model:

- Container runtimes: Sero starts/stops/restarts dev servers inside the runtime and resolves preview URLs through container networking, mapped ports, or a Sero proxy.
- Mac Host Runtime: Sero starts/stops/restarts host processes and uses `localhost` or a Sero preview proxy.
- Windows/Linux: dev servers run inside Docker/OpenShell only.

For the best UX, Sero should hide container IPs and platform-specific port mapping details behind a stable preview URL.

Example:

```text
http://workspace.local.sero/preview/<workspace>/<server>
```

or another Sero-managed local proxy format.

## Onboarding UX recommendation

### First-run flow

The first-run flow should be short:

1. Welcome
2. Runtime detection
3. Recommended runtime selection
4. Optional sign-in/provider setup
5. Open workspace

### macOS first run

If Apple Containers are available:

```text
Recommended runtime: Apple Containers
Provides isolated workspaces, managed Linux tooling, and fewer host dependency issues.
```

If Docker/OpenShell is available but Apple Containers are not:

```text
Recommended runtime: Docker/OpenShell
Provides a portable managed workspace runtime.
```

If no container runtime is available:

```text
Recommended runtime: Mac Host
Sero will run directly on your Mac. You can add Apple Containers or Docker/OpenShell later for stronger isolation and reproducibility.
```

### Windows/Linux first run

```text
Sero requires Docker/OpenShell on Windows and Linux.

This gives Sero a managed Linux workspace runtime with consistent tools, browser automation, language servers, previews, and dev-server management.
```

Offer one primary action:

```text
Set up Docker/OpenShell
```

Offer one secondary action:

```text
Run diagnostics
```

Do not show a long manual dependency checklist.

## Runtime picker UX

Per workspace, expose a simple runtime selector.

### macOS

```text
Runtime
* Auto recommended
* Mac Host
* Apple Containers
* Docker/OpenShell
```

### Windows/Linux

```text
Runtime
* Docker/OpenShell
```

If the runtime is unavailable:

```text
Docker/OpenShell is required for Sero on this platform and is not currently running.
```

## Diagnostics UX

Diagnostics should be available but not part of normal onboarding unless something fails.

Show statuses like:

```text
Runtime: Docker/OpenShell running
Sero runtime image: Installed
Workspace mount: OK
Preview networking: OK
Browser automation runtime: OK
LSP runtime: OK
Project package manager: pnpm found
```

For Mac Host Runtime:

```text
Runtime: Mac Host
Sero browser runtime: Installed
Sero LSP toolchain: Installed
Project Node.js: Found
Container isolation: Not available in this runtime
Port isolation: Not available in this runtime
```

## Error message guidance

Error messages should be direct and actionable.

### Missing Docker/OpenShell on Windows/Linux

```text
Docker/OpenShell is required to run Sero workspaces on Windows and Linux.
Install or start Docker/OpenShell, then retry.
```

### Missing Sero-managed tool

```text
Sero needs to install its managed browser automation runtime.
This is used for screenshots, page inspection, and browser actions.
```

### Host port conflict

```text
Port 3000 is already in use on your Mac.
Choose another port or switch this workspace to a container runtime for port isolation.
```

### Host/Linux mismatch

```text
This project appears to expect a Linux environment.
Switch to Apple Containers or Docker/OpenShell for Linux runtime parity.
```

## What not to do

1. Do not describe Host as a degraded fallback in the UI.
2. Do not require Windows/Linux native host parity.
3. Do not ask users to manually install a long dependency list.
4. Do not make Docker/OpenShell the new universal feature gate on macOS.
5. Do not promise identical semantics across runtimes.
6. Do not expose container IPs, port scanners, mount details, or runtime internals unless troubleshooting.
7. Do not use Nvidia branding in a way that implies a GPU is required for normal Sero, unless GPU functionality is actually needed.

## Recommended wording

### Product-level wording

> Sero uses managed runtimes to keep your agent workspace consistent across platforms. On macOS, you can run directly on your Mac, in Apple Containers, or with Docker/OpenShell. On Windows and Linux, Sero uses Docker/OpenShell for a consistent managed workspace.

### Runtime guarantee wording

> All supported runtimes provide the same core Sero features. Runtimes differ in isolation, reproducibility, Linux parity, port behaviour, and host integration.

### Host wording

> Mac Host Runtime is best when you want Sero to work directly with your existing local tools and services. It does not provide container isolation or Linux runtime parity.

### Docker/OpenShell wording

> Docker/OpenShell Runtime is Sero's portable managed runtime for Windows, Linux, and macOS. It provides a consistent Linux workspace with Sero's toolchain included.

## Implementation roadmap

### Phase 1: Product model cleanup

- Rename user-facing container mode to runtime.
- Rename host fallback to Mac Host Runtime.
- Add a workspace runtime picker.
- Add backend-neutral capability reporting.
- Clarify Windows/Linux require Docker/OpenShell.

### Phase 2: Runtime backend abstraction

- Introduce `RuntimeBackend` interface.
- Wrap existing Apple container code as `AppleContainerBackend`.
- Add `DockerOpenShellBackend`.
- Keep existing host code as `MacHostBackend`.
- Replace direct feature calls to `containerManager.exec` with runtime backend calls.

### Phase 3: Feature parity work

- Refactor LSP to use runtime backend.
- Refactor browser automation to use runtime backend.
- Refactor dev-server registry to use runtime backend.
- Add Mac Host implementations where needed.
- Add Docker/OpenShell implementations.

### Phase 4: Managed toolchains

- Create Sero-managed host toolchain directory.
- Add installer/repair flows for browser automation, ffmpeg, LSP, and helper tools.
- Add runtime image versioning and update flow.
- Add diagnostics for tool availability.

### Phase 5: Simplified onboarding

- Auto-detect best runtime.
- Reduce first-run setup to one recommended action.
- Hide advanced runtime details unless requested.
- Provide clear repair flows when runtime checks fail.

## Final recommendation

The best user experience is:

1. One Sero feature set.
2. Multiple runtime backends.
3. Docker/OpenShell required on Windows and Linux.
4. Mac users can choose Host, Apple Containers, or Docker/OpenShell.
5. Sero owns its own feature dependencies through managed images or managed host toolchains.
6. Runtime differences are presented as guarantees, not missing features.

This gives Sero a simple and transparent story:

> Install Sero. Open a workspace. Sero chooses the best runtime. Everything core works. Containers improve isolation, reproducibility, Linux parity, and port behaviour, but they do not define what Sero is allowed to do.
