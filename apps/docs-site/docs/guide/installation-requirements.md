# Installation / Requirements

Use this checklist to choose an install path and prepare the runtime Sero will use. For exact platform, artifact, and runtime support, always use [Support Scope](/reference/support-scope) as the canonical contract.

## 1. Choose an install path

Most beta users should download the packaged desktop installer for their platform from [GitHub Releases](https://github.com/sero-labs/sero/releases). GitHub Releases lists the exact current filenames; public docs use generic artifact names so they do not go stale between beta releases.

Supported packaged beta artifacts are:

- macOS Apple Silicon: DMG installer
- Linux x64/arm64: Debian package (`.deb`)
- Windows x64: setup EXE installer

Developers and contributors can still build from source on supported targets. Use the source path when you are modifying Sero, testing a branch, or contributing a fix.

New beta releases may require manual download and installation unless release notes say otherwise. Windows SmartScreen or unknown-publisher warnings may apply during beta.

On macOS, Sero is Developer ID-signed and notarized by Apple, so the DMG opens without Gatekeeper warnings. The Windows build is not yet signed, so SmartScreen may still warn on first install.

## 2. Check your platform

Sero's public beta currently targets:

- macOS Apple Silicon
- Linux x64/arm64
- Windows x64

Intel-based Macs are not a Sero target. Windows arm64 is future/unsupported in the current beta.

## 3. Install local tooling for source builds

Packaged desktop installers include the desktop application, but your projects may still require their own language runtimes, compilers, or package managers.

Install the repository development toolchain only when you plan to build Sero from source:

- **Node.js 22**
- **pnpm 10**
- Git and the normal compiler/build tools for your OS when your project needs native dependencies

Sero-managed Host tools live under `~/.sero-ui/toolchains/<manifest-version>/`, but Sero does not install native compiler stacks such as Xcode Command Line Tools, Linux `build-essential`/gcc/make, or MSVC/Windows SDK.

## 4. Choose runtime prerequisites

If you are unsure which runtime to choose, use the default **Host** runtime on a supported platform. Host runs commands in your real workspace folder and uses your system tools.

Install container tooling only when you plan to explicitly select a container runtime for a workspace:

| Runtime choice | When to install it | Requirement |
| --- | --- | --- |
| Host | Default on supported platforms | Compatible local shell and project tools |
| Apple Container | You want Apple-native container execution on macOS arm64 | Apple's `container` CLI at `/usr/local/bin/container` |
| Docker / Podman | You want Docker-compatible container execution on macOS arm64, Linux, or Windows | Working Docker or Podman engine |

For Apple Container, verify:

```bash
/usr/local/bin/container --help
/usr/local/bin/container system status
```

For Docker / Podman, verify at least one command succeeds:

```bash
docker info
podman info
```

The workspace runtime picker labels this option **Docker / Podman**, but the saved backend ID remains `docker`. Sero prefers Docker when both CLIs are available, can retry Podman if auto-selected Docker cannot reach its daemon, and respects explicit overrides such as `SERO_CONTAINER_ENGINE=podman` or `SERO_DOCKER_BIN=/path/to/binary`.

Selected container runtimes report diagnostics when unavailable; they do not silently become Host.

## 5. Understand browser automation readiness

Host browser automation requires both:

1. an available browser pack for your platform, and
2. a passing Environment Doctor launch check.

Browser packs are available for macOS arm64, Linux x64, Linux arm64, and Windows x64 when Doctor reports them ready. Container runtimes use browser automation from the Sero runtime image.

## 6. Install project dependencies for source builds

Skip this section if you installed a packaged desktop beta and are not building Sero from source.

From the repo root:

```bash
pnpm install
```

The install flow runs native-module repair hooks for `node-pty` and `better-sqlite3`.

## Related docs

- [Support Scope](/reference/support-scope)
- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
