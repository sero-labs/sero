# Host runtime manual testing guides

Use these guides to validate Sero's Host runtime behavior from a clean tester perspective. They include source setup, first-time Sero setup, host runtime checks, optional container runtime checks, browser automation pack validation, native-build fallback checks, cleanup, and pass/fail criteria.

- [macOS Apple Silicon](./macos-apple-silicon.md) — validates Host, Apple Container, and Docker.
- [Linux](./linux.md) — validates Host and Docker/Podman on x64/arm64 release targets.
- [Windows x64](./windows.md) — validates native Windows Host and Docker Desktop Linux containers. Windows arm64 is future/unsupported.

Run Sero normally. Host is the default runtime on release-supported Host platforms:

```bash
pnpm dev
```

On Windows PowerShell:

```powershell
pnpm dev
```

These guides are for source-based manual validation. Packaged-app testers can skip the source-development prerequisite sections and start at the first-time Sero setup/runtime sections.

## Host-mode release support

| Platform | Arch | Host runtime | Host browser pack | Packaged app | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | arm64 | Supported; default | `browser-darwin-arm64` published/available | DMG | Release-supported beta target |
| macOS | x64 | Unsupported | Not published | Not published | Unsupported |
| Linux | x64/arm64 | Supported; default | `browser-linux-x64` / `browser-linux-arm64` published/available | DEB | Release-supported beta target |
| Windows | x64 | Supported; default | `browser-win32-x64` published/available | setup EXE | Release-supported beta target |
| Windows | arm64 | Not defaulted | Not published | Not published | Future/unsupported |

Browser-pack note: supported-platform install uses published GitHub Release artifacts verified by `pnpm --filter @sero/desktop browser-pack:verify-published`. Release-supported beta targets should be installable from published browser packs; pending metadata for a future release-supported target is a release blocker rather than an expected user install path. Local artifact smoke is only a developer diagnostic/rebuild path. See [`../../host-mode-support.md`](../../host-mode-support.md).

Required release gates:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
```

Then run the `release` workflow.
