# Host-mode platform support

Host-mode support follows `HOST_RELEASE_TARGETS` in `apps/desktop/electron/features/workspace/runtime/host-support-matrix.json`. The matrix below is the current beta release support target. Host browser automation is supported on release-supported platforms when the published browser pack is available and Environment Doctor passes. Future releases must keep browser-pack publication and smoke-test gates green before claiming support for a new artifact.

| Platform | Arch | Host runtime | Host browser pack | Packaged app | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | arm64 | Supported; default | Published GitHub Release artifact (`browser-darwin-arm64`) | DMG | Release-supported beta target |
| macOS | x64 | Unsupported | Not published | Not published | Unsupported |
| Linux | x64 | Supported; default | Published GitHub Release artifact (`browser-linux-x64`) | DEB | Release-supported beta target |
| Linux | arm64 | Supported; default | Published GitHub Release artifact (`browser-linux-arm64`) | DEB | Release-supported beta target |
| Windows | x64 | Supported; default | Published GitHub Release artifact (`browser-win32-x64`) | setup EXE | Release-supported beta target |
| Windows | arm64 | Not defaulted | Not published | Not published | Future/unsupported |

Supported-platform host browser automation uses the browser-pack manifest and published GitHub Release assets. `pnpm --filter @sero/desktop browser-pack:verify-published` must verify each release-supported artifact before a future release claims browser automation support on that platform.

Current repository metadata should keep every release-supported target available. Pending entries for release-supported targets are future release blockers, not instructions for users to build local packs. Windows arm64 may remain pending because it is not a release-supported beta target.

## Required release gates

Run these before claiming desktop release support:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
pnpm --filter @sero/desktop verify:host-mode-release
```

Then run the `release` workflow. The workflow is the platform gate for host smoke and packaged app artifacts on macOS arm64, Linux, and Windows x64.

## Local artifact diagnostic path

`SERO_BROWSER_PACK_BASE_URL` and locally served browser-pack archives are developer diagnostics for rebuilding or debugging the current platform pack. They are not the supported install path for release-supported platforms and must not be used to make a release claim pass.
