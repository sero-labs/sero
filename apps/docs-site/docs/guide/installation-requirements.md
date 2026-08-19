# Install Sero

## 1. Download Sero

Download the packaged desktop installer from [GitHub Releases](https://github.com/sero-labs/sero/releases). The release page gives the exact filenames.

Choose the file for your system:

- macOS Apple Silicon: DMG installer
- Linux x64/arm64: Debian package (`.deb`) for Debian/Ubuntu, or AppImage (`.AppImage`) for any distribution
- Windows x64: setup EXE installer

Build from source only when you are modifying Sero, testing a branch, or contributing a fix.

Packaged Sero starts an update check when it opens and checks again every six hours. On supported update targets, such as macOS, Windows, and Linux AppImage, it can download an update and ask you to restart. A DEB install can check for a release, but it cannot install that release during restart. Download and install the new Debian package yourself.

Check the release notes for signing information. macOS builds can use an ad-hoc signature, and Windows can show a SmartScreen or unknown-publisher warning for an unsigned build.

## 2. Check your platform

Sero currently targets:

- macOS Apple Silicon
- Linux x64/arm64
- Windows x64

Intel-based Macs are not a Sero target. Windows arm64 is not a current target.

## 3. Install the tools your projects need

The packaged installer includes Sero. It does not include every language runtime, compiler, or package manager that your projects use. The **Host** workspace runtime uses the project tools installed on your computer.

Install the tools required by each project before you use it in Host mode. A
container runtime can provide a separate project environment instead.

## 4. Choose where Sero runs commands

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

## 5. Check browser automation

Host browser automation requires both:

1. an available browser pack for your platform, and
2. a passing Environment Doctor launch check.

Browser packs are available for macOS arm64, Linux x64, Linux arm64, and Windows x64 when Doctor reports them ready. Container runtimes use browser automation from the Sero runtime image.

## 6. Build Sero from source

Skip this section if you installed the packaged desktop application and are not building Sero from source.

Install:

- **Node.js 22**
- **pnpm 10**
- Git
- the compiler tools for your OS if a dependency contains native code

From the repo root:

```bash
pnpm install
```

The install flow runs native-module repair hooks for `node-pty` and `better-sqlite3`.

## Related docs

- [Support Scope](/reference/support-scope)
- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
