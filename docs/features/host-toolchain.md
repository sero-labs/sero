# Host managed toolchain

Sero's packaged app uses a host-first runtime model. Host mode prefers compatible tools already installed on the machine, but Sero-owned operations can install managed tools when required tools are missing or incompatible.

This document describes runtime behavior for users and future workers. Source contributors may still need to install Node, pnpm, Git, and platform build dependencies to work on Sero itself.

## Storage

Managed host tools are stored under the fixed Sero root, not the active profile and not the Pi agent directory:

```txt
~/.sero-ui/toolchains/<manifest-version>/
├── manifest.json
├── .installed
├── node/
├── git/
├── shell/
├── bin/
└── browser/
```

Implementation uses `SERO_FIXED_ROOT` from `apps/desktop/electron/platform/env/index.ts`, which resolves to `~/.sero-ui`. Do not store shared toolchains under `SERO_HOME`, `~/.sero`, `~/.pi/agent`, or `~/.sero-ui/agent`.

Installers download into staging paths, verify pinned SHA-256 checksums, and atomically activate final directories. Core tools share a version-level `.installed` marker that is removed before any core install and written only after every required core tool resolves successfully; absence of `.installed` means the managed toolchain version is incomplete and must not be used for PATH resolution. Non-core artifacts write the marker only after their own activation/verification completes. Concurrent installs for the same manifest/artifact attach to the same in-flight operation.

## Resolution order

For each tool, Sero resolves in this order:

1. Compatible verified system tool.
2. Existing Sero-managed tool under `SERO_FIXED_ROOT/toolchains/<manifest-version>/`.
3. Managed first-use install when policy allows.
4. Typed install failure with retry/fallback metadata.

Verification runs version or smoke commands; PATH presence alone is not trusted. Sero does not mutate user shell profiles, global PATH, npm prefixes, or Corepack state.

## Tool tiers

| Tier | Tools | Install behavior |
| --- | --- | --- |
| Core | `node`, `npm`, `pnpm`, `git`, `ssh`, `bash`/compatible shell | Auto-install on first Sero-owned use when missing/incompatible. |
| Small convenience | `rg`, `fd`, `jq`, `gh`, `curl`, `zip`, `unzip` | Install on demand for Sero features or declared dependencies. |
| Large optional | Browser automation pack | Explicit/onboarding/settings install or first browser-tool use. |
| Not managed | Xcode CLT, Linux build-essential/gcc/make, MSVC/Windows SDK | User-installed or use a container fallback. |

Windows host mode is native Windows execution with a verified Git Bash/MSYS-compatible shell; it is not WSL by default.

## Browser automation pack

Host browser automation is install-state-aware:

- `installable`: a published pack is missing and can be installed.
- `missing`: the platform is known but no published artifact is available yet; use container fallback or the local diagnostic path while rebuilding artifacts.
- `installing`: a pack install is in progress.
- `ready`: pack is installed and Doctor launch checks pass.
- `failed`: install or launch failed; retry and container fallback details should be shown.

The host release matrix targets macOS arm64/x64, Linux x64/arm64, and Windows x64 browser-pack publication; Windows arm64 remains future/unsupported. See [`../reference/host-mode-support.md`](../reference/host-mode-support.md) for the platform table and release gates. The final support claim is blocked until every release-supported artifact is published to GitHub Releases and `pnpm --filter @sero/desktop browser-pack:verify-published` passes. The pack lives below the same fixed toolchain root, under `~/.sero-ui/toolchains/<manifest-version>/browser/`, with its own `.installed` marker. It includes pinned browser/driver/ffmpeg metadata and platform-specific executable candidates.

Docker/Podman and Apple Container continue to provide browser automation from the runtime image/container environment without requiring the host browser pack.

## Native build tools

Sero never auto-installs compiler stacks. Native-build failures in Sero-owned install/build/LSP flows are classified into typed metadata with platform instructions and container fallback actions.

Use containers when projects need Linux parity, sandboxing, preinstalled browser automation, or native compiler stacks that are not installed on the host.

## Path policy

Host execution uses the real host workspace path as cwd. `/workspace` is only a compatibility alias accepted by Sero file/runtime APIs and translated internally.

Do not create a real `/workspace` symlink, mount, or global directory on the host. New prompts, tools, and plugin APIs should prefer relative paths rooted at cwd or backend-provided temp/workspace helpers.
