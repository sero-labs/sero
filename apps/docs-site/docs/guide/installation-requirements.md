# Installation / Requirements

Use this checklist before building Sero from source. For exact platform and runtime support, always use [Support Scope](/reference/support-scope) as the canonical contract.

## 1. Check your platform

Sero's source-only alpha currently targets:

- macOS Apple Silicon
- Linux x64/arm64
- Windows x64

Intel-based Macs are not a Sero target. Windows arm64 is future/unsupported in the current alpha.

## 2. Install required local tooling

Install:

- **Node.js 22**
- **pnpm 10**
- Git and the normal compiler/build tools for your OS when your project needs native dependencies

Sero-managed Host tools live under `~/.sero-ui/toolchains/<manifest-version>/`, but Sero does not install native compiler stacks such as Xcode Command Line Tools, Linux `build-essential`/gcc/make, or MSVC/Windows SDK.

## 3. Choose runtime prerequisites

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

## 4. Understand browser automation readiness

Host browser automation requires both:

1. an available browser pack for your platform, and
2. a passing Environment Doctor launch check.

Browser packs are available for macOS arm64, Linux x64, Linux arm64, and Windows x64 when Doctor reports them ready. Container runtimes use browser automation from the Sero runtime image.

## 5. Install project dependencies

From the repo root:

```bash
pnpm install
```

The install flow runs native-module repair hooks for `node-pty` and `better-sqlite3`.

## Related docs

- [Support Scope](/reference/support-scope)
- [Development Setup](/guide/development-setup)
- [Troubleshooting](/reference/troubleshooting)
