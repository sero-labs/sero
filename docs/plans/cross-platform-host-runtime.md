# Cross-platform host runtime rollout notes

Status: superseded by the host-first runtime implementation. This document now records current behavior and rollout checks.

## Current runtime model

Sero supports three canonical local runtime backend IDs:

```ts
export type RuntimeBackendId = 'host' | 'docker' | 'apple-container';
export type DeprecatedRuntimeBackendId = 'mac-host';
```

`mac-host` is read-time compatibility only and normalizes to `host`.

| Capability | Host | Docker / Podman | Apple Container |
| --- | --- | --- | --- |
| macOS | Yes | Yes | Apple Silicon recommended |
| Linux | Yes | Yes | No |
| Windows x64 | Yes, native Windows host mode | Yes | No |
| Browser automation | Installable browser pack | Preinstalled | Preinstalled |
| Native build tools | User-installed or container fallback | Image-provided | Image-provided |
| Sandbox | No | Container isolation | Container isolation |

Windows host mode is native Windows execution with a verified Git Bash/MSYS-compatible shell. WSL is not the default runtime strategy.

## Default rollout

New workspace host defaulting is gated by `SERO_HOST_FIRST=1`:

- With `SERO_HOST_FIRST=1`, new non-global workspaces default to `host` on supported macOS, Linux, and Windows x64.
- With the flag off, legacy non-global defaults remain in place during rollout.
- The global workspace defaults to `host` on supported host platforms.
- Existing persisted `runtime.backend` values remain authoritative.
- Containers are optional upgrades/fallbacks and are not silently selected just because Docker/Podman/Apple Container is detected.

## Host path policy

Host execution uses the real host workspace path. `/workspace` is a compatibility alias accepted by Sero APIs and translated internally; it is not a required real host path.

Container execution continues to use `/workspace` because that is the actual in-container mount point.

## Managed host tooling

Packaged-app host mode resolves tools through the managed toolchain layer:

1. compatible verified system tool,
2. managed tool already installed under `~/.sero-ui/toolchains/<manifest-version>/`,
3. first-use managed install when policy permits,
4. typed failure with retry/fallback metadata.

The storage root comes from `SERO_FIXED_ROOT`; toolchains do not live under `SERO_HOME`, `~/.sero`, or `~/.pi/agent`. Managed installers stage downloads, verify pinned hashes, atomically activate artifacts, and write `.installed` last.

Native compiler stacks are explicitly not managed. Sero classifies native-build failures and offers platform instructions or container fallback.

## Browser automation

Host browser automation is install-state-aware:

- missing pack: `installable`, with onboarding/settings/first-use install action,
- in-flight pack: `installing`, with progress,
- installed and Doctor-launchable: `ready`,
- install/launch failure: `failed`, with retry or container fallback.

The browser pack is a large optional add-on stored under `~/.sero-ui/toolchains/<manifest-version>/browser/`. Docker/Podman and Apple Container provide browser automation through their runtime images.

## Validation before removing the flag

Automated:

```bash
pnpm --filter @sero/desktop test -- apps/desktop/electron/__tests__/features/workspace/runtime
pnpm --filter @sero/desktop test -- apps/desktop/electron/__tests__/features/workspace/workspace-runtime-config.test.ts
pnpm --filter @sero/desktop test -- apps/desktop/electron/__tests__/features/workspace/runtime-resolution.test.ts
pnpm --filter @sero/desktop test -- apps/desktop/electron/__tests__/ipc/runtime-boundaries.test.ts apps/desktop/electron/__tests__/ipc/workspace-runtime-installs.test.ts apps/desktop/electron/__tests__/ipc/preload-api-subscriptions.test.ts
pnpm --filter @sero/desktop typecheck
pnpm typecheck
```

Manual smoke:

- macOS host: file ops, Git, terminal, pnpm install/dev, LSP, preview, browser pack install/use.
- Linux host: same plus browser launch Doctor shared-library failure path.
- Windows x64 host: file ops, Git, terminal, Node/pnpm, dev server, preview, browser pack install/use.
- Browser pack: install, progress, retry/failure, ready launch check, uninstall.
- Container fallback: switch workspace to Docker/Podman or Apple Container after native-build failure.
- Existing workspace regression: persisted Docker/Apple Container workspace remains container-backed after host-first flag.

Detailed checklists live in `docs/reference/runtime-smoke.md` and `docs/reference/runtime-manual-test.md`.

## Remaining rollout risks

- Managed artifact signing/notarization and download availability must be verified per release.
- Windows Git Bash/MSYS behavior may diverge from POSIX shell expectations in agent-authored commands.
- Host process/port inspection can be platform-sensitive and needs repeated smoke coverage.
- Linux browser launch may fail on missing system shared libraries; Doctor/fallback copy must stay actionable.
- Host mode is not a sandbox; containers remain the recommended isolation and native-build fallback path.
