# Host-first runtime manual testing guides

Use these guides to validate Sero's host-first runtime behavior from a clean tester perspective. They include source setup, first-time Sero setup, host runtime checks, optional container runtime checks, browser automation pack validation, native-build fallback checks, cleanup, and pass/fail criteria.

- [macOS Apple Silicon](./macos-apple-silicon.md) — validates Host, Apple Container, and Docker.
- [Linux](./linux.md) — validates Host and Docker/Podman.
- [Windows x64](./windows.md) — validates native Windows Host and Docker Desktop Linux containers.

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
