# Host-mode platform support

Host-mode support follows `HOST_RELEASE_TARGETS` in `apps/desktop/electron/features/workspace/runtime/host-support-matrix.json`. The matrix below is the intended release support target; the final support claim is release-gated until the browser-pack artifacts are published and the host-mode release workflow passes.

| Platform | Arch | Host runtime | Host browser pack | Packaged app | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | arm64 | Supported; default | Required published GitHub Release artifact (`browser-darwin-arm64`) | DMG/ZIP | Release-supported target |
| macOS | x64 | Unsupported | Not published | Not published | Future/unsupported |
| Linux | x64 | Supported; default | Required published GitHub Release artifact (`browser-linux-x64`) | AppImage/deb/tar.gz | Release-supported target; blocked until artifact/workflow gate passes |
| Linux | arm64 | Supported; default | Required published GitHub Release artifact (`browser-linux-arm64`) | AppImage/deb/tar.gz | Release-supported target; blocked until artifact/workflow gate passes |
| Windows | x64 | Supported; default | Required published GitHub Release artifact (`browser-win32-x64`) | NSIS/ZIP | Release-supported target; blocked until artifact/workflow gate passes |
| Windows | arm64 | Not defaulted | Not published | Not published | Future/unsupported |

Supported-platform host browser automation uses the browser-pack manifest and published GitHub Release assets at `https://github.com/sero-labs/sero/releases/download/browser-pack-2026-05-16/<slug>.tar.gz`. `pnpm --filter @sero/desktop browser-pack:verify-published` must verify each release-supported artifact before docs or releases claim browser automation support on that platform.

Current repository metadata may still have pending entries in `apps/desktop/electron/features/workspace/runtime/browser-pack/generated-artifacts.json`. Pending release-supported entries are release blockers, not instructions for users to build local packs.

## Required release gates

Run these before claiming host-mode release support:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop verify:host-mode-release
```

Then run the `host-mode-release` workflow. The workflow is the platform gate for host smoke and packaged app artifacts on macOS arm64, Linux, and Windows x64.

## Local artifact diagnostic path

`SERO_BROWSER_PACK_BASE_URL` and locally served browser-pack archives are developer diagnostics for rebuilding or debugging the current platform pack. They are not the supported install path for release-supported platforms and must not be used to make a release claim pass.
