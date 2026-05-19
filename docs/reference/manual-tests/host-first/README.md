# Host-first runtime manual testing guides

Use these guides to validate Sero's host-first runtime behavior from a clean tester perspective. They include source setup, first-time Sero setup, host runtime checks, optional container runtime checks, browser automation pack validation, native-build fallback checks, cleanup, and pass/fail criteria.

- [macOS Apple Silicon](./macos-apple-silicon.md) — validates Host, Apple Container, and Docker.
- [Linux](./linux.md) — validates Host and Docker/Podman on x64/arm64 release targets.
- [Windows x64](./windows.md) — validates native Windows Host and Docker Desktop Linux containers. Windows arm64 is future/unsupported.

Run with host-first defaults enabled while the rollout is flag-gated:

```bash
SERO_HOST_FIRST=1 pnpm dev
```

On Windows PowerShell:

```powershell
$env:SERO_HOST_FIRST = "1"
pnpm dev
```

These guides are for source-based manual validation. Packaged-app testers can skip the source-development prerequisite sections and start at the first-time Sero setup/runtime sections.

## Host-mode release support

| Platform | Arch | Host runtime | Host browser pack | Packaged app | Status |
| --- | --- | --- | --- | --- | --- |
| macOS | arm64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | DMG/ZIP | Release-supported target |
| macOS | x64 | Unsupported | Not published | Not published | Future/unsupported |
| Linux | x64/arm64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | AppImage/deb/tar.gz | Release-supported target |
| Windows | x64 | Supported with `SERO_HOST_FIRST=1` | Required published GitHub Release artifact | NSIS/ZIP | Release-supported target |
| Windows | arm64 | Not defaulted | Not published | Not published | Future/unsupported |

Browser-pack note: supported-platform install uses published GitHub Release artifacts verified by `pnpm --filter @sero/desktop browser-pack:verify-published`. Pending entries in `generated-artifacts.json` block the final release claim; local artifact smoke is only a developer diagnostic/rebuild path. See [`../../host-mode-support.md`](../../host-mode-support.md).

Required release gates:

```bash
pnpm typecheck
pnpm test
pnpm --filter @sero/desktop browser-pack:verify-published
```

Then run the `host-mode-release` workflow.
